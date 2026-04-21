# Example: create a Person entity and publish to a personal space

End-to-end: discover your identity, build an entity, publish in one transaction. Use this pattern when `bin/publish-entity.mjs` is too limited (e.g. you need `values`, `relations`, or text blocks). For a plain "create one entity", prefer the CLI — see SKILL.md Quickstart step 3.

## Prereqs

- Skill deps installed inside the skill dir: `(cd <skill-dir> && bun install)` — one-time, idempotent.
- `.env.geo-publish` in the user's project root contains `GEO_PRIVATE_KEY=0x...`; file is in `.gitignore`.
- Run `node --env-file=.env.geo-publish <skill-dir>/bin/whoami.mjs` and note your **Personal space** ID — it's both the publish target and the `author` value.
- Run this script with `NODE_PATH=<skill-dir>/node_modules node --env-file=.env.geo-publish <this-script>.mjs` (or the equivalent Bun command). No SDK install in the user's project.

## Code

```typescript
// publish-person.ts
// Run with: bun --env-file=.env.geo-publish run publish-person.ts
import {
  Graph,
  SystemIds,
  ContentIds,
  personalSpace,
  getSmartAccountWalletClient,
} from "@geoprotocol/geo-sdk";
import type { Op } from "@geoprotocol/grc-20";

const PERSONAL_SPACE_ID = "YOUR_PERSONAL_SPACE_ID"; // from bin/whoami.mjs

async function main() {
  // 1. Schema discovery: Person is well-known via SystemIds.PERSON_TYPE.
  //    For unfamiliar types, query an existing entity first (see geo-query skill).

  // 2. Build ops
  const allOps: Op[] = [];

  const { id: entityId, ops: entityOps } = Graph.createEntity({
    name: "Ada Lovelace", // no trailing period
    description: "A 19th-century mathematician and writer.", // ends with period
    types: [SystemIds.PERSON_TYPE],
    values: [
      {
        property: ContentIds.WEB_URL_PROPERTY,
        type: "url",
        value: "https://en.wikipedia.org/wiki/Ada_Lovelace",
      },
      // { property: BIRTH_DATE_PROP, type: "date", value: "1815-12-10" },
    ],
  });
  allOps.push(...entityOps);

  // 3. Submit — personal space publishes instantly
  const raw = process.env.GEO_PRIVATE_KEY;
  if (!raw) throw new Error("GEO_PRIVATE_KEY not set (create .env.geo-publish).");
  // Users often paste the key without 0x; the SDK errors cryptically without it.
  const privateKey = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  const wallet = await getSmartAccountWalletClient({ privateKey });

  const { editId, cid, to, calldata } = await personalSpace.publishEdit({
    name: "Add Ada Lovelace",
    spaceId: PERSONAL_SPACE_ID,
    ops: allOps,
    author: PERSONAL_SPACE_ID, // the author field is your personal space ID, not a Person entity
    network: "TESTNET",
  });

  const txHash = await wallet.sendTransaction({ to, data: calldata });

  console.log({ entityId, editId, cid, txHash });
  console.log(`https://www.geobrowser.io/space/${PERSONAL_SPACE_ID}/${entityId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

## Verifying

After the tx confirms, query the entity back:

```bash
curl -s 'https://testnet-api.geobrowser.io/graphql' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\"{ entity(id: \\\"$ENTITY_ID\\\") { id name description types { name } } }\"}" | jq .
```

## Going to a DAO space instead

Replace the submit block with:

```typescript
import { daoSpace } from "@geoprotocol/geo-sdk";

const { proposalId, editId, cid, to, calldata } = await daoSpace.proposeEdit({
  name: "Add Ada Lovelace",
  ops: allOps,
  author: PERSONAL_SPACE_ID, // still your personal space ID
  daoSpaceAddress: "0x..." as `0x${string}`,
  callerSpaceId: "0x..." as `0x${string}`,
  daoSpaceId: "0x..." as `0x${string}`,
  votingMode: "FAST",
  network: "TESTNET",
});
const proposeTxHash = await wallet.sendTransaction({ to, data: calldata });
```

Your wallet must be an editor of the DAO space. `votingMode: "FAST"` with enough existing approvals auto-executes on propose; `"SLOW"` runs a 24h vote at 51% threshold and needs a follow-up `daoSpace.voteProposal` call.
