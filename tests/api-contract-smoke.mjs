import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const API_ENDPOINT = "https://api-testnet.geobrowser.io/graphql";

const GEO_ENTITY_ID = "6b9f649e38b64224927dd66171343730";
const PERSON_TYPE_ID = "7ed45f2bc48b419e8e4664d5ff680b0d";
const ROOT_SPACE_ID = "a19c345ab9866679b001d7d2138d88a1";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const CONTRACT_QUERY = `
  query GeoApiContractSmoke {
    entity(id: "${GEO_ENTITY_ID}") {
      id
      name
      description
      spaceIds
      types { id name }
      values(first: 5) {
        nodes {
          property { id name }
          text
          date
          boolean
          decimal
          integer
          float
        }
      }
      relations(first: 5) {
        nodes {
          id
          entityId
          type { id name }
          toEntity { id name }
        }
      }
    }

    people: entities(typeId: "${PERSON_TYPE_ID}", first: 2) {
      id
      name
    }

    peopleConnection: entitiesConnection(typeId: "${PERSON_TYPE_ID}", first: 2) {
      totalCount
      nodes { id name }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }

    identitySpaces: spaces(
      filter: { type: { is: PERSONAL }, address: { isInsensitive: "${ZERO_ADDRESS}" } }
      first: 1
    ) { id }

    editorMemberships: editorsConnection(
      filter: { memberSpaceId: { is: "${ROOT_SPACE_ID}" } }
      first: 1
    ) {
      nodes { space { id type topic { name } } }
    }

    space(id: "${ROOT_SPACE_ID}") {
      id
      type
      topic { id name }
      editors(first: 2) {
        nodes { spaceId memberSpaceId }
        pageInfo { hasNextPage endCursor }
      }
      spaceVotingSetting {
        spaceId
        partialPercentageSupportThreshold
        universalPercentageSupportThreshold
        flatSupportThreshold
        quorum
        duration
        disableFastPathAccessForNewMembers
        executionGracePeriod
      }
      proposals(first: 1) {
        id
        executedAt
        currentVersion
        proposalVersions(first: 1) {
          proposalVersion
          votingMode
          startTime
          endTime
          executeBy
          quorum
          threshold
          partialPercentageSupportThreshold
          universalPercentageSupportThreshold
          flatSupportThreshold
          yesCount
          noCount
          abstainCount
        }
      }
    }

    uuidFilter: __type(name: "UUIDFilter") {
      inputFields { name }
    }
    uuidListFilter: __type(name: "UUIDListFilter") {
      inputFields { name }
    }
    stringFilter: __type(name: "StringFilter") {
      inputFields { name }
    }
  }
`;

function operationName(query) {
  return query.match(/\bquery\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? "GraphQL request";
}

async function responsePreview(response) {
  try {
    return (await response.text()).replace(/\s+/g, " ").trim().slice(0, 200);
  } catch {
    return "";
  }
}

export async function requestGraphQL(query, fetchImpl = fetch) {
  const label = operationName(query);
  let response;

  try {
    response = await fetchImpl(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(`${label}: network request failed: ${error.message}`, { cause: error });
  }

  if (!response.ok) {
    const preview = await responsePreview(response);
    const detail = preview ? `: ${preview}` : "";
    throw new Error(`${label}: HTTP ${response.status} ${response.statusText || "error"}${detail}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`${label}: response was not valid JSON: ${error.message}`, { cause: error });
  }

  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    const messages = payload.errors.map((error) => error?.message ?? "unknown GraphQL error");
    throw new Error(`${label}: GraphQL errors: ${messages.join("; ")}`);
  }

  if (!payload || typeof payload !== "object" || !("data" in payload) || payload.data === null) {
    throw new Error(`${label}: GraphQL response did not contain a data field`);
  }

  return payload.data;
}

async function expectFailure(label, fetchImpl, expectedMessage) {
  await assert.rejects(
    () => requestGraphQL("query FailureContract { __typename }", fetchImpl),
    (error) => {
      assert.match(error.message, expectedMessage, `${label} should include actionable context`);
      return true;
    },
  );
}

export async function verifyFailureContracts() {
  await expectFailure(
    "HTTP failure",
    async () => ({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "upstream unavailable",
    }),
    /HTTP 503 Service Unavailable: upstream unavailable/,
  );

  await expectFailure(
    "invalid JSON",
    async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    }),
    /response was not valid JSON: Unexpected token/,
  );

  await expectFailure(
    "GraphQL failure",
    async () => ({
      ok: true,
      json: async () => ({ errors: [{ message: "Unknown field" }] }),
    }),
    /GraphQL errors: Unknown field/,
  );

  await expectFailure(
    "missing data",
    async () => ({
      ok: true,
      json: async () => ({ extensions: {} }),
    }),
    /did not contain a data field/,
  );

  await expectFailure(
    "null data",
    async () => ({
      ok: true,
      json: async () => ({ data: null }),
    }),
    /did not contain a data field/,
  );
}

function fieldNames(type) {
  assert.ok(type, "expected introspected filter type to exist");
  return new Set(type.inputFields.map(({ name }) => name));
}

function assertFields(type, expectedNames) {
  const actualNames = fieldNames(type);
  for (const name of expectedNames) {
    assert.ok(actualNames.has(name), `${name} is missing from the live ${type.name ?? "filter"}`);
  }
}

export function verifyLiveContract(data) {
  const entity = data.entity;
  assert.ok(entity, "Geo fixture is missing");
  assert.equal(entity.id, GEO_ENTITY_ID, "Geo fixture ID drifted");
  assert.ok(entity.name, "Geo fixture has no name");
  assert.ok(entity.spaceIds.includes(ROOT_SPACE_ID), "Geo fixture is missing root space context");
  assert.ok(entity.types.length > 0, "Geo fixture has no types");
  assert.ok(entity.values.nodes.length > 0, "Geo fixture has no values");
  assert.ok(entity.relations.nodes.length > 0, "Geo fixture has no relations");

  assert.ok(Array.isArray(data.people), "entities should return a flat array");
  assert.ok(data.people.length > 0, "Person fixture query returned no entities");
  assert.ok(
    data.people.every(({ id, name }) => id && name),
    "Person results need IDs and names",
  );

  const connection = data.peopleConnection;
  assert.ok(connection, "Person connection is missing");
  assert.ok(connection.totalCount > 0, "Person connection has no results");
  assert.ok(connection.nodes.length > 0, "Person connection has no nodes");
  assert.equal(typeof connection.pageInfo.hasNextPage, "boolean");
  assert.equal(typeof connection.pageInfo.hasPreviousPage, "boolean");
  assert.ok(connection.pageInfo.startCursor, "Person connection has no start cursor");
  assert.ok(connection.pageInfo.endCursor, "Person connection has no end cursor");

  assert.ok(Array.isArray(data.identitySpaces), "spaces should return a flat array");
  assert.ok(
    Array.isArray(data.editorMemberships?.nodes),
    "editorsConnection should expose membership nodes",
  );

  const space = data.space;
  assert.ok(space, "root Geo space is missing");
  assert.equal(space.id, ROOT_SPACE_ID, "root Geo space ID drifted");
  assert.equal(space.topic?.id, GEO_ENTITY_ID, "root space topic does not resolve to Geo");
  assert.equal(space.topic?.name, "Geo", "root space topic label drifted");
  assert.ok(space.editors.nodes.length > 0, "root space has no editor rows");
  assert.ok(
    space.editors.nodes.every(({ memberSpaceId }) => memberSpaceId),
    "editor row is incomplete",
  );

  const voting = space.spaceVotingSetting;
  assert.ok(voting, "root voting settings are missing");
  assert.equal(voting.spaceId, ROOT_SPACE_ID, "root voting settings reference the wrong space");
  for (const field of [
    "partialPercentageSupportThreshold",
    "universalPercentageSupportThreshold",
    "flatSupportThreshold",
    "quorum",
    "duration",
    "disableFastPathAccessForNewMembers",
    "executionGracePeriod",
  ]) {
    assert.ok(field in voting && voting[field] !== null, `voting setting ${field} is missing`);
  }

  const proposal = space.proposals[0];
  assert.ok(proposal?.id, "root space has no proposal fixture");
  assert.ok("executedAt" in proposal, "proposal execution state is missing");
  assert.equal(typeof proposal.currentVersion, "number", "proposal currentVersion is missing");
  const proposalVersion = proposal.proposalVersions[0];
  assert.ok(proposalVersion, "proposal version fixture is missing");
  for (const field of [
    "proposalVersion",
    "votingMode",
    "startTime",
    "endTime",
    "quorum",
    "threshold",
    "partialPercentageSupportThreshold",
    "universalPercentageSupportThreshold",
    "flatSupportThreshold",
    "yesCount",
    "noCount",
    "abstainCount",
  ]) {
    assert.ok(
      field in proposalVersion && proposalVersion[field] !== null,
      `proposal version ${field} is missing`,
    );
  }
  assert.ok("executeBy" in proposalVersion, "proposal version execution deadline is missing");

  assertFields(data.uuidFilter, ["is", "isNot", "in", "notIn"]);
  assertFields(data.uuidListFilter, ["is", "isNot", "in", "containedBy", "overlaps", "anyEqualTo"]);
  assertFields(data.stringFilter, [
    "is",
    "isNot",
    "in",
    "notIn",
    "includes",
    "includesInsensitive",
    "startsWith",
    "isInsensitive",
  ]);
}

export async function runLiveSmoke() {
  const data = await requestGraphQL(CONTRACT_QUERY);
  verifyLiveContract(data);
  return {
    endpoint: API_ENDPOINT,
    entity: data.entity.id,
    people: data.peopleConnection.totalCount,
    space: data.space.id,
    proposal: data.space.proposals[0].id,
  };
}

async function main() {
  await verifyFailureContracts();

  if (process.argv.includes("--self-test")) {
    console.log("Geo API smoke failure contracts passed");
    return;
  }

  const result = await runLiveSmoke();
  console.log(`Geo API contract smoke passed: ${JSON.stringify(result)}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    console.error(`Geo API contract smoke failed: ${error.message}`);
    process.exitCode = 1;
  });
}
