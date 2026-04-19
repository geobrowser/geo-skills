# Example: update properties and delete a relation

Edits are ops, same as creates. Bundle multiple changes into one publish.

## Update: add, change, unset values

```typescript
import {
  Graph,
  ContentIds,
  personalSpace,
  getSmartAccountWalletClient,
} from "@geoprotocol/geo-sdk";
import type { Op } from "@geoprotocol/grc-20";

const ENTITY_ID = "aaaa...";

const allOps: Op[] = [];

const { ops: updateOps } = Graph.updateEntity({
  id: ENTITY_ID,
  // Overwrite / add values
  values: [
    { property: ContentIds.WEB_URL_PROPERTY, type: "url", value: "https://new-site.example.com" },
  ],
  // Clear values
  unset: [{ property: ContentIds.LINKEDIN_PROPERTY }],
});
allOps.push(...updateOps);

const wallet = await getSmartAccountWalletClient({
  privateKey: process.env.GEO_PRIVATE_KEY as `0x${string}`,
});

await personalSpace.publishAndSend({
  name: "Update links",
  spaceId: "YOUR_PERSONAL_SPACE_ID",
  ops: allOps,
  author: "YOUR_PERSON_ENTITY_ID",
  wallet,
  network: "TESTNET",
});
```

## Delete a relation — use the EDGE id, not the relation's entityId

Every relation has two IDs. Query before deleting to confirm you're using the right one:

```graphql
{
  entity(id: "PARENT_ENTITY_ID") {
    relations(first: 100) {
      nodes {
        id # <-- EDGE id — use this to delete
        entityId # <-- relation-as-entity id — use this to update relation properties
        type {
          name
        }
        toEntity {
          id
          name
        }
      }
    }
  }
}
```

```typescript
const { ops: delOps } = Graph.deleteRelation({ id: relationEdgeId });
allOps.push(...delOps);
```

## Delete an entity

```typescript
const { ops: delOps } = Graph.deleteEntity({ id: entityId });
allOps.push(...delOps);
```

`Graph.deleteEntity` also removes **incoming relations** (backlinks to the entity), not just outgoing ones.

### Batch delete safety

When deleting many entities at once, share a `deletingIds: Set<string>` across all `deleteEntity` calls so orphan cleanup doesn't:

- Recurse infinitely on cyclic relations (`A → B → C → A`).
- Double-count relations from siblings that are also being deleted.

If you're only doing one or two deletes, ignore this — it's a batch-job concern.

## Bundling everything

Multiple edits in one publish keeps the edit history readable and costs one proposal instead of many:

```typescript
const allOps: Op[] = [];
allOps.push(...updateOps);
allOps.push(...delRelOps);
allOps.push(...createOps);

await personalSpace.publishAndSend({
  name: "Reorganize profile",
  spaceId: SPACE_ID,
  ops: allOps,
  author: AUTHOR_ID,
  wallet,
  network: "TESTNET",
});
```
