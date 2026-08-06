import assert from "node:assert/strict";
import { test } from "node:test";

import { createGeoClient, GeoTestnetConfig } from "@geoprotocol/geo-sdk";
import { privateKeyToAccount } from "viem/accounts";

import {
  createPublishingRuntime,
  findPersonalSpaceId,
  graphqlData,
  requirePersonalSpaceId,
  safeErrorMessage,
  withRequestTimeout,
} from "../bin/runtime.mjs";

const PRIVATE_KEY_BODY = "11".repeat(32);
const PREFIXED_PRIVATE_KEY = `0x${PRIVATE_KEY_BODY}`;

test("prefixed and unprefixed private keys create the expected signer", () => {
  const expectedAddress = privateKeyToAccount(PREFIXED_PRIVATE_KEY).address;

  const prefixed = createPublishingRuntime({ privateKey: PREFIXED_PRIVATE_KEY });
  const unprefixed = createPublishingRuntime({ privateKey: PRIVATE_KEY_BODY });

  assert.equal(prefixed.signer.address, expectedAddress);
  assert.equal(unprefixed.signer.address, expectedAddress);
  assert.equal(prefixed.address, expectedAddress);
});

test("missing and malformed private keys fail before clients are created without exposing input", () => {
  for (const privateKey of [undefined, "", "definitely-not-a-private-key", "0x1234"]) {
    let accountCalls = 0;
    let geoCalls = 0;

    assert.throws(
      () =>
        createPublishingRuntime({
          privateKey,
          privateKeyToAccountFn() {
            accountCalls += 1;
          },
          createGeoClientFn() {
            geoCalls += 1;
          },
        }),
      (error) => {
        assert.match(error.message, /GEO_PRIVATE_KEY/);
        if (privateKey) assert.doesNotMatch(error.message, new RegExp(privateKey));
        return true;
      },
    );

    assert.equal(accountCalls, 0);
    assert.equal(geoCalls, 0);
  }
});

test("the runtime configures Geo eagerly and the sponsored wallet lazily", async () => {
  const signer = { address: "0x1111111111111111111111111111111111111111" };
  const geo = { api: {} };
  const wallet = { sendTransaction() {} };
  const calls = [];

  const runtime = createPublishingRuntime({
    privateKey: PREFIXED_PRIVATE_KEY,
    privateKeyToAccountFn(privateKey) {
      calls.push(["signer", privateKey]);
      return signer;
    },
    createGeoClientFn(params) {
      calls.push(["geo", params]);
      return geo;
    },
    async createGeoWalletClientFn(params) {
      calls.push(["wallet", params]);
      return wallet;
    },
  });

  assert.equal(runtime.network, GeoTestnetConfig);
  assert.equal(runtime.geo, geo);
  assert.equal(runtime.address, signer.address);
  assert.deepEqual(calls[0], ["signer", PREFIXED_PRIVATE_KEY]);
  assert.equal(calls[1][0], "geo");
  assert.equal(calls[1][1].network, GeoTestnetConfig);
  assert.equal(typeof calls[1][1].fetch, "function");

  assert.equal(await runtime.createWallet(), wallet);
  assert.deepEqual(calls[2], ["wallet", { signer, network: GeoTestnetConfig }]);
});

test("the runtime fetch wrapper supplies a timeout and preserves caller cancellation", async () => {
  const requests = [];
  const wrappedFetch = withRequestTimeout(async (input, init) => {
    requests.push({ input, init });
    return { ok: true };
  });

  await wrappedFetch("https://example.test/without-signal");
  assert.ok(requests[0].init.signal instanceof AbortSignal);

  const caller = new AbortController();
  await wrappedFetch("https://example.test/with-signal", { signal: caller.signal });
  assert.notEqual(requests[1].init.signal, caller.signal);
  assert.equal(requests[1].init.signal.aborted, false);
  caller.abort();
  assert.equal(requests[1].init.signal.aborted, true);
});

test("the configured Geo client reports HTTP failures", async () => {
  let requestedUrl;
  const geo = createGeoClient({
    network: GeoTestnetConfig,
    fetch: async (url) => {
      requestedUrl = url;
      return {
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        async text() {
          return "maintenance";
        },
      };
    },
  });

  await assert.rejects(
    graphqlData(geo, "query { spaces(first: 1) { id } }", "looking up identity"),
    /GraphQL request failed: 503 Service Unavailable: maintenance/,
  );
  assert.equal(requestedUrl, `${GeoTestnetConfig.apiOrigin}/graphql`);
});

test("error reporting redacts prefixed and unprefixed forms of a private key", () => {
  assert.equal(
    safeErrorMessage(
      new Error(`provider rejected ${PREFIXED_PRIVATE_KEY} (${PRIVATE_KEY_BODY})`),
      PREFIXED_PRIVATE_KEY,
    ),
    "provider rejected [redacted] ([redacted])",
  );
});

test("GraphQL errors and missing data produce distinct failures", async () => {
  await assert.rejects(
    graphqlData(
      { api: { graphql: async () => ({ errors: [{ message: "permission denied" }] }) } },
      "query { spaces(first: 1) { id } }",
      "looking up identity",
    ),
    /GraphQL errors while looking up identity: permission denied/,
  );

  await assert.rejects(
    graphqlData(
      { api: { graphql: async () => ({}) } },
      "query { spaces(first: 1) { id } }",
      "looking up identity",
    ),
    /did not include data while looking up identity/,
  );
});

test("an absent personal space has its own actionable failure", async () => {
  const address = "0x1111111111111111111111111111111111111111";
  const geo = {
    api: {
      graphql: async () => ({ data: { spaces: [] } }),
    },
  };

  assert.equal(await findPersonalSpaceId(geo, address), null);
  assert.throws(
    () => requirePersonalSpaceId(null, address),
    /No personal space found for signer 0x1111.*Create one before publishing/,
  );
});
