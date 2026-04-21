# Example: create a "Worked at" relation with dates and a role

Relations in Geo are entities themselves — they can carry their own properties. This example attaches a `Worked at` relation from a Person to a Company, with a start date, end date, and a Role classification.

## Code

```typescript
import {
  Graph,
  SystemIds,
  ContentIds,
  personalSpace,
  getSmartAccountWalletClient,
} from "@geoprotocol/geo-sdk";
import type { Op } from "@geoprotocol/grc-20";

const PERSONAL_SPACE_ID = "ffff..."; // from bin/whoami.mjs — doubles as author
const PERSON_ID = "aaaa...";
const COMPANY_ID = "bbbb...";
const COMPANY_SPACE = "cccc..."; // space the Company lives in
const ROLE_ENGINEER = "dddd..."; // discovered role classification entity
const ROLES_SPACE = "eeee...";

async function main() {
  const allOps: Op[] = [];

  // Deterministic relation entity ID: 16 chars from each side.
  // Reruns of this script will target the same relation and not duplicate.
  const relEntityId = `${PERSON_ID.slice(0, 16)}${COMPANY_ID.slice(0, 16)}`;

  const { ops } = Graph.createRelation({
    fromEntity: PERSON_ID,
    toEntity: COMPANY_ID,
    type: SystemIds.WORKED_AT_PROPERTY,
    toSpace: COMPANY_SPACE, // target entity in different space

    // Relation-as-entity fields:
    entityId: relEntityId,
    entityName: "Senior Engineer at Acme",
    entityValues: [
      { property: SystemIds.START_DATE_PROPERTY, type: "date", value: "2022-03-01" },
      { property: SystemIds.END_DATE_PROPERTY, type: "date", value: "2024-11-30" },
    ],
    entityRelations: {
      [ContentIds.ROLES_PROPERTY]: {
        toEntity: ROLE_ENGINEER,
        toSpace: ROLES_SPACE,
      },
    },
  });
  allOps.push(...ops);

  const raw = process.env.GEO_PRIVATE_KEY;
  if (!raw) throw new Error("GEO_PRIVATE_KEY not set (create .env.geo-publish).");
  const privateKey = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  const wallet = await getSmartAccountWalletClient({ privateKey });

  const { to, calldata } = await personalSpace.publishEdit({
    name: "Add work history: Senior Engineer at Acme",
    spaceId: PERSONAL_SPACE_ID, // usually also used as `author` — see bin/whoami.mjs
    ops: allOps,
    author: PERSONAL_SPACE_ID,
    network: "TESTNET",
  });
  const txHash = await wallet.sendTransaction({ to, data: calldata });
  console.log({ txHash });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

## Why deterministic IDs matter

Without `entityId`, rerunning this script creates a brand-new relation entity every time. Users see duplicate "Worked at" cards and have to clean up by hand.

`slice(from, 16) + slice(to, 16)` gives a stable, readable ID that's unique per (from, to) pair. If you need multiple relations with the same endpoints (e.g. two stints at the same company), include a suffix: `slice(from, 16) + slice(to, 12) + "0001"`.

## Finding the role classification ID

Roles live in a dedicated space. Discover an existing role entity before hardcoding:

```graphql
{
  entities(
    typeId: "ROLE_TYPE_ID"
    filter: { name: { includesInsensitive: "engineer" } }
    first: 10
  ) {
    id
    name
    spaceIds
  }
}
```

Then wire the ID (and its space) into your script.
