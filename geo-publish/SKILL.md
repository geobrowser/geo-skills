---
name: geo-publish
description: Publish entities and relations to the Geo knowledge graph with Geo SDK 0.20.1. Use when creating, updating, or deleting entities and relations, publishing personal-space edits, or proposing DAO-space edits.
metadata:
  author: geobrowser
  version: "0.2.0"
---

# Geo Knowledge Graph — Publishing

Publish testnet entities, relations, images, and edits with `@geoprotocol/geo-sdk@0.20.1` and Contracts V2.

## When to apply

Use this skill to:

- Create or update entities and relations.
- Delete a relation or delete an entity within one space.
- Publish an edit to a personal space.
- Propose and vote on an edit in a DAO space.

This skill is testnet-only and latest-only. Do not add an old-SDK or old-endpoint fallback.

## Prerequisites

### Shipped CLIs

The shipped `bin/whoami.mjs` and `bin/publish-entity.mjs` resolve dependencies from this skill directory. Install them once:

```bash
(cd <skill-dir> && bun install --frozen-lockfile)
```

Run them from the user's project with Node 20.6+ or Bun:

```bash
node --env-file=.env.geo-publish <skill-dir>/bin/whoami.mjs
node --env-file=.env.geo-publish <skill-dir>/bin/publish-entity.mjs --name "Ada Lovelace" --type PERSON_TYPE
```

### Custom project scripts

Node ESM resolves packages from the script's project; it does not resolve them from an environment module-path override. A custom `.mjs` or `.ts` script must install its own exact SDK and direct `viem` dependency:

```bash
npm install --save-exact @geoprotocol/geo-sdk@0.20.1 viem@2.37.6
# or: bun add --exact @geoprotocol/geo-sdk@0.20.1 viem@2.37.6
```

### Credentials

Use a dedicated, least-privilege testnet key. Put `GEO_PRIVATE_KEY=0x...` in `.env.geo-publish`, store it through a protected local or manual secret store, and add the env file to `.gitignore`.

- Ask the user to create the real env file in an editor or separate terminal you cannot see.
- Never paste or write the key in chat, command arguments, repository files, fork PR CI, build artifacts, or debug output.
- Never print the key, a secret-bearing URL, or an error that has not been redacted.
- Rotate the key immediately after actual or suspected exposure.

The signer also needs a personal space. DAO work additionally requires the intended editor or voting authorization for the target DAO space.

## Quickstart

### 1. Discover the signer and spaces

```bash
node --env-file=.env.geo-publish <skill-dir>/bin/whoami.mjs
```

The command prints the signer address, personal space ID, and editable spaces. The personal space ID is both the usual personal-space target and the `author` for an edit.

If no personal space exists, create one with the configured client's `geo.personalSpaces.create(...)` workflow before publishing. See `reference.md`.

### 2. Confirm intent

Before a write, confirm the target space, entity name, type, description, and whether the target is personal or DAO-governed. For a DAO write, also confirm the current voting settings and authorization.

### 3. Publish a simple entity

```bash
node --env-file=.env.geo-publish <skill-dir>/bin/publish-entity.mjs \
  --name "Ada Lovelace" \
  --description "A 19th-century mathematician." \
  --type PERSON_TYPE
```

Omit `--type` to use `SystemIds.DEFAULT_TYPE`. The eight supported categories are `DEFAULT`, `PERSON`, `COMPANY`, `PROJECT`, `ROLE`, `ARTICLE`, `TOPIC`, and `SKILL`; the CLI spells their values `DEFAULT_TYPE`, `PERSON_TYPE`, `COMPANY_TYPE`, `PROJECT_TYPE`, `ROLE_TYPE`, `ARTICLE_TYPE`, `TOPIC_TYPE`, and `SKILL_TYPE`.

Use `--dry-run` to inspect the operation count and IDs without creating a transaction.

## Canonical SDK setup

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
import { privateKeyToAccount } from "viem/accounts";

const raw = process.env.GEO_PRIVATE_KEY;
if (!raw) throw new Error("GEO_PRIVATE_KEY is not set");
const privateKey = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
const signer = privateKeyToAccount(privateKey);

const geo = createGeoClient({ network: GeoTestnetConfig });
const wallet = await createGeoWalletClient({ signer, network: GeoTestnetConfig });
```

Use `GeoTestnetConfig` as the authority for the API origin, chain, sponsorship route, and contract addresses. Do not copy those values into publishing code.

## Build operations

Pure operation builders return `{ id, ops }`. Accumulate `Op[]` and publish once:

```typescript
const allOps: Op[] = [];

const entity = Ops.entities.create({
  name: "Ada Lovelace",
  description: "A 19th-century mathematician.",
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

const topicRelation = Ops.relations.create({
  fromEntity: entity.id,
  toEntity: TOPIC_ID,
  type: ContentIds.TOPICS_PROPERTY,
});
allOps.push(...topicRelation.ops);
```

Use these current builders:

- `Ops.entities.create(...)` and `Ops.entities.update(...)`.
- `Ops.relations.create(...)`, `Ops.relations.update(...)`, and `Ops.relations.delete(...)`.
- `geo.entities.delete(...)` for entity deletion because it must read the current state in a specific space.

Do not guess an unexported property ID. Discover the schema with `geo-query`, assign the returned ID to a clearly named placeholder such as `BIRTH_DATE_PROPERTY_ID`, and record its source space.

## Publish to a personal space

```typescript
const { editId, cid, to, calldata } = await geo.personalSpaces.publishEdit({
  name: "Add Ada Lovelace",
  spaceId: PERSONAL_SPACE_ID,
  ops: allOps,
  author: PERSONAL_SPACE_ID,
});

const txHash = await wallet.sendTransaction({ to, data: calldata });
```

An empty operation list is invalid. Treat an empty list from a conditional workflow as a no-op instead of calling the publish method.

## Propose and vote in a DAO space

First query the DAO space's `spaceVotingSetting`, editors, and active proposal data. Contracts V2 identifies the caller and DAO with space IDs; callers do not supply a DAO contract address.

```typescript
const proposal = await geo.daoSpaces.proposeEdit({
  name: "Add Ada Lovelace",
  ops: allOps,
  author: PERSONAL_SPACE_ID,
  callerSpaceId: PERSONAL_SPACE_ID,
  daoSpaceId: DAO_SPACE_ID,
  votingMode: "FAST",
});

const proposeTxHash = await wallet.sendTransaction({
  to: proposal.to,
  data: proposal.calldata,
});

const vote = geo.daoSpaces.voteProposal({
  authorSpaceId: PERSONAL_SPACE_ID,
  spaceId: DAO_SPACE_ID,
  proposalId: proposal.proposalId,
  versionId: proposal.versionId,
  vote: "YES",
});

const voteTxHash = await wallet.sendTransaction({ to: vote.to, data: vote.calldata });
```

Retain `proposalId` and `versionId`. In the API, read `currentVersion` and the matching entry in `proposalVersions`; a vote must target the intended version. Do not assume fast-path eligibility or fixed thresholds—read the target space's current settings.

## Updates and deletion

```typescript
const update = Ops.entities.update({
  id: entityId,
  values: [{ property: WEBSITE_PROPERTY_ID, type: "text", value: "https://example.com" }],
  unset: [{ property: OLD_PROPERTY_ID }],
});

const move = Ops.relations.update({ id: relationId, position: Position.generate() });
const removeRelation = Ops.relations.delete({ id: relationId });
```

Entity deletion is asynchronous and space-scoped. It reads the current entity values and relations in the target space and may return no operations when the entity is absent:

```typescript
const { ops: deleteOps } = await geo.entities.delete({ id: entityId, spaceId });
if (deleteOps.length === 0) {
  console.log("Nothing to delete in this space");
} else {
  const { to, calldata } = await geo.personalSpaces.publishEdit({
    name: "Delete entity",
    spaceId,
    author: PERSONAL_SPACE_ID,
    ops: deleteOps,
  });
  await wallet.sendTransaction({ to, data: calldata });
}
```

This only describes deletion within `spaceId`. Make no assumption about copies or references in other spaces.

## Text blocks and ordered relations

`TextBlock.make(...)` returns `Op[]` directly. Generate positions explicitly:

```typescript
const firstPosition = Position.generate();
const firstBlockOps = TextBlock.make({
  fromId: entityId,
  text: "First paragraph.",
  position: firstPosition,
});

const secondPosition = Position.generateBetween(firstPosition, null);
const secondBlockOps = TextBlock.make({
  fromId: entityId,
  text: "Second paragraph.",
  position: secondPosition,
});

allOps.push(...firstBlockOps, ...secondBlockOps);
```

Use one paragraph per block.

## Images

```typescript
const image = await geo.images.create({
  url: "https://example.com/ada.png",
  name: "Ada Lovelace portrait",
  description: "A portrait of Ada Lovelace.",
});
allOps.push(...image.ops);
```

Attach the image entity with `Ops.relations.create(...)` and an exported relation ID such as `ContentIds.AVATAR_PROPERTY`.

## Typed values

URLs are text values. Decimal values carry an exponent plus either an `i64` bigint mantissa or a big-endian byte mantissa. Time and datetime strings include a timezone.

```typescript
const values = [
  { property: WEBSITE_PROPERTY_ID, type: "text", value: "https://example.com" },
  {
    property: PRICE_PROPERTY_ID,
    type: "decimal",
    exponent: -2,
    mantissa: { type: "i64", value: 12345n },
  },
  { property: OPENING_TIME_PROPERTY_ID, type: "time", value: "14:30:00Z" },
  {
    property: EVENT_START_PROPERTY_ID,
    type: "datetime",
    value: "2026-07-30T14:30:00+02:00",
  },
] as const;
```

Every placeholder above must come from schema discovery unless the SDK exports that exact property ID.

## Error and safety checks

- Fail before any network call when the key is missing or malformed.
- Verify the target is testnet and the transaction destination matches `GeoTestnetConfig` before submitting.
- Treat API transport failures, GraphQL errors, missing response data, authorization failures, and sponsorship failures as different errors.
- Never turn an authorization or sponsorship failure into a skipped write.
- Submit each transaction once, record the transaction hash and edit/proposal IDs, and verify indexing through the current API.
- Keep U5-style live writes out of deterministic CI; use a dedicated testnet key in a protected manual release environment.

## More

- `reference.md` — current method shapes, IDs, values, governance queries, and troubleshooting.
- `examples/create-entity.md` — complete personal-space publish.
- `examples/create-relation.md` — current employment relation with discovered property placeholders.
- `examples/update-entity.md` — update, relation deletion, and space-scoped entity deletion.
