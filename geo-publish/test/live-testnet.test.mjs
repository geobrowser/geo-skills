import assert from "node:assert/strict";
import { test } from "node:test";

import { GeoTestnetConfig } from "@geoprotocol/geo-sdk";
import { SpaceRegistryAbi } from "@geoprotocol/geo-sdk/abis";
import { encodeFunctionData } from "viem";

import {
  assertDaoAuthorization,
  assertGeoTestnetConfig,
  assertTransactionIntent,
  readLiveTestEnvironment,
  redactError,
  runLiveAcceptance,
} from "./live-testnet-helpers.mjs";

const PRIVATE_KEY = `0x${"11".repeat(32)}`;
const PERSONAL_SPACE_ID = "11111111111111111111111111111111";
const DAO_SPACE_ID = "22222222222222222222222222222222";
const TOPIC_ID = "33333333333333333333333333333333";
const REGISTRY = GeoTestnetConfig.contracts.SPACE_REGISTRY_ADDRESS;
const ZERO_BYTES_16 = `0x${"00".repeat(16)}`;
const ZERO_BYTES_32 = `0x${"00".repeat(32)}`;

test("stable 0.20.1 config selects the current testnet, Ultra Relay, and Contracts V2", () => {
  assert.doesNotThrow(() => assertGeoTestnetConfig(GeoTestnetConfig));
  assert.equal(GeoTestnetConfig.chain.id, 55516);
  assert.equal(GeoTestnetConfig.apiOrigin, "https://api-testnet.geobrowser.io");
  assert.match(GeoTestnetConfig.sponsorship.rpcUrl, /[?&]provider=ULTRA_RELAY(?:&|$)/);
  assert.doesNotMatch(GeoTestnetConfig.sponsorship.rpcUrl, /[?&]selfFunded=/);
  assert.equal(
    GeoTestnetConfig.contracts.SPACE_REGISTRY_ADDRESS,
    "0xCF13491802747e759e1BB8E364bc43045398d1DD",
  );
  assert.equal(
    GeoTestnetConfig.contracts.DAO_SPACE_FACTORY_ADDRESS,
    "0x323aF429B85c954D4a161b2A6281c26DF45b7128",
  );
});

test("the default gate skips without reading credentials", () => {
  assert.deepEqual(readLiveTestEnvironment({}), {
    enabled: false,
    reason: "Set GEO_LIVE_TESTS=1 in a protected manual environment to run testnet writes.",
  });
});

test("opt-in fails closed for missing, malformed, CI, and fork credentials", () => {
  assert.throws(() => readLiveTestEnvironment({ GEO_LIVE_TESTS: "1" }), /GEO_PRIVATE_KEY/);
  assert.throws(
    () =>
      readLiveTestEnvironment({
        GEO_LIVE_TESTS: "1",
        GEO_PRIVATE_KEY: "not-a-private-key",
      }),
    /32-byte hexadecimal testnet key/,
  );
  assert.throws(
    () =>
      readLiveTestEnvironment({
        CI: "true",
        GEO_LIVE_TESTS: "1",
        GEO_PRIVATE_KEY: PRIVATE_KEY,
      }),
    /manual environment/,
  );
  assert.throws(
    () =>
      readLiveTestEnvironment({
        GEO_LIVE_TESTS: "1",
        GEO_PRIVATE_KEY: PRIVATE_KEY,
        GITHUB_EVENT_NAME: "pull_request",
      }),
    /fork or pull-request context/,
  );
});

test("secret-bearing errors are redacted without retaining a cause", () => {
  const error = redactError(
    new Error(`request for ${PRIVATE_KEY} failed at ${GeoTestnetConfig.sponsorship.rpcUrl}`),
  );

  assert.equal(error.cause, undefined);
  assert.doesNotMatch(error.message, new RegExp(PRIVATE_KEY.slice(2), "i"));
  assert.doesNotMatch(error.message, /https?:\/\//);
  assert.match(error.message, /\[REDACTED_SECRET\]/);
  assert.match(error.message, /\[REDACTED_URL\]/);
});

test("transaction intent rejects the wrong chain, target, or calldata", () => {
  const enterCalldata = encodeFunctionData({
    abi: SpaceRegistryAbi,
    functionName: "enter",
    args: [ZERO_BYTES_16, ZERO_BYTES_16, ZERO_BYTES_32, ZERO_BYTES_32, "0x", "0x"],
  });
  const expected = {
    network: GeoTestnetConfig,
    expectedTarget: REGISTRY,
    expectedFunctionName: "enter",
    abi: SpaceRegistryAbi,
    transaction: { to: REGISTRY, calldata: enterCalldata },
  };

  assert.doesNotThrow(() => assertTransactionIntent(expected));
  assert.throws(
    () =>
      assertTransactionIntent({
        ...expected,
        network: { ...GeoTestnetConfig, chain: { ...GeoTestnetConfig.chain, id: 1 } },
      }),
    /chain 55516/,
  );
  assert.throws(
    () =>
      assertTransactionIntent({
        ...expected,
        transaction: { ...expected.transaction, to: "0x0000000000000000000000000000000000000001" },
      }),
    /unexpected target/,
  );
  assert.throws(
    () =>
      assertTransactionIntent({
        ...expected,
        transaction: {
          ...expected.transaction,
          calldata: encodeFunctionData({ abi: SpaceRegistryAbi, functionName: "clearSpaceId" }),
        },
      }),
    /unexpected contract function clearSpaceId/,
  );
  assert.throws(
    () =>
      assertTransactionIntent({
        ...expected,
        transaction: { ...expected.transaction, calldata: "0x1234" },
      }),
    /does not decode/,
  );
  assert.throws(
    () =>
      assertTransactionIntent({
        ...expected,
        transaction: { ...expected.transaction, calldata: "0x" },
      }),
    /invalid transaction calldata/,
  );
});

test("DAO authorization preflight requires the exact DAO, sole editor, and topic", () => {
  const space = {
    id: DAO_SPACE_ID,
    type: "DAO",
    topic: { id: TOPIC_ID, name: "GEO-SDK-0.20.1 acceptance DAO" },
    editors: { nodes: [{ memberSpaceId: PERSONAL_SPACE_ID }] },
    spaceVotingSetting: { duration: 60 },
  };
  const expected = {
    daoSpaceId: DAO_SPACE_ID,
    personalSpaceId: PERSONAL_SPACE_ID,
    topicId: TOPIC_ID,
    topicName: "GEO-SDK-0.20.1 acceptance DAO",
  };

  assert.doesNotThrow(() => assertDaoAuthorization(space, expected));
  assert.throws(
    () => assertDaoAuthorization({ ...space, id: TOPIC_ID }, expected),
    /DAO space ID mismatch/,
  );
  assert.throws(
    () =>
      assertDaoAuthorization(
        { ...space, editors: { nodes: [{ memberSpaceId: DAO_SPACE_ID }] } },
        expected,
      ),
    /exactly the signer personal space/,
  );
  assert.throws(
    () =>
      assertDaoAuthorization({ ...space, topic: { ...space.topic, id: DAO_SPACE_ID } }, expected),
    /topic ID mismatch/,
  );
  assert.throws(
    () => assertDaoAuthorization({ ...space, spaceVotingSetting: { duration: 59 } }, expected),
    /at least 60 seconds/,
  );
});

const liveGate = readLiveTestEnvironment(
  process.env.GEO_LIVE_TESTS === "1" ? { GEO_LIVE_TESTS: "0" } : process.env,
);

test(
  "credentialed 0.20.1 Ultra Relay personal and DAO acceptance",
  { skip: process.env.GEO_LIVE_TESTS === "1" ? false : liveGate.reason, timeout: 1_200_000 },
  async () => {
    const environment = readLiveTestEnvironment(process.env);
    assert.equal(environment.enabled, true);
    await runLiveAcceptance(environment.privateKey);
  },
);
