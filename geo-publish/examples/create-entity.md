# Example: create a Person in a personal space

This example is testnet-only and uses the stable `0.20.1` client and sponsored wallet workflow.

## Prepare

Install the custom script's direct dependencies in its project:

```bash
npm install --save-exact @geoprotocol/geo-sdk@0.20.1 viem@2.37.6
```

Create a gitignored `.env.geo-publish` in a protected local secret store with a dedicated, least-privilege testnet key. Never pass the key in command arguments or expose it to fork PR CI, artifacts, or debug output. Rotate it on suspected exposure.

Run `bin/whoami.mjs` from the installed skill and copy the reported personal space ID into the script.

## Script

```javascript
// publish-person.mjs
import {
  ContentIds,
  createGeoClient,
  createGeoWalletClient,
  GeoTestnetConfig,
  Ops,
  SystemIds,
} from "@geoprotocol/geo-sdk";
import { privateKeyToAccount } from "viem/accounts";

const PERSONAL_SPACE_ID = "YOUR_PERSONAL_SPACE_ID";

const raw = process.env.GEO_PRIVATE_KEY;
if (!raw || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(raw)) {
  throw new Error("GEO_PRIVATE_KEY must be a 32-byte hexadecimal testnet key");
}
const privateKey = raw.startsWith("0x") ? raw : `0x${raw}`;
const signer = privateKeyToAccount(privateKey);
const geo = createGeoClient({ network: GeoTestnetConfig });
const wallet = await createGeoWalletClient({ signer, network: GeoTestnetConfig });

/** @type {import("@geoprotocol/geo-sdk").Op[]} */
const allOps = [];

const entity = Ops.entities.create({
  name: "Ada Lovelace",
  description: "A 19th-century mathematician and writer.",
  types: [SystemIds.PERSON_TYPE],
  values: [
    {
      property: ContentIds.WEB_URL_PROPERTY,
      type: "text",
      value: "https://en.wikipedia.org/wiki/Ada_Lovelace",
    },
  ],
});
allOps.push(...entity.ops);

const { editId, cid, to, calldata } = await geo.personalSpaces.publishEdit({
  name: "Add Ada Lovelace",
  spaceId: PERSONAL_SPACE_ID,
  ops: allOps,
  author: PERSONAL_SPACE_ID,
});
const txHash = await wallet.sendTransaction({ to, data: calldata });

console.log({ entityId: entity.id, editId, cid, txHash });
```

Run it without putting the key on the command line:

```bash
node --env-file=.env.geo-publish publish-person.mjs
```

## Verify indexing

Query the returned entity ID through the current API:

```graphql
{
  entity(id: "ENTITY_ID") {
    id
    name
    description
    types {
      id
      name
    }
  }
}
```

POST that query to `https://api-testnet.geobrowser.io/graphql`. Treat transport errors, GraphQL errors, a failed transaction receipt, and an indexing timeout as failures rather than successful publication.

## DAO variant

Confirm the personal space is authorized, then query the target space's editors and `spaceVotingSetting`. Replace the personal-space submission with:

```javascript
const DAO_SPACE_ID = "YOUR_DAO_SPACE_ID";

const proposal = await geo.daoSpaces.proposeEdit({
  name: "Add Ada Lovelace",
  ops: allOps,
  author: PERSONAL_SPACE_ID,
  callerSpaceId: PERSONAL_SPACE_ID,
  daoSpaceId: DAO_SPACE_ID,
  votingMode: "FAST",
});
await wallet.sendTransaction({ to: proposal.to, data: proposal.calldata });

const vote = geo.daoSpaces.voteProposal({
  authorSpaceId: PERSONAL_SPACE_ID,
  spaceId: DAO_SPACE_ID,
  proposalId: proposal.proposalId,
  versionId: proposal.versionId,
  vote: "YES",
});
await wallet.sendTransaction({ to: vote.to, data: vote.calldata });
```

Read the proposal's `currentVersion` and matching `proposalVersions` entry after indexing. Do not assume a fast proposal has executed merely because submission succeeded.
