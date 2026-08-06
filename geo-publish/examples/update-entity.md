# Example: update and delete in one space

Updates use pure `Ops` builders. Entity deletion uses the configured client because it reads the entity's current state in the target space.

## Update values and relations

```javascript
import { createGeoClient, GeoTestnetConfig, Ops, Position } from "@geoprotocol/geo-sdk";

const geo = createGeoClient({ network: GeoTestnetConfig });

const entityUpdate = Ops.entities.update({
  id: ENTITY_ID,
  values: [
    {
      property: WEBSITE_PROPERTY_ID,
      type: "text",
      value: "https://new-site.example.com",
    },
  ],
  unset: [{ property: OLD_LINK_PROPERTY_ID }],
});

const relationUpdate = Ops.relations.update({
  id: RELATION_ID,
  position: Position.generate(),
});

const relationDelete = Ops.relations.delete({ id: OBSOLETE_RELATION_ID });

const allOps = [...entityUpdate.ops, ...relationUpdate.ops, ...relationDelete.ops];
```

`WEBSITE_PROPERTY_ID` and `OLD_LINK_PROPERTY_ID` must be exported IDs or values discovered from the schema. URLs are stored as `text` values.

Publish `allOps` through `geo.personalSpaces.publishEdit(...)` and submit its `to` and `calldata` with the wallet pattern in `create-entity.md`.

## Delete an entity within a space

```javascript
const { ops: deleteOps } = await geo.entities.delete({ id: entityId, spaceId });

if (deleteOps.length === 0) {
  console.log("Nothing to delete in this space");
} else {
  const { to, calldata } = await geo.personalSpaces.publishEdit({
    name: "Delete entity",
    spaceId,
    ops: deleteOps,
    author: PERSONAL_SPACE_ID,
  });
  await wallet.sendTransaction({ to, data: calldata });
}
```

The deletion is asynchronous, idempotent when the entity is absent, and scoped to `spaceId`. It does not establish what happens to copies or references in any other space.

For a DAO target, pass the non-empty `deleteOps` through the version-aware proposal, vote, and execution workflow in `create-entity.md`.

## Failure handling

- Do not publish an empty operation list.
- Stop if the target space does not match the user's confirmed intent.
- Keep a missing entity in the selected space as a no-op, but treat malformed API data as an error.
- Treat an unauthorized proposal, sponsorship failure, failed receipt, or indexing timeout as a failure.
