# geo-publish — SDK 0.20.1 reference

This is the detailed testnet reference for the latest-only publishing workflow. `SKILL.md` covers the shortest path.

## Packages and runtime

The shipped CLIs use this skill's frozen dependencies. Custom Node ESM scripts resolve dependencies from their own project and must install them locally:

```bash
npm install --save-exact @geoprotocol/geo-sdk@0.20.1 viem@2.37.6
```

```typescript
import {
  ContentIds,
  createGeoClient,
  createGeoWalletClient,
  GeoTestnetConfig,
  Ops,
  Position,
  SystemIds,
  TextBlock,
  type Op,
} from "@geoprotocol/geo-sdk";
import { SpaceRegistryAbi } from "@geoprotocol/geo-sdk/abis";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const raw = process.env.GEO_PRIVATE_KEY;
if (!raw || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(raw)) {
  throw new Error("GEO_PRIVATE_KEY must be a 32-byte hexadecimal testnet key");
}
const privateKey = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
const signer = privateKeyToAccount(privateKey);
const geo = createGeoClient({ network: GeoTestnetConfig });
const wallet = await createGeoWalletClient({ signer, network: GeoTestnetConfig });
const publicClient = createPublicClient({
  transport: http(GeoTestnetConfig.chain.rpcUrl),
});

async function sendAndWait({ to, calldata }: { to: `0x${string}`; calldata: `0x${string}` }) {
  const hash = await wallet.sendTransaction({ to, data: calldata });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction failed: ${hash}`);
  return hash;
}
```

`GeoTestnetConfig` supplies the current API origin, chain, Ultra Relay sponsorship URL, and Contracts V2 addresses. Publishing code should not duplicate them.

## Credential handling

Use a dedicated, least-privilege testnet key in a protected local or manual secret store. A local `.env.geo-publish` must be gitignored. Never place the key in a command argument, repository file, fork PR CI, artifact, transcript, or debug output. Redact errors before logging and rotate the key on suspected exposure.

## Entity operations

### `Ops.entities.create`

```typescript
const { id, ops } = Ops.entities.create({
  id: optionalEntityId,
  name: "Entity name",
  description: "A sentence ending with a period.",
  types: [SystemIds.DEFAULT_TYPE],
  values: [{ property: PROPERTY_ID, type: "text", value: "A value" }],
  relations: {
    [ContentIds.TOPICS_PROPERTY]: { toEntity: TOPIC_ID, toSpace: TOPIC_SPACE_ID },
  },
});
```

It returns `{ id, ops: Op[] }`. A supplied ID must be a valid Geo ID.

### `Ops.entities.update`

```typescript
const { ops } = Ops.entities.update({
  id: entityId,
  name: "Updated name",
  values: [{ property: PROPERTY_ID, type: "text", value: "Updated value" }],
  unset: [{ property: OLD_PROPERTY_ID }],
});
```

Omitting `language` from an `unset` entry clears all language slots for that property.

### `geo.entities.delete`

Entity deletion is a configured async workflow because the SDK fetches current values and relations in the specified space:

```typescript
const { ops: deleteOps } = await geo.entities.delete({ id: entityId, spaceId });
if (deleteOps.length === 0) {
  console.log("Nothing to delete in this space");
} else {
  const { to, calldata } = await geo.personalSpaces.publishEdit({
    name: "Delete entity",
    ops: deleteOps,
    author: PERSONAL_SPACE_ID,
    spaceId,
  });
  await wallet.sendTransaction({ to, data: calldata });
}
```

The helper may return an empty list if the entity is absent. Do not publish that empty list. The operation is scoped to `spaceId`; it makes no claim about copies or references elsewhere.

## Relation operations

```typescript
const created = Ops.relations.create({
  id: optionalRelationId,
  fromEntity,
  toEntity,
  type: relationTypeId,
  fromSpace: optionalFromSpaceId,
  toSpace: optionalToSpaceId,
  position: Position.generate(),
  entityName: "Optional relation entity",
  entityValues: [{ property: PROPERTY_ID, type: "date", value: "2026-07-30" }],
});

const updated = Ops.relations.update({
  id: created.id,
  position: Position.generateBetween(previousPosition, nextPosition),
  toSpace: newTargetSpaceId,
});

const removed = Ops.relations.delete({ id: created.id });
```

All three return `{ id, ops: Op[] }`. Use the relation ID returned by the builder or the relation `id` returned by GraphQL.

## Typed values

Each entry combines `property` with one typed value shape:

| Type       | Shape or example                                                              |
| ---------- | ----------------------------------------------------------------------------- |
| `text`     | `{ type: "text", value: "including https://example.com" }`                    |
| `boolean`  | `{ type: "boolean", value: true }`                                            |
| `integer`  | `{ type: "integer", value: 42n }`                                             |
| `float`    | `{ type: "float", value: 3.14 }`                                              |
| `decimal`  | `{ type: "decimal", exponent: -2, mantissa: { type: "i64", value: 12345n } }` |
| `date`     | `{ type: "date", value: "2026-07-30" }`                                       |
| `time`     | `{ type: "time", value: "14:30:00Z" }`                                        |
| `datetime` | `{ type: "datetime", value: "2026-07-30T14:30:00+02:00" }`                    |
| `bytes`    | `{ type: "bytes", value: new Uint8Array([1, 2]) }`                            |
| `point`    | `{ type: "point", lon: 16.3738, lat: 48.2082 }`                               |
| `schedule` | `{ type: "schedule", value: "FREQ=WEEKLY;BYDAY=MO" }`                         |

For a decimal outside the signed 64-bit range, encode the mantissa as `{ type: "big", bytes: Uint8Array }`. The exponent is a base-10 scale; for example, exponent `-2` and mantissa `12345n` represent `123.45`.

URLs use `text`. Time and datetime values include `Z` or an explicit offset.

## Text blocks and positions

`TextBlock.make` returns `Op[]`, not a result object:

```typescript
const firstPosition = Position.generate();
const firstBlockOps = TextBlock.make({
  fromId: entityId,
  text: "First paragraph.",
  position: firstPosition,
});

const nextPosition = Position.generateBetween(firstPosition, null);
const nextBlockOps = TextBlock.make({
  fromId: entityId,
  text: "Second paragraph.",
  position: nextPosition,
});

const ops: Op[] = [...firstBlockOps, ...nextBlockOps];
```

`Position.generateBetween(left, right)` inserts between two known positions. Pass `null` for an open side.

## Images

```typescript
const image = await geo.images.create({
  url: "https://example.com/cover.png",
  name: "Cover image",
  description: "The entity cover image.",
});

const attachment = Ops.relations.create({
  fromEntity: entityId,
  toEntity: image.id,
  type: ContentIds.AVATAR_PROPERTY,
});

const ops: Op[] = [...image.ops, ...attachment.ops];
```

The configured image workflow uploads the source and returns the image entity ID, CID, optional dimensions, and operations.

## Personal spaces

### Create a personal space

```typescript
if (await geo.personalSpaces.hasSpace({ address: signer.address })) {
  throw new Error("This signer already has a personal space");
}

const creation = geo.personalSpaces.create({
  name: "My personal space",
  accountAddress: signer.address,
});
await sendAndWait(creation);

const spaceIdHex = await publicClient.readContract({
  address: GeoTestnetConfig.contracts.SPACE_REGISTRY_ADDRESS,
  abi: SpaceRegistryAbi,
  functionName: "addressToSpaceId",
  args: [signer.address],
});
if (/^0x0{32}$/i.test(spaceIdHex)) throw new Error("Personal space registration was not found");
const spaceId = spaceIdHex.slice(2);

const profile = await geo.personalSpaces.publishEdit({
  name: "Create personal space profile",
  spaceId,
  author: spaceId,
  ops: creation.ops,
});
await sendAndWait(profile);

const topic = geo.personalSpaces.setTopic({
  spaceId,
  topicId: creation.spaceEntityId,
});
await sendAndWait(topic);
```

Registration alone is not the complete workflow. Publish the returned profile operations and set `creation.spaceEntityId` as the topic before treating the personal space as initialized.

### Publish an edit

```typescript
const { editId, cid, to, calldata } = await geo.personalSpaces.publishEdit({
  name: "Create entity",
  spaceId: PERSONAL_SPACE_ID,
  ops,
  author: PERSONAL_SPACE_ID,
});
const txHash = await wallet.sendTransaction({ to, data: calldata });
```

The author is a personal space ID, not a Person entity ID or wallet address. Do not submit when `ops.length === 0`.

## DAO spaces and Contracts V2

### Inspect governance before proposing

```graphql
{
  space(id: "DAO_SPACE_ID") {
    id
    editors(first: 20) {
      nodes {
        memberSpaceId
      }
    }
    spaceVotingSetting {
      quorum
      duration
      partialPercentageSupportThreshold
      universalPercentageSupportThreshold
      flatSupportThreshold
      disableFastPathAccessForNewMembers
      executionGracePeriod
    }
    proposals(first: 5) {
      id
      executedAt
      currentVersion
      proposalVersions(first: 5) {
        proposalVersion
        votingMode
        startTime
        endTime
        executeBy
        yesCount
        noCount
        abstainCount
      }
    }
  }
}
```

Editor identity is `memberSpaceId`. Read the current voting settings instead of assuming threshold, duration, or fast-path access.

### Propose, vote, and execute

```typescript
const proposal = await geo.daoSpaces.proposeEdit({
  name: "Create entity",
  ops,
  author: PERSONAL_SPACE_ID,
  callerSpaceId: PERSONAL_SPACE_ID,
  daoSpaceId: DAO_SPACE_ID,
  votingMode: "SLOW",
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

// After the API reports endTime <= the current Unix time, a passing tally,
// and executeBy still in the future, execute the proposal explicitly.
const execution = geo.daoSpaces.executeProposal({
  authorSpaceId: PERSONAL_SPACE_ID,
  spaceId: DAO_SPACE_ID,
  proposalId: proposal.proposalId,
});
await wallet.sendTransaction({ to: execution.to, data: execution.calldata });
```

`proposeEdit` returns `proposalId` and `versionId` together with the edit identifiers and transaction fields. When reading the result from the API, match `currentVersion` to `proposalVersions[].proposalVersion`. Use the returned version when voting. For `SLOW` voting, submit `executeProposal` only after the matching version has ended, its tally passes, and `executeBy` has not elapsed. No DAO address belongs in caller input.

For a proposal update, set `updateProposal: true`, retain its `proposalId`, and supply the intended `versionId` when required. Membership, editor, voting-settings, and execution methods use `authorSpaceId` and `spaceId`.

## Exported IDs and schema discovery

Only reference an SDK constant after checking the `0.20.1` export. The supported categories are `DEFAULT`, `PERSON`, `COMPANY`, `PROJECT`, `ROLE`, `ARTICLE`, `TOPIC`, and `SKILL`; the simple publishing CLI maps its `_TYPE` values to these exports:

```text
SystemIds.DEFAULT_TYPE
SystemIds.PERSON_TYPE
SystemIds.COMPANY_TYPE
SystemIds.PROJECT_TYPE
SystemIds.ROLE_TYPE
ContentIds.ARTICLE_TYPE
ContentIds.TOPIC_TYPE
ContentIds.SKILL_TYPE
```

Common current relation/property exports used by these guides:

```text
SystemIds.WORKS_AT_PROPERTY
SystemIds.COVER_PROPERTY
ContentIds.AVATAR_PROPERTY
ContentIds.AUTHORS_PROPERTY
ContentIds.GITHUB_PROPERTY
ContentIds.LINKEDIN_PROPERTY
ContentIds.ROLES_PROPERTY
ContentIds.SKILLS_PROPERTY
ContentIds.TOPICS_PROPERTY
ContentIds.WEBSITE_PROPERTY
ContentIds.WEB_URL_PROPERTY
ContentIds.X_PROPERTY
```

For a field without an exported canonical property—birth date and employment start/end dates, for example—query a representative entity, capture the property ID and source space, and use an explicit placeholder such as `START_DATE_PROPERTY_ID`. Never substitute a similarly named constant.

## Failure paths

| Symptom                             | Meaning                                                 | Response                                                                |
| ----------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| Missing or malformed key            | No safe signer can be constructed                       | Fail before creating a client or wallet.                                |
| No personal space                   | Signer cannot author the normal workflow                | Create one or stop; do not use a Person entity as author.               |
| Empty operation list                | Nothing can be published                                | Return a no-op result; do not call an edit method.                      |
| Not authorized for DAO              | Signer's personal space lacks the required role or vote | Stop and correct authorization; do not report a skip.                   |
| Sponsorship or receipt failure      | The write did not complete                              | Fail closed and keep the transaction/edit IDs for diagnosis.            |
| Proposal version changed            | A vote may target stale governance state                | Re-query `currentVersion` and compare it with the intended `versionId`. |
| Entity absent during deletion       | `geo.entities.delete` can return no operations          | Treat it as an idempotent no-op in that space.                          |
| Unknown property or relation schema | No trustworthy exported or discovered ID is available   | Discover the schema; never invent the ID.                               |

## Live testnet acceptance

The release-gate harness in `test/live-testnet.test.mjs` proves the production CLI's SDK `0.20.1` Ultra Relay path, Contracts V2 destinations, personal-space indexing and deletion, and an isolated DAO proposal, vote, and execution. The default test suite skips the credentialed write with a clear reason and never reads `GEO_PRIVATE_KEY`.

Run it only from a protected manual environment. Set `GEO_LIVE_TESTS=1` and inject `GEO_PRIVATE_KEY` through the environment using your protected secret store, then invoke:

```bash
npm run test:live
```

Do not put the private key in the command, a shell-history entry, an env file that is not gitignored, CI, a fork, an artifact, or debug output. The opt-in harness fails—not skips—when its key is missing or malformed, when it detects CI or a fork/pull-request context, when the configured chain, transaction target, calldata, DAO identity, sole editor, or topic differs from the intended fixture, or when a receipt or indexing check fails.

The harness creates uniquely named `GEO-SDK-0.20.1 acceptance` fixtures. Its personal-space entity is deleted in that space and a repeated deletion must be an empty no-op. DAO spaces, DAO topic entities, proposals, proposal versions, votes, and transaction history are immutable testnet artifacts and remain after the run. Successful output contains only their public IDs and transaction hashes; it never contains the private key or sponsorship URL.

The live run polls the configured API every five seconds for at most two minutes per indexing checkpoint. It requires the signer's existing personal space, creates a disposable DAO with that space as its sole editor and a minimum 60-second voting duration, preflights the DAO/editor/topic tuple before every further signature, proposes a `SLOW` edit, votes `YES` with the exact returned proposal and version IDs, and explicitly executes the passing proposal inside its execution window. A timeout is a failed release gate, not evidence of acceptance.
