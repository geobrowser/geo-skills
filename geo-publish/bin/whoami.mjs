#!/usr/bin/env node
// whoami.mjs — derives wallet address, personal space, and editable DAO spaces
// from GEO_PRIVATE_KEY. No local SDK install needed in the user's project;
// resolves deps from this skill's own node_modules.
//
// Run from the user's project directory (where .env.geo-publish lives):
//   node   --env-file=.env.geo-publish <skill-dir>/bin/whoami.mjs
//   bun    --env-file=.env.geo-publish run <skill-dir>/bin/whoami.mjs

import { getSmartAccountWalletClient } from "@geoprotocol/geo-sdk";

const raw = process.env.GEO_PRIVATE_KEY;
if (!raw) {
  console.error("GEO_PRIVATE_KEY not set.");
  console.error("Create .env.geo-publish at the project root containing: GEO_PRIVATE_KEY=0x...");
  console.error("Then re-run with --env-file=.env.geo-publish");
  process.exit(1);
}
const privateKey = raw.startsWith("0x") ? raw : `0x${raw}`;

const GQL_URL = "https://testnet-api.geobrowser.io/graphql";

async function gql(query) {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

const wallet = await getSmartAccountWalletClient({ privateKey });
const address = wallet.account.address;

const personal = await gql(`{
  spaces(
    filter: { type: { is: PERSONAL }, address: { isInsensitive: "${address}" } }
    first: 1
  ) { id }
}`);
const personalSpaceId = personal.spaces[0]?.id ?? null;

let editable = [];
if (personalSpaceId) {
  const ed = await gql(`{
    editors(filter: { memberSpaceId: { is: "${personalSpaceId}" } }, first: 100) {
      space { id type topic { name } }
    }
  }`);
  editable = ed.editors;
}

console.log(`Wallet address : ${address}`);
console.log(`Personal space : ${personalSpaceId ?? "(none — create one before publishing)"}`);
console.log(`Author (pass as \`author\`): ${personalSpaceId ?? "(needs personal space)"}`);
console.log("");
console.log("Spaces you can publish to as editor:");
if (personalSpaceId) console.log(`  - ${personalSpaceId}  [PERSONAL]  (your own)`);
for (const { space } of editable) {
  const label = space.topic?.name ? `  ${space.topic.name}` : "";
  console.log(`  - ${space.id}  [${space.type}]${label}`);
}
if (!personalSpaceId && editable.length === 0) {
  console.log("  (none)");
}
