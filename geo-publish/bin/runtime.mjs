import { createGeoClient, createGeoWalletClient, GeoTestnetConfig } from "@geoprotocol/geo-sdk";
import { privateKeyToAccount } from "viem/accounts";

const PRIVATE_KEY_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/;

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
  const geoParams = fetch === undefined ? { network } : { network, fetch };
  const geo = createGeoClientFn(geoParams);

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
