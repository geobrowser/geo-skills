# geo-publish — Reference

Full SDK surface for publishing to the Geo knowledge graph. `SKILL.md` covers the common path; this file is the lookup table.

## Packages

Packages live inside the skill dir's own `node_modules` — the user's project has nothing installed. Custom scripts in the user's project resolve imports via `NODE_PATH=<skill-dir>/node_modules` (see SKILL.md).

- `@geoprotocol/geo-sdk` — `Graph`, `Position`, `TextBlock`, `SystemIds`, `ContentIds`, `personalSpace`, `daoSpace`, `getSmartAccountWalletClient`.
- `@geoprotocol/grc-20` — `Op` type (only needed when hand-typing op arrays; CLI uses it transparently).

## Wallet setup

```typescript
import { getSmartAccountWalletClient } from "@geoprotocol/geo-sdk";

const wallet = await getSmartAccountWalletClient({
  privateKey: process.env.GEO_PRIVATE_KEY as `0x${string}`,
});
// wallet.account.address is your smart account address
```

Export the private key from <https://www.geobrowser.io/export-wallet>. The smart account is funded and sponsored via the testnet paymaster — no gas handling required.

Network: `"TESTNET"` (only network supported in v1).

## `Graph.createEntity`

```typescript
Graph.createEntity({
  name: string,                     // no trailing period
  description?: string,              // must end with period
  types: string[],                   // at least one type entity ID
  cover?: string,                    // entity ID of a cover image
  values?: PropertyValueParam[],
  relations?: Record<string, RelationParam | RelationParam[]>,
}): { id: string; ops: Op[] }
```

### `PropertyValueParam`

```typescript
{ property: string, type: ValueType, value: unknown }
```

| `type`       | value shape                    |
| ------------ | ------------------------------ |
| `"text"`     | `string`                       |
| `"date"`     | `"YYYY-MM-DD"`                 |
| `"datetime"` | `"YYYY-MM-DDTHH:MM:SSZ"`       |
| `"time"`     | `"HH:MM:SS"`                   |
| `"integer"`  | `number` (int)                 |
| `"float"`    | `number`                       |
| `"decimal"`  | `string` (arbitrary precision) |
| `"boolean"`  | `boolean`                      |
| `"url"`      | `string` (full URL)            |

## `Graph.createRelation`

```typescript
Graph.createRelation({
  fromEntity: string,
  toEntity: string,
  type: string,                      // relation type (property) ID
  toSpace?: string,                  // if toEntity lives in a different space
  position?: string,                 // fractional index, for ordered collections
  entityId?: string,                 // deterministic ID for the relation entity
  entityName?: string,
  entityDescription?: string,
  entityValues?: PropertyValueParam[],
  entityRelations?: Record<string, RelationParam | RelationParam[]>,
}): { id: string; ops: Op[] }
```

The `entity*` fields turn the relation into an entity with its own properties (e.g. a "Worked at" relation with start/end dates). Use a deterministic `entityId` (`slice(from, 16) + slice(to, 16)`) so reruns don't create duplicates.

## `Graph.updateEntity`

```typescript
Graph.updateEntity({
  id: string,
  name?: string,
  description?: string,
  values?: PropertyValueParam[],     // add or overwrite
  unset?: { property: string }[],    // clear a value
}): { ops: Op[] }
```

## `Graph.deleteRelation`

```typescript
Graph.deleteRelation({ id: string }): { ops: Op[] }
// id is the relation EDGE id (GraphQL `relations.nodes[].id`), NOT entityId.
```

## `Graph.deleteEntity`

```typescript
Graph.deleteEntity({ id: string }): { ops: Op[] }
```

Also deletes **incoming relations** (backlinks). When deleting many entities in one batch, pass a shared `deletingIds: Set<string>` through your helper to prevent infinite recursion on cycles and duplicate orphan cleanup.

## `Graph.createImage`

```typescript
await Graph.createImage({
  url?: string,                      // remote URL to fetch
  blob?: Blob,                       // or a local Blob
  name: string,
  network: "TESTNET",
}): { id: string; ops: Op[]; cid: string }
```

Uploads to IPFS via the SDK. Attach as cover/avatar via a relation to `ContentIds.AVATAR_PROPERTY` or `SystemIds.COVER_PROPERTY`.

## `TextBlock.make`

```typescript
TextBlock.make({
  fromId: string,                    // parent entity
  text: string,                      // one paragraph
  position: string,                  // Position.default() or Position.after(prev)
}): { ops: Op[]; position: string }
```

## `Position`

```typescript
Position.default(): string                        // first position ("a")
Position.after(prev: string): string              // right after prev
Position.before(next: string): string
Position.generateBetween(prev: string | null, next: string | null): string
```

Fractional indices. Always `generateBetween` rather than manually incrementing.

## Submission

Every submit function returns unsigned `{ to, calldata, ... }`. You submit the transaction with the wallet's own `sendTransaction`. The SDK does **not** auto-send — pairing these is always your responsibility.

### Author — always the personal space ID

The `author` field is the user's **personal space ID**, not a Person entity ID. Get it from `bin/whoami.mjs`. The SDK uses this value as the `authors` field in the GRC-20 Edit message that gets uploaded to IPFS.

### `personalSpace.publishEdit`

```typescript
const { editId, cid, to, calldata } = await personalSpace.publishEdit({
  name: string,                      // edit description
  spaceId: string,                   // target space ID (UUID or 32-hex)
  ops: Op[],
  author: string,                    // user's personal space ID
  network?: "TESTNET",               // default
});

const txHash = await wallet.sendTransaction({ to, data: calldata });
```

### `daoSpace.proposeEdit`

```typescript
const { proposalId, editId, cid, to, calldata } = await daoSpace.proposeEdit({
  name: string,
  ops: Op[],
  author: string,                    // user's personal space ID
  daoSpaceAddress: `0x${string}`,    // DAO space contract address
  callerSpaceId: `0x${string}`,      // user's personal space ID as bytes16 hex
  daoSpaceId: `0x${string}`,         // DAO space ID as bytes16 hex
  votingMode?: "FAST" | "SLOW",
  network?: "TESTNET",
});

const proposeTxHash = await wallet.sendTransaction({ to, data: calldata });
```

`FAST` = one-editor approval; `SLOW` = 24h voting at 51%. With `FAST` and enough existing editor approvals the proposal auto-executes on propose — no separate vote needed.

### `daoSpace.voteProposal`

```typescript
const { to, calldata } = await daoSpace.voteProposal({
  proposalId: string,
  daoSpaceAddress: `0x${string}`,
  vote: "YES" | "NO" | "ABSTAIN",
});

const voteTxHash = await wallet.sendTransaction({ to, data: calldata });
```

### Other DAO actions

Also exported from `daoSpace`: `createSpace`, `executeProposal`, `proposeAddMember`, `proposeRemoveMember`, `proposeRequestMembership`. Same pattern — each returns `{ to, calldata, ... }`.

## SDK ID constants

```typescript
import { SystemIds, ContentIds } from "@geoprotocol/geo-sdk";
```

### Types

```
SystemIds.PERSON_TYPE
SystemIds.COMPANY_TYPE
SystemIds.PROJECT_TYPE
SystemIds.EVENT_TYPE
SystemIds.INSTITUTION_TYPE
SystemIds.IMAGE_TYPE
SystemIds.VIDEO_TYPE
SystemIds.ROLE_TYPE
ContentIds.ARTICLE_TYPE
ContentIds.TALK_TYPE
ContentIds.PODCAST_TYPE
ContentIds.EPISODE_TYPE
ContentIds.TOPIC_TYPE
ContentIds.SKILL_TYPE
```

### Properties

```
ContentIds.WEBSITE_PROPERTY
ContentIds.X_PROPERTY
ContentIds.GITHUB_PROPERTY
ContentIds.LINKEDIN_PROPERTY
ContentIds.WEB_URL_PROPERTY
ContentIds.PUBLISH_DATE_PROPERTY
ContentIds.AVATAR_PROPERTY
SystemIds.COVER_PROPERTY
SystemIds.START_DATE_PROPERTY
SystemIds.END_DATE_PROPERTY
SystemIds.DATE_FOUNDED_PROPERTY
SystemIds.MARKDOWN_CONTENT
```

### Relations

```
SystemIds.WORKS_AT_PROPERTY         // Person → Company (current)
SystemIds.WORKED_AT_PROPERTY        // Person → Company (past)
SystemIds.STUDIED_AT_PROPERTY       // Person → Institution
SystemIds.TEAM_MEMBERS_PROPERTY     // Company → Person
SystemIds.SPEAKERS_PROPERTY         // Talk/Episode → Person
SystemIds.CREATOR_PROPERTY          // Entity → Person
ContentIds.AUTHORS_PROPERTY         // Article → Person
ContentIds.ROLES_PROPERTY           // Work relation → Role
ContentIds.SKILLS_PROPERTY          // Person → Skill
ContentIds.TOPICS_PROPERTY          // Entity → Topic
ContentIds.LOCATION_PROPERTY        // Entity → Place
```

## Patterns

### Dry-run helper

Wrap mutation helpers to support a `dryRun` mode. Collect ops but don't submit:

```typescript
async function publishEntity({ dryRun = false, ...input }: { dryRun?: boolean; ... }) {
  const ops: Op[] = [];
  // ... build ops ...
  if (dryRun) {
    console.log(`[dry-run] would publish ${ops.length} ops`);
    return { ops };
  }
  return personalSpace.publishEdit({ ops, ... });
}
```

Useful for review before committing to a DAO proposal.

### Property registry for bulk imports

Define a field → property-ID map so you only declare types once:

```typescript
const VALUE_PROPERTIES: Record<string, { id: string; type: "text" | "date" | "url" }> = {
  web_url: { id: ContentIds.WEB_URL_PROPERTY, type: "url" },
  birth_date: { id: BIRTH_DATE_PROPERTY, type: "date" },
};

function extractValues(data: Record<string, any>) {
  return Object.entries(VALUE_PROPERTIES)
    .filter(([field]) => data[field] != null)
    .map(([field, meta]) => ({ property: meta.id, type: meta.type, value: data[field] }));
}
```

## Troubleshooting

| Symptom                                | Likely cause                            | Fix                                                          |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| `not an editor`                        | Wallet isn't an editor of the DAO space | Get added as editor, or use a personal space.                |
| Duplicate entries after rerun          | Non-deterministic relation entity IDs   | Use `entityId: slice(from, 16) + slice(to, 16)`.             |
| UI drops content after first paragraph | Multiple paragraphs in one `TextBlock`  | One paragraph per block, use `Position.after(...)` to chain. |
| `name must not end with period`        | Trailing period on `name`               | Strip it; put the period on `description` instead.           |
| `description must end with period`     | Missing period on `description`         | Add one.                                                     |
| Relation deleted wrong thing           | Used `entityId` as the delete target    | Use `id` (the edge ID from GraphQL).                         |
