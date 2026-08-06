---
name: geo-query
description: Query the Geo knowledge graph via GraphQL. Use when looking up entities, searching by type, exploring relations, discovering schemas, or inspecting entity properties. Triggers on "look up", "find entity", "query geo", "search the graph", "what type is", "show me relations", "get entity".
metadata:
  author: geobrowser
  version: "0.1.0"
---

# Geo Knowledge Graph — Querying

Query and explore entities, types, properties, and relations in the Geo knowledge graph via its GraphQL API.

## When to apply

Use this skill when the user wants to:

- Look up an entity by ID.
- Search for entities of a given type (optionally scoped to a space).
- Explore what properties and relations an entity has.
- Discover the schema for an unfamiliar entity type before publishing.
- Find type, property, or relation type IDs.

## API basics

- **Endpoint:** `https://api-testnet.geobrowser.io/graphql`
- **Method:** `POST` with `Content-Type: application/json`
- **Auth:** none required for reads.
- **UUIDs:** 32-char hex, no dashes (e.g. `7ed45f2bc48b419e8e4664d5ff680b0d`).
- **Browser links:** `https://www.geobrowser.io/space/{spaceId}/{entityId}`.

## Core concepts (compact)

- **Entity:** a unique node in the graph (person, place, article, etc.). Has an ID, `name`, `description`, `types`, `values`, and `relations`.
- **Property:** a typed attribute on an entity (`text`, `date`, `datetime`, `time`, `boolean`, `decimal`, `integer`, `float`).
- **Relation:** a typed edge between two entities. Relations are themselves entities — they can have their own properties.
- **Type:** a category (`Person`, `Article`, …). Types define a schema of default properties that every entity of that type inherits.
- **Space:** an independent community/topic scope. An entity can live in multiple spaces; each has its own perspective.

Full conceptual details: see `reference.md`.

## List query: `entities` vs `entitiesConnection`

There are two list queries with the same top-level args (`typeId`, `spaceId`, `typeIds`, `spaceIds`, `filter`, `first`, `offset`, `orderBy`) but different shapes. **Choose based on result set size**:

|              | `entities`                                        | `entitiesConnection`                        |
| ------------ | ------------------------------------------------- | ------------------------------------------- |
| Return shape | flat array                                        | `{ nodes, edges, pageInfo, totalCount }`    |
| Pagination   | `first` + `offset` **(capped at offset 1000)**    | `first` + cursor (`after`/`before`)         |
| Use when     | small, bounded lookups; default for <1000 results | totalCount needed, or unbounded result sets |

**CRITICAL — offset cap:** `entities(...)`, `relations(...)`, and `values(...)` return **400 "offset cannot exceed 1000"** beyond offset 1000. For any query that might exceed 1000 results, use the `*Connection` variant with cursor pagination.

**CRITICAL — response shape:** `entities` returns a **flat array**. Do NOT wrap fields in `{ nodes { ... } }`.

```graphql
# CORRECT
{ entities(typeId: "TYPE_ID", first: 50) { id name description } }

# WRONG — `entities` is flat, no `nodes`
{ entities(typeId: "TYPE_ID", first: 50) { nodes { id name } } }

# WRONG — `typeId` is top-level, not inside `filter`
{ entities(filter: { typeIds: { anyEqualTo: "TYPE_ID" } }, first: 50) { ... } }
```

## Core queries

### Look up a single entity

This is the starting point for almost every investigation:

```graphql
{
  entity(id: "ENTITY_ID") {
    id
    name
    description
    spaceIds
    types {
      id
      name
    }
    values(first: 100) {
      nodes {
        property {
          id
          name
        }
        text
        date
        boolean
        decimal
        integer
        float
      }
    }
    relations(first: 100) {
      nodes {
        id # relation edge ID (use this to delete the relation)
        entityId # relation ENTITY ID (use this to read/update relation properties)
        type {
          id
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

Values come back as typed fields (`text`, `date`, `boolean`, `decimal`, `integer`, `float`) — NOT a single `value` field. Check each for non-null.

### Search entities by type (optionally by space)

```graphql
# Small result set
{
  entities(typeId: "TYPE_ID", spaceId: "SPACE_ID", first: 50) {
    id
    name
    description
  }
}

# Large/unbounded — use cursor pagination
{
  entitiesConnection(typeId: "TYPE_ID", spaceId: "SPACE_ID", first: 500) {
    totalCount
    nodes {
      id
      name
      description
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Inspect a space, its editors, and governance

`editors` is a connection. `proposals` and each proposal's `proposalVersions` are flat lists:

```graphql
{
  space(id: "a19c345ab9866679b001d7d2138d88a1") {
    id
    type
    topic {
      id
      name
    }
    editors(first: 20) {
      nodes {
        memberSpaceId
      }
      pageInfo {
        hasNextPage
        endCursor
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
        quorum
        threshold
        yesCount
        noCount
        abstainCount
      }
    }
  }
}
```

Editors are identified by their personal or DAO `memberSpaceId`, not by an account address. For a proposal, use `currentVersion` to identify the active version and include `proposalVersion` when reading version-aware votes. A passing `SLOW` proposal still needs explicit execution after `endTime` and before `executeBy`; confirm `executedAt` afterward.

### Cursor pagination loop (TypeScript)

```typescript
async function fetchAll(
  typeId: string,
  spaceId: string,
): Promise<Array<{ id: string; name: string }>> {
  const out: Array<{ id: string; name: string }> = [];
  let cursor: string | null = null;

  while (true) {
    const afterClause = cursor ? `after: "${cursor}"` : "";
    const res = await fetch("https://api-testnet.geobrowser.io/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
        entitiesConnection(typeId: "${typeId}", spaceId: "${spaceId}", first: 500 ${afterClause}) {
          nodes { id name }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      }),
    });
    if (!res.ok) throw new Error(`Geo API returned HTTP ${res.status}`);
    const { data, errors } = await res.json();
    if (errors?.length) throw new Error(errors.map(({ message }) => message).join("; "));
    const conn = data.entitiesConnection;
    out.push(...(conn?.nodes ?? []));
    if (!conn?.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return out;
}
```

## Filtering

The `filter` arg accepts `EntityFilter` for field-level conditions:

```graphql
{
  entities(typeId: "TYPE_ID", filter: { name: { startsWithInsensitive: "Bitcoin" } }, first: 20) {
    id
    name
  }
}
```

Common `EntityFilter` fields:

- `id` — `UUIDFilter` (`is`, `isNot`, `in`, `notIn`).
- `name`, `description`, `createdAt`, `updatedAt` — `StringFilter` (`is`, `isNot`, `in`, `notIn`, `includes`, `includesInsensitive`, `startsWith`, and related operators).
- `spaceIds`, `typeIds` — `UUIDListFilter` (`is`, `isNot`, `in`, `containedBy`, `overlaps`, `anyEqualTo`).
- `relations`, `backlinks` — `EntityToManyRelationFilter` (`some`, `none`, `every`).
- `values` — `EntityToManyValueFilter`.
- `and`, `or`, `not`.

**CRITICAL — scope relation filters by space.** Cross-space relation filters can return `INTERNAL_SERVER_ERROR` on the server. Always include `spaceId` inside relation filters:

```graphql
relations: { some: { spaceId: { is: "SPACE_ID" }, toEntity: { ... } } }
```

**Prefer `none` over `every` for exclusion.** `every` means "all items must match the full condition" and misbehaves when items have different field values. Use `none` for "there is no X where Y":

```graphql
# "entity has no name value"
values: { none: { propertyId: { is: NAME_PROP_ID }, text: { isNull: false } } }
```

If complex filters return 500s, reduce `first` from 500 → 100 → 50.

## Schema discovery workflow

When you need to publish or understand an entity type you haven't seen before, **inspect an existing entity of that type** to learn the schema. Do this before assuming any property/relation IDs.

1. Find entities of the type (search by `typeId`).
2. Pick one and fetch it fully (all values + relations).
3. Read the property names and relation types from the result.
4. Note the IDs — property IDs, relation type IDs, and `toEntity` IDs for classification values.

```graphql
{
  entities(typeId: "86db141cf7cb471194ed39088926adb8", first: 3) {
    id
    name
    types {
      id
      name
    }
    values(first: 50) {
      nodes {
        property {
          id
          name
        }
        text
        date
      }
    }
    relations(first: 50) {
      nodes {
        type {
          id
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

See `examples/discover-schema.md` for an end-to-end walkthrough.

## Finding type and property IDs by name

`Type` and `Property` are themselves types — you can query all of them:

```graphql
# All type definitions
{
  entities(
    typeId: "e7d737c536764c609fa16aa64a8c90ad"
    filter: { name: { includesInsensitive: "article" } }
    first: 20
  ) {
    id
    name
  }
}

# All property definitions
{
  entities(
    typeId: "808a04ceb21c4d888ad12e240613e5ca"
    filter: { name: { includesInsensitive: "date" } }
    first: 20
  ) {
    id
    name
  }
}
```

For relation types, inspect an entity that uses them — the `type { id name }` field on a relation gives you the ID.

## Well-known IDs

Prefer the SDK's exported constants where possible:

```typescript
import { SystemIds, ContentIds } from "@geoprotocol/geo-sdk";

(SystemIds.PERSON_TYPE, SystemIds.COMPANY_TYPE, SystemIds.PROJECT_TYPE);
(ContentIds.ARTICLE_TYPE, ContentIds.NEWS_STORY_TYPE, ContentIds.TOPIC_TYPE);
```

Current raw IDs for direct GraphQL queries:

| Name            | ID                                 |
| --------------- | ---------------------------------- |
| Type (meta)     | `e7d737c536764c609fa16aa64a8c90ad` |
| Property (meta) | `808a04ceb21c4d888ad12e240613e5ca` |
| Person          | `7ed45f2bc48b419e8e4664d5ff680b0d` |
| Project         | `484a18c5030a499cb0f2ef588ff16d50` |
| News story      | `e550fe517e904b2c8fffdf13408f5634` |

Well-known space IDs and additional type IDs live in `reference.md`.

## curl sanity check

```bash
curl -s --compressed 'https://api-testnet.geobrowser.io/graphql' \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ entities(typeId: \"7ed45f2bc48b419e8e4664d5ff680b0d\", first: 5) { id name } }"}' | jq .
```

## Critical gotchas — quick reference

1. **Offset cap 1000** on `entities`/`relations`/`values` — use `*Connection` + cursor for larger sets.
2. **`entities` is flat**, not `{ nodes { ... } }`.
3. **`typeId`/`spaceId` are top-level args**, not inside `filter`.
4. **Scope relation filters by `spaceId`** to avoid `INTERNAL_SERVER_ERROR`.
5. **`UUIDFilter` uses `is` / `isNot` / `in` / `notIn`**. `UUIDListFilter` also supports `containedBy`, `overlaps`, and `anyEqualTo`.
6. **Prefer `none` over `every`** for exclusion logic.
7. **Values come back as typed fields** (`text`, `date`, `boolean`, …), not a single `value`.
8. **Relation `id` ≠ `entityId`** — `id` is the edge (for deletion); `entityId` is the relation-as-entity (for relation properties).

## More

- `reference.md` — full filter spec, all well-known IDs, advanced patterns.
- `examples/lookup-entity.md` — walk through a single-entity fetch and what the shape looks like.
- `examples/paginate-list.md` — cursor pagination example with totalCount.
- `examples/discover-schema.md` — the schema-discovery workflow in practice.
