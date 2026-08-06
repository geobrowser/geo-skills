import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createGeoClient, createGeoWalletClient, GeoTestnetConfig } from "@geoprotocol/geo-sdk";
import { decodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PRIVATE_KEY_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/;
const REQUEST_TIMEOUT_MS = 20_000;

// Returns true when the module identified by `importMetaUrl` is the process
// entry point. Symlinks are resolved on both sides so the check still holds
// when the script is invoked through a symlinked path — e.g. `.claude/skills/*`
// linking into `.agents/skills/*`, where Node resolves the symlink for
// `import.meta.url` but not for `process.argv[1]`.
export function isMainModule(importMetaUrl) {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
}

export function normalizePrivateKey(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      "GEO_PRIVATE_KEY is not set. Create .env.geo-publish and re-run with --env-file=.env.geo-publish",
    );
  }
  if (!PRIVATE_KEY_PATTERN.test(value)) {
    throw new Error("GEO_PRIVATE_KEY must be a 32-byte hexadecimal value.");
  }
  return value.startsWith("0x") ? value : `0x${value}`;
}

export function safeErrorMessage(error, secret) {
  let message = error instanceof Error ? error.message : String(error);
  if (typeof secret !== "string" || secret.length === 0) return message;

  const candidates = new Set([secret]);
  if (PRIVATE_KEY_PATTERN.test(secret)) {
    const normalized = normalizePrivateKey(secret);
    candidates.add(normalized);
    candidates.add(normalized.slice(2));
  }
  for (const candidate of candidates) {
    message = message.replaceAll(candidate, "[redacted]");
  }
  return message;
}

export function assertContractCall({
  transaction,
  expectedTarget,
  expectedFunctionName,
  abi,
  context = "Transaction",
}) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(expectedTarget ?? "")) {
    throw new Error(`${context} expected target is not an address.`);
  }
  if (
    typeof transaction?.to !== "string" ||
    transaction.to.toLowerCase() !== expectedTarget.toLowerCase()
  ) {
    throw new Error(
      `${context} has an unexpected target and does not match the configured contract.`,
    );
  }
  if (!Array.isArray(abi)) throw new Error(`${context} is missing the expected contract ABI.`);
  if (typeof expectedFunctionName !== "string" || expectedFunctionName.length === 0) {
    throw new Error(`${context} is missing the expected contract function.`);
  }
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(transaction?.calldata ?? "")) {
    throw new Error(`${context} returned invalid transaction calldata.`);
  }

  let decoded;
  try {
    decoded = decodeFunctionData({ abi, data: transaction.calldata });
  } catch {
    throw new Error(`${context} calldata does not decode against the expected contract ABI.`);
  }
  if (decoded.functionName !== expectedFunctionName) {
    throw new Error(
      `Refusing to sign unexpected contract function ${decoded.functionName} for ${context}.`,
    );
  }
}

export function withRequestTimeout(fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

  return (input, init = {}) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    return fetchImpl(input, { ...init, signal });
  };
}

export function createPublishingRuntime({
  privateKey = process.env.GEO_PRIVATE_KEY,
  network = GeoTestnetConfig,
  fetch,
  privateKeyToAccountFn = privateKeyToAccount,
  createGeoClientFn = createGeoClient,
  createGeoWalletClientFn = createGeoWalletClient,
} = {}) {
  const normalizedPrivateKey = normalizePrivateKey(privateKey);
  const signer = privateKeyToAccountFn(normalizedPrivateKey);
  const geo = createGeoClientFn({ network, fetch: withRequestTimeout(fetch) });

  return {
    address: signer.address,
    signer,
    network,
    geo,
    createWallet() {
      return createGeoWalletClientFn({ signer, network });
    },
  };
}

export async function graphqlData(geo, query, context = "querying Geo") {
  let response;
  try {
    response = await geo.api.graphql(query);
  } catch (error) {
    throw new Error(`Geo API request failed while ${context}: ${safeErrorMessage(error)}`, {
      cause: error,
    });
  }

  if (Array.isArray(response?.errors) && response.errors.length > 0) {
    const details = response.errors
      .map((error) => (typeof error?.message === "string" ? error.message : JSON.stringify(error)))
      .join("; ");
    throw new Error(`Geo API returned GraphQL errors while ${context}: ${details}`);
  }
  if (!response || !("data" in response) || response.data === null) {
    throw new Error(`Geo API response did not include data while ${context}.`);
  }
  return response.data;
}

export async function findPersonalSpaceId(geo, address) {
  const data = await graphqlData(
    geo,
    `{
      spaces(
        filter: { type: { is: PERSONAL }, address: { isInsensitive: "${address}" } }
        first: 1
      ) { id }
    }`,
    "looking up the signer's personal space",
  );

  if (!Array.isArray(data.spaces)) {
    throw new Error("Geo API personal-space response did not include a spaces list.");
  }
  return data.spaces[0]?.id ?? null;
}

export function requirePersonalSpaceId(personalSpaceId, address) {
  if (!personalSpaceId) {
    throw new Error(`No personal space found for signer ${address}. Create one before publishing.`);
  }
  return personalSpaceId;
}

export async function findEditableSpaces(geo, personalSpaceId) {
  const data = await graphqlData(
    geo,
    `{
      editorsConnection(filter: { memberSpaceId: { is: "${personalSpaceId}" } }, first: 100) {
        nodes { space { id type topic { name } } }
      }
    }`,
    "looking up editable spaces",
  );

  if (!Array.isArray(data.editorsConnection?.nodes)) {
    throw new Error("Geo API editor response did not include an editors connection.");
  }
  return data.editorsConnection.nodes;
}
