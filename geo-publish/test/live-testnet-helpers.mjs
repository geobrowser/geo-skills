import {
  createGeoClient,
  createGeoWalletClient,
  GeoTestnetConfig,
  Ops,
  SystemIds,
} from "@geoprotocol/geo-sdk";
import { DaoSpaceFactoryAbi, SpaceRegistryAbi } from "@geoprotocol/geo-sdk/abis";
import { createPublicClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { runPublishEntity } from "../bin/publish-entity.mjs";
import { assertContractCall, withRequestTimeout } from "../bin/runtime.mjs";

const EXPECTED_CHAIN_ID = 55516;
const EXPECTED_API_ORIGIN = "https://api-testnet.geobrowser.io";
const EXPECTED_SPACE_REGISTRY = "0xCF13491802747e759e1BB8E364bc43045398d1DD";
const EXPECTED_DAO_FACTORY = "0x323aF429B85c954D4a161b2A6281c26DF45b7128";
const EMPTY_SPACE_ID = `0x${"00".repeat(16)}`;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 120_000;
const LIVE_SKIP_REASON =
  "Set GEO_LIVE_TESTS=1 in a protected manual environment to run testnet writes.";
const SPACE_REGISTRY_INTENT = {
  expectedTarget: GeoTestnetConfig.contracts.SPACE_REGISTRY_ADDRESS,
  expectedFunctionName: "enter",
  abi: SpaceRegistryAbi,
};
const DAO_FACTORY_INTENT = {
  expectedTarget: GeoTestnetConfig.contracts.DAO_SPACE_FACTORY_ADDRESS,
  expectedFunctionName: "createDAOSpaceProxy",
  abi: DaoSpaceFactoryAbi,
};

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function envIsTrue(value) {
  return /^(?:1|true|yes)$/i.test(value ?? "");
}

function isForkOrPullRequest(env) {
  return (
    /^pull_request(?:_target)?$/.test(env.GITHUB_EVENT_NAME ?? "") ||
    envIsTrue(env.GITHUB_HEAD_REPO_FORK) ||
    envIsTrue(env.GEO_FORK_CONTEXT) ||
    Boolean(env.CI_MERGE_REQUEST_SOURCE_PROJECT_ID)
  );
}

function normalizeId(value, label = "Geo ID") {
  const normalized = String(value ?? "")
    .replace(/^0x/i, "")
    .replaceAll("-", "")
    .toLowerCase();
  invariant(/^[0-9a-f]{32}$/.test(normalized), `${label} must be a bytes16 Geo ID.`);
  return normalized;
}

function toHexId(value, label) {
  return `0x${normalizeId(value, label)}`;
}

function sameAddress(left, right) {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    left.toLowerCase() === right.toLowerCase()
  );
}

export function assertGeoTestnetConfig(network) {
  invariant(
    network?.chain?.id === EXPECTED_CHAIN_ID,
    `Live acceptance requires chain ${EXPECTED_CHAIN_ID}.`,
  );
  invariant(
    network?.apiOrigin === EXPECTED_API_ORIGIN,
    `Live acceptance requires ${EXPECTED_API_ORIGIN}.`,
  );

  const sponsorshipUrl = network?.sponsorship?.rpcUrl;
  invariant(typeof sponsorshipUrl === "string", "Geo testnet sponsorship is not configured.");
  invariant(
    /[?&]provider=ULTRA_RELAY(?:&|$)/.test(sponsorshipUrl),
    "Geo testnet sponsorship must use provider=ULTRA_RELAY.",
  );
  invariant(
    !/[?&]selfFunded=/i.test(sponsorshipUrl),
    "Geo testnet sponsorship must not use selfFunded mode.",
  );
  invariant(
    sameAddress(network.contracts?.SPACE_REGISTRY_ADDRESS, EXPECTED_SPACE_REGISTRY),
    "Geo testnet SPACE_REGISTRY_ADDRESS does not match the accepted Contracts V2 deployment.",
  );
  invariant(
    sameAddress(network.contracts?.DAO_SPACE_FACTORY_ADDRESS, EXPECTED_DAO_FACTORY),
    "Geo testnet DAO_SPACE_FACTORY_ADDRESS does not match the accepted Contracts V2 deployment.",
  );
}

export function readLiveTestEnvironment(env) {
  if (env.GEO_LIVE_TESTS !== "1") return { enabled: false, reason: LIVE_SKIP_REASON };

  invariant(!envIsTrue(env.CI), "Live writes require a protected manual environment, not CI.");
  invariant(
    !isForkOrPullRequest(env),
    "Live writes are forbidden in a fork or pull-request context.",
  );

  const raw = env.GEO_PRIVATE_KEY;
  invariant(
    typeof raw === "string" && raw.length > 0,
    "GEO_PRIVATE_KEY is required for live writes.",
  );
  invariant(
    /^(?:0x)?[0-9a-fA-F]{64}$/.test(raw),
    "GEO_PRIVATE_KEY must be a 32-byte hexadecimal testnet key.",
  );

  return { enabled: true, privateKey: raw.startsWith("0x") ? raw : `0x${raw}` };
}

export function redactError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const redacted = message
    .replace(/(?:0x)?[0-9a-fA-F]{64}/g, "[REDACTED_SECRET]")
    .replace(/https?:\/\/[^\s"')]+/g, "[REDACTED_URL]")
    .slice(0, 1_000);
  return new Error(`Geo live acceptance failed: ${redacted}`);
}

export function assertTransactionIntent({
  network,
  expectedTarget,
  expectedFunctionName,
  abi,
  transaction,
}) {
  assertGeoTestnetConfig(network);
  assertContractCall({
    transaction,
    expectedTarget,
    expectedFunctionName,
    abi,
    context: "Live acceptance transaction",
  });
}

export function assertDaoAuthorization(space, expected) {
  invariant(space, "DAO space is not indexed.");
  invariant(
    normalizeId(space.id, "DAO space ID") ===
      normalizeId(expected.daoSpaceId, "expected DAO space ID"),
    "DAO space ID mismatch.",
  );
  invariant(space.type === "DAO", "Resolved space is not a DAO.");
  invariant(
    normalizeId(space.topic?.id, "DAO topic ID") ===
      normalizeId(expected.topicId, "expected DAO topic ID"),
    "DAO topic ID mismatch.",
  );
  invariant(space.topic?.name === expected.topicName, "DAO topic name mismatch.");

  const editors = space.editors?.nodes ?? [];
  invariant(
    editors.length === 1 &&
      normalizeId(editors[0]?.memberSpaceId, "DAO editor space ID") ===
        normalizeId(expected.personalSpaceId, "expected editor space ID"),
    "DAO editor must be exactly the signer personal space.",
  );
  invariant(
    Number(space.spaceVotingSetting?.duration) >= 60,
    "DAO voting duration must be at least 60 seconds.",
  );
}

function createTestnetChain(network) {
  return defineChain({
    id: network.chain.id,
    name: network.chain.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [network.chain.rpcUrl] } },
  });
}

function entityQuery(entityId, spaceId) {
  return `query GeoLiveEntity {
    entity(id: ${JSON.stringify(normalizeId(entityId, "entity ID"))}) {
      id
      name
      spaceIds
      types { id }
      valuesList(filter: { spaceId: { is: ${JSON.stringify(normalizeId(spaceId, "space ID"))} } }) {
        propertyId
        spaceId
      }
      relationsList(filter: { spaceId: { is: ${JSON.stringify(normalizeId(spaceId, "space ID"))} } }) {
        id
        spaceId
      }
    }
  }`;
}

function daoSpaceQuery(spaceId) {
  return `query GeoLiveDaoSpace {
    space(id: ${JSON.stringify(normalizeId(spaceId, "DAO space ID"))}) {
      id
      type
      topic { id name }
      editors(first: 20) { nodes { memberSpaceId } }
      spaceVotingSetting { duration }
    }
  }`;
}

function proposalQuery(proposalId, personalSpaceId, daoSpaceId) {
  const proposal = normalizeId(proposalId, "proposal ID");
  const voter = normalizeId(personalSpaceId, "voter space ID");
  const space = normalizeId(daoSpaceId, "DAO space ID");
  return `query GeoLiveProposal {
    proposals(condition: { id: ${JSON.stringify(proposal)} }) {
      id
      spaceId
      proposedBy
      executedAt
      currentVersion
      proposalVersions {
        proposalVersion
        votingMode
        startTime
        endTime
        executeBy
        yesCount
        noCount
        abstainCount
      }
    }
    proposalVotes(condition: {
      proposalId: ${JSON.stringify(proposal)}
      voterId: ${JSON.stringify(voter)}
      spaceId: ${JSON.stringify(space)}
    }) {
      proposalId
      voterId
      spaceId
      vote
    }
  }`;
}

async function queryGraph(geo, query) {
  const response = await geo.api.graphql(query);
  if (response.errors?.length)
    throw new Error(`GraphQL rejected live acceptance: ${JSON.stringify(response.errors)}`);
  invariant(response.data !== undefined, "GraphQL live acceptance response did not contain data.");
  return response.data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label, read, matches) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastValue;
  let lastError;
  while (Date.now() < deadline) {
    try {
      lastValue = await read();
      lastError = undefined;
      if (matches(lastValue)) return lastValue;
    } catch (error) {
      lastError = error;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Timed out after 2 minutes waiting for ${label}. Last result: ${JSON.stringify(lastValue)}. Last error: ${String(lastError)}`,
  );
}

async function readSpaceIdHex(publicClient, address) {
  return publicClient.readContract({
    address: GeoTestnetConfig.contracts.SPACE_REGISTRY_ADDRESS,
    abi: SpaceRegistryAbi,
    functionName: "addressToSpaceId",
    args: [address],
  });
}

async function findCreatedDaoSpace(publicClient, receipt) {
  const excluded = new Set(
    [
      GeoTestnetConfig.contracts.SPACE_REGISTRY_ADDRESS,
      GeoTestnetConfig.contracts.DAO_SPACE_FACTORY_ADDRESS,
    ].map((address) => address.toLowerCase()),
  );
  const candidates = [...new Set(receipt.logs.map(({ address }) => address.toLowerCase()))].filter(
    (address) => !excluded.has(address),
  );
  for (const address of candidates) {
    try {
      const spaceIdHex = await readSpaceIdHex(publicClient, address);
      if (spaceIdHex.toLowerCase() !== EMPTY_SPACE_ID) return { address, spaceIdHex };
    } catch {
      // Receipt logs include contracts that are not registered spaces.
    }
  }
  throw new Error("DAO creation receipt did not contain a newly registered DAO space.");
}

async function sendAndWait(context, label, transaction, expectedIntent) {
  assertTransactionIntent({
    network: GeoTestnetConfig,
    ...expectedIntent,
    transaction,
  });
  const hash = await context.wallet.sendTransaction({
    to: transaction.to,
    data: transaction.calldata,
  });
  const receipt = await context.publicClient.waitForTransactionReceipt({
    hash,
    timeout: POLL_TIMEOUT_MS,
  });
  invariant(receipt.status === "success", `${label} transaction did not succeed.`);
  return { hash, receipt };
}

async function waitForSubmittedTransaction(publicClient, label, hash) {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: POLL_TIMEOUT_MS,
  });
  invariant(receipt.status === "success", `${label} transaction did not succeed.`);
  return { hash, receipt };
}

function uniqueName(kind) {
  const nonce = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  return `GEO-SDK-0.20.1 acceptance ${kind} ${nonce}`;
}

async function readDaoSpace(geo, daoSpaceId) {
  return (await queryGraph(geo, daoSpaceQuery(daoSpaceId))).space;
}

export async function publishDefaultEntityThroughCli({
  privateKey,
  personalSpaceId,
  name,
  publishEntity = runPublishEntity,
}) {
  return publishEntity({
    argv: ["--name", name, "--space-id", personalSpaceId, "--author", personalSpaceId],
    privateKey,
    logger: { log() {}, error() {} },
  });
}

async function executeLiveAcceptance(privateKey) {
  assertGeoTestnetConfig(GeoTestnetConfig);
  const signer = privateKeyToAccount(privateKey);
  const chain = createTestnetChain(GeoTestnetConfig);
  const publicClient = createPublicClient({
    chain,
    transport: http(GeoTestnetConfig.chain.rpcUrl),
  });
  invariant(
    (await publicClient.getChainId()) === EXPECTED_CHAIN_ID,
    `Configured RPC did not report chain ${EXPECTED_CHAIN_ID}.`,
  );
  const geo = createGeoClient({ network: GeoTestnetConfig, fetch: withRequestTimeout() });
  const wallet = await createGeoWalletClient({ signer, network: GeoTestnetConfig, publicClient });
  const context = { publicClient, wallet };

  const personalSpaceIdHex = await readSpaceIdHex(publicClient, signer.address);
  invariant(
    personalSpaceIdHex.toLowerCase() !== EMPTY_SPACE_ID,
    "The testnet signer does not have a personal space.",
  );
  const personalSpaceId = normalizeId(personalSpaceIdHex, "personal space ID");

  const personalName = uniqueName("personal entity");
  const personalEntity = await publishDefaultEntityThroughCli({
    privateKey,
    personalSpaceId,
    name: personalName,
  });
  const personalReceipt = await waitForSubmittedTransaction(
    publicClient,
    "personal entity publish",
    personalEntity.txHash,
  );
  await waitFor(
    `personal entity ${personalEntity.entityId}`,
    () => queryGraph(geo, entityQuery(personalEntity.entityId, personalSpaceId)),
    ({ entity }) =>
      normalizeId(entity?.id) === normalizeId(personalEntity.entityId) &&
      entity.name === personalName &&
      entity.spaceIds?.map((id) => normalizeId(id)).includes(personalSpaceId) &&
      entity.types?.some(({ id }) => normalizeId(id) === normalizeId(SystemIds.DEFAULT_TYPE)),
  );

  const deletion = await geo.entities.delete({
    id: personalEntity.entityId,
    spaceId: personalSpaceId,
  });
  invariant(
    deletion.ops.length > 0,
    "The indexed personal entity produced no deletion operations.",
  );
  const deleteEdit = await geo.personalSpaces.publishEdit({
    name: uniqueName("personal entity deletion"),
    spaceId: personalSpaceId,
    author: personalSpaceId,
    ops: deletion.ops,
  });
  const deleteReceipt = await sendAndWait(
    context,
    "personal entity deletion",
    deleteEdit,
    SPACE_REGISTRY_INTENT,
  );
  await waitFor(
    `space-scoped deletion of ${personalEntity.entityId}`,
    () => queryGraph(geo, entityQuery(personalEntity.entityId, personalSpaceId)),
    ({ entity }) =>
      !entity || (entity.valuesList.length === 0 && entity.relationsList.length === 0),
  );
  const repeatDeletion = await geo.entities.delete({
    id: personalEntity.entityId,
    spaceId: personalSpaceId,
  });
  invariant(repeatDeletion.ops.length === 0, "Repeat entity deletion must be an empty no-op.");

  const daoName = uniqueName("DAO");
  const daoCreation = await geo.daoSpaces.create({
    name: daoName,
    author: personalSpaceId,
    initialEditorSpaceIds: [personalSpaceIdHex],
    votingSettings: {
      partialPercentageSupportThreshold: 50,
      universalPercentageSupportThreshold: 90,
      flatSupportThreshold: 1,
      quorum: 1,
      durationInSeconds: 60,
      disableFastPathAccessForNewMembers: true,
      executionGracePeriodInDays: 1,
    },
  });
  const daoReceipt = await sendAndWait(context, "DAO creation", daoCreation, DAO_FACTORY_INTENT);
  const createdDao = await findCreatedDaoSpace(publicClient, daoReceipt.receipt);
  const daoSpaceId = normalizeId(createdDao.spaceIdHex, "created DAO space ID");
  const expectedDao = {
    daoSpaceId,
    personalSpaceId,
    topicId: daoCreation.spaceEntityId,
    topicName: daoName,
  };
  const indexedDao = await waitFor(
    `DAO ${daoSpaceId} and topic ${daoCreation.spaceEntityId}`,
    () => readDaoSpace(geo, daoSpaceId),
    (space) => {
      try {
        assertDaoAuthorization(space, expectedDao);
        return true;
      } catch {
        return false;
      }
    },
  );
  assertDaoAuthorization(indexedDao, expectedDao);

  // Repeat the authorization read immediately before uploading/signing DAO content.
  assertDaoAuthorization(await readDaoSpace(geo, daoSpaceId), expectedDao);
  const daoEntityName = uniqueName("DAO entity");
  const daoEntity = Ops.entities.create({
    name: daoEntityName,
    types: [SystemIds.DEFAULT_TYPE],
  });
  const proposal = await geo.daoSpaces.proposeEdit({
    name: daoEntityName,
    ops: daoEntity.ops,
    author: personalSpaceId,
    callerSpaceId: personalSpaceIdHex,
    daoSpaceId: createdDao.spaceIdHex,
    votingMode: "SLOW",
  });
  const proposalReceipt = await sendAndWait(
    context,
    "DAO edit proposal",
    proposal,
    SPACE_REGISTRY_INTENT,
  );

  const indexedProposal = await waitFor(
    `DAO proposal ${proposal.proposalId}`,
    () => queryGraph(geo, proposalQuery(proposal.proposalId, personalSpaceId, daoSpaceId)),
    ({ proposals }) => {
      const current = proposals?.[0];
      const version = current?.proposalVersions?.find(
        ({ proposalVersion }) => proposalVersion === current.currentVersion,
      );
      return (
        normalizeId(current?.spaceId) === daoSpaceId &&
        normalizeId(current?.proposedBy) === personalSpaceId &&
        current.currentVersion === proposal.versionId &&
        version?.proposalVersion === proposal.versionId &&
        version?.votingMode === "SLOW"
      );
    },
  );
  invariant(
    indexedProposal.proposals[0].currentVersion === proposal.versionId,
    "Proposal version drifted.",
  );

  // Abort before voting if DAO ownership, topic, editor, or proposal version changed.
  assertDaoAuthorization(await readDaoSpace(geo, daoSpaceId), expectedDao);
  const vote = geo.daoSpaces.voteProposal({
    authorSpaceId: personalSpaceIdHex,
    spaceId: createdDao.spaceIdHex,
    proposalId: proposal.proposalId,
    versionId: proposal.versionId,
    vote: "YES",
  });
  const voteReceipt = await sendAndWait(context, "DAO proposal vote", vote, SPACE_REGISTRY_INTENT);
  await waitFor(
    `YES vote for proposal ${proposal.proposalId}`,
    () => queryGraph(geo, proposalQuery(proposal.proposalId, personalSpaceId, daoSpaceId)),
    ({ proposals, proposalVotes }) => {
      const current = proposals?.[0];
      const version = current?.proposalVersions?.find(
        ({ proposalVersion }) => proposalVersion === proposal.versionId,
      );
      return (
        current?.currentVersion === proposal.versionId &&
        version?.votingMode === "SLOW" &&
        Number(version?.yesCount) >= 1 &&
        proposalVotes?.some(
          ({ proposalId, voterId, spaceId, vote: indexedVote }) =>
            normalizeId(proposalId) === normalizeId(proposal.proposalId) &&
            normalizeId(voterId) === personalSpaceId &&
            normalizeId(spaceId) === daoSpaceId &&
            indexedVote === "YES",
        )
      );
    },
  );
  const executableProposal = await waitFor(
    `DAO proposal ${proposal.proposalId} voting window`,
    () => queryGraph(geo, proposalQuery(proposal.proposalId, personalSpaceId, daoSpaceId)),
    ({ proposals }) => {
      const current = proposals?.[0];
      const version = current?.proposalVersions?.find(
        ({ proposalVersion }) => proposalVersion === proposal.versionId,
      );
      const now = Math.floor(Date.now() / 1_000);
      return (
        current?.currentVersion === proposal.versionId &&
        current.executedAt === null &&
        Number(version?.yesCount) >= 1 &&
        Number(version?.endTime) <= now &&
        Number(version?.executeBy) > now
      );
    },
  );
  invariant(
    executableProposal.proposals[0].currentVersion === proposal.versionId,
    "Executable proposal version drifted.",
  );

  // Abort before execution if DAO ownership, topic, editor, or proposal version changed.
  assertDaoAuthorization(await readDaoSpace(geo, daoSpaceId), expectedDao);
  const execution = geo.daoSpaces.executeProposal({
    authorSpaceId: personalSpaceIdHex,
    spaceId: createdDao.spaceIdHex,
    proposalId: proposal.proposalId,
  });
  const executionReceipt = await sendAndWait(
    context,
    "DAO proposal execution",
    execution,
    SPACE_REGISTRY_INTENT,
  );
  await waitFor(
    `execution of DAO proposal ${proposal.proposalId}`,
    () => queryGraph(geo, proposalQuery(proposal.proposalId, personalSpaceId, daoSpaceId)),
    ({ proposals }) => proposals?.[0]?.executedAt != null,
  );
  await waitFor(
    `DAO mutation ${daoEntity.id}`,
    () => queryGraph(geo, entityQuery(daoEntity.id, daoSpaceId)),
    ({ entity }) =>
      normalizeId(entity?.id) === normalizeId(daoEntity.id) &&
      entity.name === daoEntityName &&
      entity.spaceIds?.map((id) => normalizeId(id)).includes(daoSpaceId),
  );

  return {
    personalSpaceId,
    personalEntityId: personalEntity.entityId,
    personalEditId: personalEntity.editId,
    personalTransactionHash: personalReceipt.hash,
    deletionEditId: deleteEdit.editId,
    deletionTransactionHash: deleteReceipt.hash,
    daoSpaceId,
    daoTopicEntityId: daoCreation.spaceEntityId,
    daoCreationTransactionHash: daoReceipt.hash,
    daoEntityId: daoEntity.id,
    daoEditId: proposal.editId,
    proposalId: proposal.proposalId,
    versionId: proposal.versionId,
    proposalTransactionHash: proposalReceipt.hash,
    voteTransactionHash: voteReceipt.hash,
    executionTransactionHash: executionReceipt.hash,
  };
}

export async function runLiveAcceptance(privateKey) {
  try {
    const acceptance = await executeLiveAcceptance(privateKey);
    console.log(JSON.stringify({ geoLiveAcceptance: acceptance }));
    return acceptance;
  } catch (error) {
    throw redactError(error);
  }
}
