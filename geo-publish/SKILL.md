---
name: geo-publish
description: Publish entities and relations to the Geo knowledge graph via the GRC-20 SDK. Use when creating, updating, or deleting entities and relations. Triggers on "publish", "create entity", "add person", "add to geo", "submit proposal", "create relation", "update entity".
metadata:
  author: geobrowser
  version: "0.1.0"
---

# Geo Knowledge Graph — Publishing

Create, update, and delete entities and relations in the Geo knowledge graph using `@geoprotocol/geo-sdk`.

## When to apply

Use this skill when the user wants to:

- Create new entities (people, companies, events, articles, …).
- Add relations between entities (work history, speakers, authors, …).
- Update or delete entities / relations.
- Submit an edit to a personal space or propose one to a DAO space.

## Prerequisites

- **SDK**: if `@geoprotocol/geo-sdk` and `@geoprotocol/grc-20` aren't already dependencies of the project, install them first — detect the package manager from the lockfile (`bun.lock` → `bun add`, `pnpm-lock.yaml` → `pnpm add`, `package-lock.json` → `npm install`, `yarn.lock` → `yarn add`). Example for Bun:
  ```bash
  bun add @geoprotocol/geo-sdk @geoprotocol/grc-20
  ```
- **Wallet**: `GEO_PRIVATE_KEY` env var set — export from <https://www.geobrowser.io/export-wallet>. If the user hasn't exported yet, point them at that URL rather than guessing.
- **DAO editor rights**: only needed when proposing to a DAO space (not personal spaces).
- **Runtime**: Bun runs `.ts` files directly (`bun run <script>.ts`); Node + `tsx` / `ts-node` also works.

## The three-step workflow

Every publish follows the same flow:

```
1. Discover schema (query an existing entity of the same type)
2. Build ops (Graph.createEntity, Graph.createRelation, etc.)
3. Submit (personalSpace.publishAndSend or daoSpace.publishAndVote)
```

### Step 1 — Discover the schema

Before creating an entity of a type you haven't worked with, **query an existing one** to learn its property IDs and relation type IDs. The `geo-query` skill covers this in depth; the minimum:

```typescript
const res = await fetch("https://testnet-api.geobrowser.io/graphql", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: `{
    entities(typeId: "TYPE_ID", first: 1) {
      id name
      values(first: 50) { nodes { property { id name } text date boolean decimal } }
      relations(first: 50) { nodes { type { id name } toEntity { id name } } }
    }
  }`,
  }),
});
const { data } = await res.json();
// data.entities is a flat array; read property IDs, relation type IDs, toEntity classification IDs
```

Don't guess property/relation IDs. Schemas drift.

### Step 2 — Build ops

All SDK methods return `{ id, ops }`. **Collect every op into a single `allOps: Op[]` array and publish ONCE.** Publishing in a loop creates duplicate edits and inconsistent state.

```typescript
import { Graph, TextBlock, Position, SystemIds, ContentIds } from "@geoprotocol/geo-sdk";
import type { Op } from "@geoprotocol/grc-20";

const allOps: Op[] = [];

// Create an entity
const { id: entityId, ops: entityOps } = Graph.createEntity({
  name: "Ada Lovelace", // MUST NOT end with a period
  description: "A 19th-century mathematician.", // MUST end with a period
  types: [SystemIds.PERSON_TYPE], // at least one type
  values: [
    { property: BIRTH_DATE_PROP, type: "date", value: "1815-12-10" },
    {
      property: ContentIds.WEB_URL_PROPERTY,
      type: "url",
      value: "https://en.wikipedia.org/wiki/Ada_Lovelace",
    },
  ],
});
allOps.push(...entityOps);

// Add a relation
const { ops: relOps } = Graph.createRelation({
  fromEntity: entityId,
  toEntity: TOPIC_MATHEMATICS_ID,
  type: ContentIds.TOPICS_PROPERTY,
});
allOps.push(...relOps);
```

### Step 3 — Submit

**Personal space (instant publish):**

```typescript
import { personalSpace, getSmartAccountWalletClient } from "@geoprotocol/geo-sdk";

const wallet = await getSmartAccountWalletClient({
  privateKey: process.env.GEO_PRIVATE_KEY as `0x${string}`,
});

const { editId, cid, txHash } = await personalSpace.publishAndSend({
  name: "Add Ada Lovelace",
  spaceId: "YOUR_SPACE_ID",
  ops: allOps,
  author: "YOUR_PERSON_ENTITY_ID",
  wallet,
  network: "TESTNET",
});
```

**DAO space (proposal + vote):**

```typescript
import { daoSpace, getSmartAccountWalletClient } from "@geoprotocol/geo-sdk";

const wallet = await getSmartAccountWalletClient({
  privateKey: process.env.GEO_PRIVATE_KEY as `0x${string}`,
});

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

## Entity rules

- **Names must NOT end with a period.** `"Ada Lovelace"`, not `"Ada Lovelace."`.
- **Descriptions MUST end with a period.** Full sentences.
- **Dates** use type `"date"` with `YYYY-MM-DD`. Year-only: use `YYYY-01-01`.
- **Datetimes** use type `"datetime"` with `YYYY-MM-DDTHH:MM:SSZ`.
- **URLs** use type `"url"` for website properties; social handles are `"text"` with just the handle (`"alice"`, not `"https://twitter.com/alice"`).
- **Text blocks**: one paragraph per `TextBlock`. The UI drops everything after the first `\n\n`.
- **Batch size**: soft limit ~10,000 ops per proposal.

## Value types reference

| SDK `type` | Example `value`                              |
| ---------- | -------------------------------------------- |
| `text`     | `"any string"`                               |
| `date`     | `"2024-03-15"`                               |
| `datetime` | `"2024-03-15T14:30:00Z"`                     |
| `time`     | `"14:30:00"`                                 |
| `integer`  | `42`                                         |
| `float`    | `3.14`                                       |
| `decimal`  | `"123.456789"` (string, arbitrary precision) |
| `boolean`  | `true`                                       |
| `url`      | `"https://example.com"`                      |

## Relations

### Basic relation

```typescript
const { ops } = Graph.createRelation({
  fromEntity: personId,
  toEntity: companyId,
  type: SystemIds.WORKS_AT_PROPERTY,
  toSpace: companySpaceId, // only if target is in a different space
});
allOps.push(...ops);
```

### Relation-as-entity (relation with its own properties)

Relations can carry properties and sub-relations — this is how "Worked at" entries get start/end dates and role classifications.

**Use a deterministic ID** so reruns don't create duplicates:

```typescript
const relEntityId = `${personId.slice(0, 16)}${companyId.slice(0, 16)}`;

const { ops } = Graph.createRelation({
  fromEntity: personId,
  toEntity: companyId,
  type: SystemIds.WORKED_AT_PROPERTY,
  toSpace: companySpaceId,
  entityId: relEntityId,
  entityName: "Senior Engineer at Acme",
  entityValues: [
    { property: SystemIds.START_DATE_PROPERTY, type: "date", value: "2022-03-01" },
    { property: SystemIds.END_DATE_PROPERTY, type: "date", value: "2024-11-30" },
  ],
  entityRelations: {
    [ContentIds.ROLES_PROPERTY]: { toEntity: ENGINEER_ROLE_ID, toSpace: rolesSpaceId },
  },
});
allOps.push(...ops);
```

### Ordered collections

Use `Position` for fractional indexing when order matters (e.g. blocks in a page):

```typescript
import { Position } from "@geoprotocol/geo-sdk";

let lastPos: string | null = null;
lastPos = Position.generateBetween(lastPos, null); // first: "a"
// ... createRelation with `position: lastPos` ...
lastPos = Position.generateBetween(lastPos, null); // next: "n"
```

## Updates and deletes

```typescript
// Update properties (add/change values)
const { ops } = Graph.updateEntity({
  id: entityId,
  values: [{ property: propId, type: "text", value: "new value" }],
  unset: [{ property: oldPropId }], // clear a value
});

// Delete a relation — use the EDGE id from the GraphQL `id` field, NOT `entityId`
const { ops } = Graph.deleteRelation({ id: relationEdgeId });

// Delete an entity
const { ops } = Graph.deleteEntity({ id: entityId });
```

## Adding images

```typescript
// Upload to IPFS via SDK
const { id: imageId, ops: imageOps } = await Graph.createImage({
  url: "https://example.com/ada.png",
  name: "Ada Lovelace portrait",
  network: "TESTNET",
});
allOps.push(...imageOps);

// Attach as avatar
const { ops: avatarOps } = Graph.createRelation({
  fromEntity: personId,
  toEntity: imageId,
  type: ContentIds.AVATAR_PROPERTY,
});
allOps.push(...avatarOps);
```

## Adding text blocks (bios, body content)

Each paragraph is its own block:

```typescript
import { TextBlock, Position } from "@geoprotocol/geo-sdk";

const { ops: b1Ops, position: p1 } = TextBlock.make({
  fromId: entityId,
  text: "First paragraph.",
  position: Position.default(),
});
allOps.push(...b1Ops);

const { ops: b2Ops } = TextBlock.make({
  fromId: entityId,
  text: "Second paragraph.",
  position: Position.after(p1),
});
allOps.push(...b2Ops);
```

## Critical gotchas — quick reference

1. **Collect all ops, publish once.** Never publish inside a loop — creates duplicate edits and partial state.
2. **Names no period, descriptions must end with period.** The UI enforces this.
3. **Use the edge `id` to delete relations**, not the relation's `entityId`. Mixing them up silently fails or deletes the wrong thing.
4. **Deterministic IDs for relation entities** — `slice(from) + slice(to)` so reruns are idempotent.
5. **Discover schema before publishing** — don't hardcode property/relation IDs for types you haven't inspected.
6. **Target space matters.** If `toEntity` lives in a different space than `fromEntity`, set `toSpace`.
7. **Wallet must be an editor** of a DAO space before you can propose.
8. **`getSmartAccountWalletClient`** is the canonical wallet. Don't try to sign ops yourself.

## Personal vs DAO spaces

|            | Personal space                | DAO space                                       |
| ---------- | ----------------------------- | ----------------------------------------------- |
| Publishing | Instant (`publishAndSend`)    | Proposal + vote (`publishAndVote`)              |
| Access     | Your wallet is the sole owner | Must be an editor; vote threshold 51%           |
| Voting     | None                          | 24h slow path, or fast path (1 editor approval) |
| Use for    | Experiments, personal data    | Shared curated spaces (Crypto, AI, etc.)        |

## More

- `reference.md` — full SDK surface (all constants, ops types, wallet setup).
- `examples/create-entity.md` — end-to-end: create a Person, publish to a personal space.
- `examples/create-relation.md` — add a "Worked at" relation entity with dates and roles.
- `examples/update-entity.md` — update and unset properties; delete a relation.
