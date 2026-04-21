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

The user's project needs **no dependencies installed**. All SDK packages live inside this skill's own directory (`<skill-dir>/node_modules/`), and the shipped CLIs (`bin/whoami.mjs`, `bin/publish-entity.mjs`) plus any ad-hoc scripts are run against that location.

- **Skill dependencies (one-time, inside the skill dir)**: if `<skill-dir>/node_modules/` is missing, install once. Resolve `<skill-dir>` from the path of this SKILL.md file, then:
  ```bash
  (cd <skill-dir> && bun install)   # or: (cd <skill-dir> && npm install)
  ```
  Idempotent — subsequent runs finish in <1s.
- **Wallet key**: the user places `GEO_PRIVATE_KEY=0x...` in a file named **`.env.geo-publish`** at the **user project** root, and adds the filename to `.gitignore`. Export the key from <https://www.geobrowser.io/export-wallet>. Scripts read it via `--env-file`.
  - **Never suggest commands that put the key in the transcript.** Do NOT tell the user to run `! echo 'GEO_PRIVATE_KEY=0x...' > .env.geo-publish`, to `export GEO_PRIVATE_KEY=...` inside the session, or to paste the key into chat. The `!` prefix and shell output both land in the conversation history.
  - **Never suggest `export`.** The Bash tool spawns a fresh shell each call and won't inherit environment variables set in the user's interactive shell.
  - **The correct handoff**: ask the user to create `.env.geo-publish` themselves — in their editor or a separate terminal you can't see — with a single line `GEO_PRIVATE_KEY=0x...`, and to reply "done" when ready. Then continue. You may offer to create a `.env.geo-publish.example` file (with a placeholder value) and update `.gitignore` on their behalf; never write the real file.
- **DAO editor rights**: only needed when publishing to a DAO space (not personal spaces).
- **Runtime**: Node 20.6+ or Bun — both natively support `--env-file`. Shipped scripts are plain `.mjs`, so no TypeScript runtime is needed.
  - Node: `node --env-file=.env.geo-publish <skill-dir>/bin/<script>.mjs`
  - Bun: `bun  --env-file=.env.geo-publish run <skill-dir>/bin/<script>.mjs`

## Quickstart (first publish in one script)

Use this when the user just wants to try the skill and hasn't set up identity yet. It bootstraps everything from only `GEO_PRIVATE_KEY`.

### 0. Ask the user to create `.env.geo-publish`

If the file doesn't exist, tell the user (verbatim is fine):

> Create a file at the project root called `.env.geo-publish` with one line: `GEO_PRIVATE_KEY=0x...`. Export your key from https://www.geobrowser.io/export-wallet. Use your editor or a separate terminal — don't use `!` here, since that would put the key in this conversation. Reply "done" when ready.

You can proactively create `.gitignore` entries and a `.env.geo-publish.example` placeholder for them, but **never write the real key yourself**.

### 1. Discover identity — `bin/whoami.mjs`

`<skill-dir>/bin/whoami.mjs` derives from the private key:

- **wallet address** (smart account)
- **personal space ID** — doubles as the `author` value for every publish
- **DAO spaces you can publish to** (editor role)

Run it once from the user's project directory and show the output so they can pick a target space:

```bash
node --env-file=.env.geo-publish <skill-dir>/bin/whoami.mjs
# or: bun --env-file=.env.geo-publish run <skill-dir>/bin/whoami.mjs
```

Expected output:

```
Wallet address : 0xAbC...
Personal space : 003eaa9b7a56fa847afd6f2e8cc518a6
Author (pass as `author`): 003eaa9b7a56fa847afd6f2e8cc518a6

Spaces you can publish to as editor:
  - 003eaa9b7a56fa847afd6f2e8cc518a6  [PERSONAL]  (your own)
  - 0222c93092ed08632f958aa84b3b0be6  [DAO]  Crypto
```

If the personal-space row is `(none — create one before publishing)`, call `personalSpace.createSpace()` first (see `reference.md`).

### 2. Confirm the plan with the user (one message)

Before writing or running a publish script, surface your assumptions in ONE short message and wait for confirmation. Use this template:

> Ready to publish:
>
> - **Space**: `<personal space ID>` (your personal space) — change? (paste a DAO space ID from above to override)
> - **Name**: "<name the user gave>"
> - **Type**: `<SystemIds.XXX_TYPE>` (`Person`, `Project`, …) or `SystemIds.DEFAULT_TYPE` for a generic entity — change?
> - **Description**: <either "(none)" or a one-sentence draft ending with a period> — change?
>
> Reply "go" or tell me what to change.

Pick a type by matching the entity name where possible (a name like "Acme Inc." → `COMPANY_TYPE`; a person's name → `PERSON_TYPE`; something ambiguous → `DEFAULT_TYPE`). Don't invent a description the user didn't ask for — offer `(none)` as the default and let them add one if they want.

Only proceed to write the script after the user confirms.

### 3. Publish — `bin/publish-entity.mjs` (no script needed)

For a simple "create one entity" request, use the shipped CLI instead of writing a script:

```bash
node --env-file=.env.geo-publish <skill-dir>/bin/publish-entity.mjs \
  --name "Ada Lovelace" \
  --description "A 19th-century mathematician." \
  --type PERSON_TYPE
# --space-id and --author default to the wallet's personal space
# --dry-run prints ops count and exits without submitting
```

Known `--type` values: `DEFAULT_TYPE`, `PERSON_TYPE`, `COMPANY_TYPE`, `PROJECT_TYPE`, `EVENT_TYPE`, `INSTITUTION_TYPE`, `ROLE_TYPE`, `ARTICLE_TYPE`, `TALK_TYPE`, `PODCAST_TYPE`, `EPISODE_TYPE`, `TOPIC_TYPE`, `SKILL_TYPE`. The CLI validates the name-no-period / description-must-end-with-period rules for you.

`author` defaults to the wallet's personal space ID (never a Person entity ID) — `--author` is only needed if overriding.

### 4. Complex publishes — custom script that imports from the skill

Relations, updates, multi-op edits, text blocks, images: write a `.mjs` script in the user's project and run it with `NODE_PATH` pointing at the skill's `node_modules` so imports resolve without a local install:

```bash
NODE_PATH=<skill-dir>/node_modules node --env-file=.env.geo-publish publish-something.mjs
# Bun respects NODE_PATH too.
```

See `examples/create-entity.md`, `examples/create-relation.md`, `examples/update-entity.md` for patterns. All examples are `.mjs`-compatible (plain ESM) — strip the TypeScript type annotations if you copy from them for a `.mjs` file.

## The three-step workflow

Every publish follows the same flow:

```
1. Discover schema  (query an existing entity of the same type)
2. Build ops        (Graph.createEntity, Graph.createRelation, ...)
3. Submit           (personalSpace.publishEdit + wallet.sendTransaction,
                     or daoSpace.proposeEdit + voteProposal)
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

Both variants return `{ to, calldata, ... }`. You submit the transaction yourself via the smart-account wallet.

**Normalize the private key.** Users often paste the key without the `0x` prefix; the SDK then throws a cryptic `invalid private key, expected hex or 32 bytes, got string`. Always prepend `0x` if missing:

```typescript
const raw = process.env.GEO_PRIVATE_KEY;
if (!raw) throw new Error("GEO_PRIVATE_KEY not set. Create .env.geo-publish at the project root.");
const privateKey = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
```

**Personal space (instant publish):**

```typescript
import { personalSpace, getSmartAccountWalletClient } from "@geoprotocol/geo-sdk";

const wallet = await getSmartAccountWalletClient({ privateKey });

const { editId, cid, to, calldata } = await personalSpace.publishEdit({
  name: "Add Ada Lovelace",
  spaceId: PERSONAL_SPACE_ID, // target space (usually your personal space)
  ops: allOps,
  author: PERSONAL_SPACE_ID, // ALWAYS your personal space ID, not a Person entity
  network: "TESTNET",
});
const txHash = await wallet.sendTransaction({ to, data: calldata });
```

**DAO space (propose + vote):**

`daoSpace.proposeEdit` returns the proposal calldata; submit it, then (optionally) vote. With `votingMode: "FAST"` and enough editor approvals, the proposal auto-executes.

```typescript
import { daoSpace, getSmartAccountWalletClient } from "@geoprotocol/geo-sdk";

const wallet = await getSmartAccountWalletClient({ privateKey }); // normalize as above

const { proposalId, editId, cid, to, calldata } = await daoSpace.proposeEdit({
  name: "Add Ada Lovelace",
  ops: allOps,
  author: PERSONAL_SPACE_ID, // still the user's personal space ID
  daoSpaceAddress: "0x..." as `0x${string}`, // DAO space contract address
  callerSpaceId: "0x..." as `0x${string}`, // your personal space ID as bytes16 hex
  daoSpaceId: "0x..." as `0x${string}`, // DAO space ID as bytes16 hex
  votingMode: "FAST",
  network: "TESTNET",
});
const proposeTxHash = await wallet.sendTransaction({ to, data: calldata });

// Then vote (not needed if the proposal auto-executes on propose):
const vote = await daoSpace.voteProposal({
  proposalId,
  daoSpaceAddress: "0x..." as `0x${string}`,
  vote: "YES",
});
const voteTxHash = await wallet.sendTransaction({ to: vote.to, data: vote.calldata });
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

|            | Personal space                | DAO space                                        |
| ---------- | ----------------------------- | ------------------------------------------------ |
| Publishing | Instant (`publishEdit`)       | Proposal + vote (`proposeEdit` → `voteProposal`) |
| Access     | Your wallet is the sole owner | Must be an editor; vote threshold 51%            |
| Voting     | None                          | 24h slow path, or fast path (1 editor approval)  |
| Use for    | Experiments, personal data    | Shared curated spaces (Crypto, AI, etc.)         |

## More

- `reference.md` — full SDK surface (all constants, ops types, wallet setup).
- `examples/create-entity.md` — end-to-end: create a Person, publish to a personal space.
- `examples/create-relation.md` — add a "Worked at" relation entity with dates and roles.
- `examples/update-entity.md` — update and unset properties; delete a relation.
