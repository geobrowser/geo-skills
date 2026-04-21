#!/usr/bin/env node
// publish-entity.mjs — one-shot CLI to create a simple entity and publish it
// to a personal space. For relations, updates, or multi-op edits, write a
// custom script that imports from this skill's node_modules (see SKILL.md).
//
// Run:
//   node --env-file=.env.geo-publish <skill-dir>/bin/publish-entity.mjs \
//     --name "Test entity" \
//     [--description "A one-line description."] \
//     [--type DEFAULT_TYPE|PERSON_TYPE|COMPANY_TYPE|PROJECT_TYPE|EVENT_TYPE|ARTICLE_TYPE|TOPIC_TYPE] \
//     [--space-id <uuid>]   (defaults to the wallet's personal space) \
//     [--author <uuid>]     (defaults to the wallet's personal space) \
//     [--dry-run]

import {
  Graph,
  SystemIds,
  ContentIds,
  personalSpace,
  getSmartAccountWalletClient,
} from "@geoprotocol/geo-sdk";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const TYPE_MAP = {
  DEFAULT_TYPE: SystemIds.DEFAULT_TYPE,
  PERSON_TYPE: SystemIds.PERSON_TYPE,
  COMPANY_TYPE: SystemIds.COMPANY_TYPE,
  PROJECT_TYPE: SystemIds.PROJECT_TYPE,
  EVENT_TYPE: SystemIds.EVENT_TYPE,
  INSTITUTION_TYPE: SystemIds.INSTITUTION_TYPE,
  ROLE_TYPE: SystemIds.ROLE_TYPE,
  ARTICLE_TYPE: ContentIds.ARTICLE_TYPE,
  TALK_TYPE: ContentIds.TALK_TYPE,
  PODCAST_TYPE: ContentIds.PODCAST_TYPE,
  EPISODE_TYPE: ContentIds.EPISODE_TYPE,
  TOPIC_TYPE: ContentIds.TOPIC_TYPE,
  SKILL_TYPE: ContentIds.SKILL_TYPE,
};

const args = parseArgs(process.argv.slice(2));

if (!args.name) {
  console.error(
    "Usage: publish-entity.mjs --name <string> [--description <string>] [--type <TYPE>] [--space-id <uuid>] [--author <uuid>] [--dry-run]",
  );
  console.error(`Known --type values: ${Object.keys(TYPE_MAP).join(", ")}`);
  process.exit(2);
}

const typeKey = args.type ?? "DEFAULT_TYPE";
const typeId = TYPE_MAP[typeKey];
if (!typeId) {
  console.error(`Unknown --type "${typeKey}". Known: ${Object.keys(TYPE_MAP).join(", ")}`);
  process.exit(2);
}

if (args.name.endsWith(".")) {
  console.error(`Error: name must NOT end with a period. Got: "${args.name}"`);
  process.exit(2);
}
if (
  args.description !== undefined &&
  args.description !== true &&
  !args.description.endsWith(".")
) {
  console.error(`Error: description MUST end with a period. Got: "${args.description}"`);
  process.exit(2);
}

const raw = process.env.GEO_PRIVATE_KEY;
if (!raw) {
  console.error(
    "GEO_PRIVATE_KEY not set. Create .env.geo-publish and re-run with --env-file=.env.geo-publish",
  );
  process.exit(1);
}
const privateKey = raw.startsWith("0x") ? raw : `0x${raw}`;

const wallet = await getSmartAccountWalletClient({ privateKey });
const address = wallet.account.address;

// Auto-discover personal space if not given.
async function gql(query) {
  const res = await fetch("https://testnet-api.geobrowser.io/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

let personalSpaceId = null;
if (!args["space-id"] || !args.author) {
  const data = await gql(`{
    spaces(
      filter: { type: { is: PERSONAL }, address: { isInsensitive: "${address}" } }
      first: 1
    ) { id }
  }`);
  personalSpaceId = data.spaces[0]?.id ?? null;
  if (!personalSpaceId) {
    console.error(
      `No personal space found for ${address}. Create one with personalSpace.createSpace() first.`,
    );
    process.exit(1);
  }
}
const spaceId = args["space-id"] ?? personalSpaceId;
const author = args.author ?? personalSpaceId;

const { id: entityId, ops } = Graph.createEntity({
  name: args.name,
  description: args.description === true ? undefined : args.description,
  types: [typeId],
});

if (args["dry-run"]) {
  console.log(`[dry-run] would publish ${ops.length} ops`);
  console.log(
    JSON.stringify({ entityId, spaceId, author, name: args.name, type: typeKey }, null, 2),
  );
  process.exit(0);
}

const { editId, cid, to, calldata } = await personalSpace.publishEdit({
  name: `Add ${args.name}`,
  spaceId,
  ops,
  author,
  network: "TESTNET",
});

const txHash = await wallet.sendTransaction({ to, data: calldata });

console.log(
  JSON.stringify(
    {
      entityId,
      editId,
      cid,
      txHash,
      url: `https://www.geobrowser.io/space/${spaceId}/${entityId}`,
    },
    null,
    2,
  ),
);
