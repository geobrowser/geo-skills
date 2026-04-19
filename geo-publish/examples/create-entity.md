# Example: create a Person entity and publish to a personal space

End-to-end: discover the Person schema, build an entity, publish with a single transaction.

## Prereqs

- `GEO_PRIVATE_KEY` env var set.
- You have your personal space ID (32-char hex).
- You have your own Person entity ID (for the `author` field).

## Code

```typescript
// publish-person.ts — run with `bun run publish-person.ts`
import {
  Graph,
  SystemIds,
  ContentIds,
  personalSpace,
  getSmartAccountWalletClient,
} from "@geoprotocol/geo-sdk";
import type { Op } from "@geoprotocol/grc-20";

const SPACE_ID = "YOUR_PERSONAL_SPACE_ID";
const AUTHOR_ID = "YOUR_PERSON_ENTITY_ID";

async function main() {
  // 1. (Schema discovery is minimal here — Person is a well-known SDK type.
  //    For unfamiliar types, query an existing entity first; see geo-query skill.)

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
      // date properties take YYYY-MM-DD
      // { property: BIRTH_DATE_PROP, type: "date", value: "1815-12-10" },
    ],
  });
  allOps.push(...entityOps);

  // 3. Submit — personal space publishes instantly
  const wallet = await getSmartAccountWalletClient({
    privateKey: process.env.GEO_PRIVATE_KEY as `0x${string}`,
  });

  const { editId, cid, txHash } = await personalSpace.publishAndSend({
    name: "Add Ada Lovelace",
    spaceId: SPACE_ID,
    ops: allOps,
    author: AUTHOR_ID,
    wallet,
    network: "TESTNET",
  });

  console.log({ entityId, editId, cid, txHash });
  console.log(`https://www.geobrowser.io/space/${SPACE_ID}/${entityId}`);
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

const { proposalId, proposeTxHash, voteTxHash } = await daoSpace.publishAndVote({
  name: "Add Ada Lovelace",
  ops: allOps,
  author: wallet.account.address,
  wallet,
  daoSpaceAddress: "0x..." as `0x${string}`,
  callerSpaceId: "0x..." as `0x${string}`,
  daoSpaceId: "0x..." as `0x${string}`,
  votingMode: "FAST",
  network: "TESTNET",
});
```

Your wallet must be an editor of the DAO space. `votingMode: "FAST"` needs one editor approval; `"SLOW"` runs a 24h vote at 51% threshold.
