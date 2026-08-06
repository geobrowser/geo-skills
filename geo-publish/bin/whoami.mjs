#!/usr/bin/env node
// whoami.mjs — derives wallet address, personal space, and editable DAO spaces
// from GEO_PRIVATE_KEY. No local SDK install is needed in the user's project.

import {
  createPublishingRuntime,
  findEditableSpaces,
  findPersonalSpaceId,
  isMainModule,
  safeErrorMessage,
} from "./runtime.mjs";

export async function runWhoami({
  privateKey = process.env.GEO_PRIVATE_KEY,
  logger = console,
  runtime,
  createRuntime = createPublishingRuntime,
} = {}) {
  const activeRuntime = runtime ?? createRuntime({ privateKey });
  const { address, geo } = activeRuntime;
  const personalSpaceId = await findPersonalSpaceId(geo, address);
  const editableSpaces = personalSpaceId ? await findEditableSpaces(geo, personalSpaceId) : [];

  logger.log(`Wallet address : ${address}`);
  logger.log(`Personal space : ${personalSpaceId ?? "(none — create one before publishing)"}`);
  logger.log(`Author (pass as \`author\`): ${personalSpaceId ?? "(needs personal space)"}`);
  logger.log("");
  logger.log("Spaces you can publish to as editor:");
  if (personalSpaceId) logger.log(`  - ${personalSpaceId}  [PERSONAL]  (your own)`);
  for (const { space } of editableSpaces) {
    const label = space.topic?.name ? `  ${space.topic.name}` : "";
    logger.log(`  - ${space.id}  [${space.type}]${label}`);
  }
  if (!personalSpaceId && editableSpaces.length === 0) logger.log("  (none)");

  return { address, personalSpaceId, editableSpaces };
}

export async function mainWhoami({
  privateKey = process.env.GEO_PRIVATE_KEY,
  logger = console,
  ...options
} = {}) {
  try {
    await runWhoami({ ...options, privateKey, logger });
    return 0;
  } catch (error) {
    logger.error(safeErrorMessage(error, privateKey));
    return 1;
  }
}

if (isMainModule(import.meta.url)) process.exitCode = await mainWhoami();
