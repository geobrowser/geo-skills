# Example: create a current employment relation

This example relates a Person to a Company with `SystemIds.WORKS_AT_PROPERTY`. Optional start/end and role fields require schema discovery because SDK `0.20.1` does not export canonical IDs for every employment field.

## Discover before writing

Query a representative employment relation and record:

- The Person and Company entity IDs and their source spaces.
- The start-date and end-date property IDs, if used.
- The Role relation property, Role entity, and Role source space, if used.

Use explicit placeholders for discovered IDs; do not substitute a similarly named SDK constant.

## Build and publish

The surrounding signer/client setup is identical to `create-entity.md`.

```javascript
import {
  createGeoClient,
  createGeoWalletClient,
  GeoTestnetConfig,
  Ops,
  SystemIds,
} from "@geoprotocol/geo-sdk";
import { privateKeyToAccount } from "viem/accounts";

const PERSONAL_SPACE_ID = "YOUR_PERSONAL_SPACE_ID";
const PERSON_ID = "DISCOVERED_PERSON_ID";
const COMPANY_ID = "DISCOVERED_COMPANY_ID";
const COMPANY_SPACE_ID = "DISCOVERED_COMPANY_SPACE_ID";
const START_DATE_PROPERTY_ID = "DISCOVERED_START_DATE_PROPERTY_ID";
const END_DATE_PROPERTY_ID = "DISCOVERED_END_DATE_PROPERTY_ID";

const raw = process.env.GEO_PRIVATE_KEY;
if (!raw || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(raw)) {
  throw new Error("GEO_PRIVATE_KEY must be a 32-byte hexadecimal testnet key");
}
const privateKey = raw.startsWith("0x") ? raw : `0x${raw}`;
const signer = privateKeyToAccount(privateKey);
const geo = createGeoClient({ network: GeoTestnetConfig });
const wallet = await createGeoWalletClient({ signer, network: GeoTestnetConfig });

// Stable across reruns for this endpoint pair. Add your own deterministic suffix
// when representing multiple employment periods between the same entities.
const relationId = `${PERSON_ID.slice(0, 16)}${COMPANY_ID.slice(0, 16)}`;
const relationEntityId = `${COMPANY_ID.slice(0, 16)}${PERSON_ID.slice(0, 16)}`;

const employment = Ops.relations.create({
  id: relationId,
  entityId: relationEntityId,
  fromEntity: PERSON_ID,
  toEntity: COMPANY_ID,
  toSpace: COMPANY_SPACE_ID,
  type: SystemIds.WORKS_AT_PROPERTY,
  entityName: "Engineer at Acme",
  entityValues: [
    { property: START_DATE_PROPERTY_ID, type: "date", value: "2022-03-01" },
    { property: END_DATE_PROPERTY_ID, type: "date", value: "2024-11-30" },
  ],
});

const { to, calldata } = await geo.personalSpaces.publishEdit({
  name: "Add employment at Acme",
  spaceId: PERSONAL_SPACE_ID,
  author: PERSONAL_SPACE_ID,
  ops: employment.ops,
});
const txHash = await wallet.sendTransaction({ to, data: calldata });

console.log({ relationId: employment.id, txHash });
```

Use `toSpace` when the target entity is resolved from another space. If the source context or entity versions matter, discover and supply `fromSpace`, `fromVersion`, or `toVersion` rather than guessing them.

## Update or delete the relation

```javascript
const moved = Ops.relations.update({
  id: relationId,
  toSpace: NEW_COMPANY_SPACE_ID,
});

const removed = Ops.relations.delete({ id: relationId });
```

Publish exactly one intended operation list. An invalid or unknown relation ID is an error; an authorization or sponsorship failure must remain a failure.
