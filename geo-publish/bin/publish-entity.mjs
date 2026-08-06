#!/usr/bin/env node
// publish-entity.mjs — creates a simple entity and publishes it to a personal space.

import { ContentIds, GeoTestnetConfig, Ops, SystemIds } from "@geoprotocol/geo-sdk";
import { SpaceRegistryAbi } from "@geoprotocol/geo-sdk/abis";

import {
  assertContractCall,
  createPublishingRuntime,
  findPersonalSpaceId,
  isMainModule,
  requirePersonalSpaceId,
  safeErrorMessage,
} from "./runtime.mjs";

const EXPECTED_CHAIN_ID = 55516;

export const TYPE_ALIASES = Object.freeze({
  DEFAULT_TYPE: SystemIds.DEFAULT_TYPE,
  PERSON_TYPE: SystemIds.PERSON_TYPE,
  COMPANY_TYPE: SystemIds.COMPANY_TYPE,
  PROJECT_TYPE: SystemIds.PROJECT_TYPE,
  ROLE_TYPE: SystemIds.ROLE_TYPE,
  ARTICLE_TYPE: ContentIds.ARTICLE_TYPE,
  TOPIC_TYPE: ContentIds.TOPIC_TYPE,
  SKILL_TYPE: ContentIds.SKILL_TYPE,
});

class CliUsageError extends Error {}

export function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      index += 1;
    }
  }
  return out;
}

function knownTypeAliases() {
  return Object.keys(TYPE_ALIASES).join(", ");
}

function parsePublishArgs(argv) {
  const args = parseArgs(argv);
  if (typeof args.name !== "string" || args.name.length === 0) {
    throw new CliUsageError(
      `Usage: publish-entity.mjs --name <string> [--description <string>] [--type <TYPE>] [--space-id <uuid>] [--author <uuid>] [--dry-run]\nKnown --type values: ${knownTypeAliases()}`,
    );
  }

  const type = args.type ?? "DEFAULT_TYPE";
  if (!Object.hasOwn(TYPE_ALIASES, type)) {
    throw new CliUsageError(`Unknown --type "${type}". Known: ${knownTypeAliases()}`);
  }
  if (args.name.endsWith(".")) {
    throw new CliUsageError(`Error: name must NOT end with a period. Got: "${args.name}"`);
  }
  if (
    args.description !== undefined &&
    args.description !== true &&
    !args.description.endsWith(".")
  ) {
    throw new CliUsageError(
      `Error: description MUST end with a period. Got: "${args.description}"`,
    );
  }

  return { ...args, type };
}

export function validateWriteIntent(network, { to, calldata }) {
  const chainId = network?.chain?.id;
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `Refusing to publish on chain ${chainId ?? "(missing)"}; expected Geo testnet chain ${EXPECTED_CHAIN_ID}.`,
    );
  }

  const registryAddress = network.contracts?.SPACE_REGISTRY_ADDRESS;
  if (typeof registryAddress !== "string") {
    throw new Error("Geo testnet configuration is missing SPACE_REGISTRY_ADDRESS.");
  }
  assertContractCall({
    transaction: { to, calldata },
    expectedTarget: registryAddress,
    expectedFunctionName: "enter",
    abi: SpaceRegistryAbi,
    context: "Publish transaction",
  });
}

export async function runPublishEntity({
  argv = process.argv.slice(2),
  privateKey = process.env.GEO_PRIVATE_KEY,
  logger = console,
  createRuntime = createPublishingRuntime,
  opsApi = Ops,
} = {}) {
  const args = parsePublishArgs(argv);
  const typeId = TYPE_ALIASES[args.type];
  const runtime = createRuntime({ privateKey, network: GeoTestnetConfig });
  const { address, geo, network } = runtime;

  let personalSpaceId = null;
  if (!args["space-id"] || !args.author) {
    personalSpaceId = requirePersonalSpaceId(await findPersonalSpaceId(geo, address), address);
  }
  const spaceId = args["space-id"] ?? personalSpaceId;
  const author = args.author ?? personalSpaceId;
  const { id: entityId, ops } = opsApi.entities.create({
    name: args.name,
    description: args.description === true ? undefined : args.description,
    types: [typeId],
  });

  if (args["dry-run"]) {
    const result = { entityId, spaceId, author, name: args.name, type: args.type };
    logger.log(`[dry-run] would publish ${ops.length} ops`);
    logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  const transaction = await geo.personalSpaces.publishEdit({
    name: `Add ${args.name}`,
    spaceId,
    ops,
    author,
  });
  validateWriteIntent(network, transaction);

  const wallet = await runtime.createWallet();
  const txHash = await wallet.sendTransaction({
    to: transaction.to,
    data: transaction.calldata,
  });
  const result = {
    entityId,
    editId: transaction.editId,
    cid: transaction.cid,
    txHash,
    url: `https://www.geobrowser.io/space/${spaceId}/${entityId}`,
  };
  logger.log(JSON.stringify(result, null, 2));
  return result;
}

export async function mainPublishEntity({
  argv = process.argv.slice(2),
  privateKey = process.env.GEO_PRIVATE_KEY,
  logger = console,
  ...options
} = {}) {
  try {
    await runPublishEntity({ ...options, argv, privateKey, logger });
    return 0;
  } catch (error) {
    logger.error(safeErrorMessage(error, privateKey));
    return error instanceof CliUsageError ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) process.exitCode = await mainPublishEntity();
