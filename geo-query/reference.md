# geo-query — Reference

Deep reference for the Geo GraphQL API. `SKILL.md` covers the common path; this file covers the full surface.

## Endpoint

```
POST https://testnet-api.geobrowser.io/graphql
Content-Type: application/json
```

No auth for reads. UUIDs are 32-char hex, no dashes.

## Core types (what comes back)

### Entity

```graphql
type Entity {
  id: UUID!
  name: String
  description: String
  spaceIds: [UUID!]!
  createdAt: String
  updatedAt: String
  types: [Entity!]!            # The type entities this entity is an instance of
  values(first, offset): ValueConnection
  relations(first, offset): RelationConnection
  backlinks(first, offset): RelationConnection   # Relations pointing AT this entity
}
```

### Value

Values are typed — the non-null field is the actual value:

```graphql
type Value {
  property: Entity! # The property definition
  text: String
  date: String # YYYY-MM-DD (RFC 3339 date)
  datetime: String # YYYY-MM-DDTHH:MM:SSZ
  time: String # HH:MM:SS
  boolean: Boolean
  integer: Int
  float: Float
  decimal: String # Arbitrary-precision, as string
}
```

### Relation

```graphql
type Relation {
  id: UUID! # Edge ID — use to delete the relation
  entityId: UUID! # Relation-as-entity ID — use to read/update relation properties
  type: Entity! # Relation type (another entity)
  fromEntity: Entity!
  toEntity: Entity!
  spaceId: UUID
  position: String # Fractional index (for ordered collections)
}
```

## Query surface

### Top-level queries

- `entity(id: UUID!)` — single entity lookup.
- `entities(typeId, spaceId, typeIds, spaceIds, filter, first, offset, orderBy)` — flat array. **Capped at offset 1000.**
- `entitiesConnection(...same args...)` — cursor-paginated. Supports `after`, `before`, `last`, `totalCount`.
- `space(id: UUID!)` — single space.
- `relations(filter, first, offset)` — flat array of relations. **Capped at offset 1000.**
- `relationsConnection(filter, first, offset, after, ...)` — cursor-paginated relations.
- `values(filter, first, offset)` — flat array of values. **Capped at offset 1000.**
- `valuesConnection(filter, first, offset, after, ...)` — cursor-paginated values.

### `entities` / `entitiesConnection` args

Top-level (NOT inside `filter`):

- `typeId: UUID` — entities of this single type.
- `spaceId: UUID` — entities visible in this space.
- `typeIds: [UUID!]` — entities of any of these types.
- `spaceIds: [UUID!]` — entities visible in any of these spaces.
- `first: Int`, `offset: Int` — pagination.
- `after: String`, `before: String`, `last: Int` — cursor pagination (`*Connection` only).
- `orderBy: [EntitiesOrderBy!]` — e.g. `NAME_ASC`, `CREATED_AT_DESC`.

Inside `filter: EntityFilter`:

- Field filters (see below).
- `and: [EntityFilter!]`, `or: [EntityFilter!]`, `not: EntityFilter`.

### `relationsConnection` uses `filter` for everything

Unlike `entitiesConnection`, `relationsConnection` takes all scoping inside `filter`:

```graphql
relationsConnection(
  filter: { spaceId: { is: "..." }, typeId: { is: "..." } }
  first: 500
)
```

Same for `valuesConnection`.

## Filter grammar

### UUIDFilter

- `is: UUID`
- `isNot: UUID`
- `in: [UUID!]`
- `notIn: [UUID!]`

**NOT `equalTo`** — that's only on `StringFilter`.

### StringFilter

- `equalTo`, `notEqualTo`
- `in`, `notIn`
- `includes`, `includesInsensitive`, `notIncludes`, `notIncludesInsensitive`
- `startsWith`, `startsWithInsensitive`
- `endsWith`, `endsWithInsensitive`
- `isNull: Boolean`

### UUIDListFilter

- `anyEqualTo: UUID`
- `equalTo: [UUID!]`
- `contains: [UUID!]`
- `isNull: Boolean`

### EntityFilter fields

- `id: UUIDFilter`
- `name: StringFilter`
- `description: StringFilter`
- `createdAt`, `updatedAt`: `StringFilter`
- `spaceIds: UUIDListFilter`
- `typeIds: UUIDListFilter`
- `values: EntityToManyValueFilter`
- `relations: EntityToManyRelationFilter`
- `backlinks: EntityToManyRelationFilter`
- `and`, `or`, `not`

### EntityToManyRelationFilter / EntityToManyValueFilter

- `some: <filter>` — at least one match.
- `none: <filter>` — no matches.
- `every: <filter>` — all match (**see gotcha below**).

**Use `none` instead of `every` for exclusion logic.** `every` requires ALL items to match the full condition, which fails when items have different field values. Example:

```graphql
# "entity has no name value set"
values: { none: { propertyId: { is: NAME_PROP_ID }, text: { isNull: false } } }
```

## Parallel pagination with aliases

When you need to paginate two different connections in the same request (e.g. values and relations for the same entity), use GraphQL aliases and track each cursor independently:

```graphql
{
  valConn: valuesConnection(filter: {...}, first: 500, after: "...") {
    nodes { propertyId spaceId }
    pageInfo { hasNextPage endCursor }
  }
  relConn: relationsConnection(filter: {...}, first: 500, after: "...") {
    nodes { typeId fromEntity { spaceIds } }
    pageInfo { hasNextPage endCursor }
  }
}
```

Stop each when its `hasNextPage` is false.

## Well-known IDs

### Spaces

| Space      | ID                                 |
| ---------- | ---------------------------------- |
| Root       | `a19c345ab9866679b001d7d2138d88a1` |
| Crypto     | `c9f267dcb0d270718c2a3c45a64afd32` |
| AI         | `41e851610e13a19441c4d980f2f2ce6b` |
| Health     | `52c7ae149838b6d47ce0f3b2a5974546` |
| Education  | `ec349623f33236aee13c12dcd629ee81` |
| Industries | `d69608290513c2a91102c939b3265bd7` |
| Places     | `84a679ce188f061ac9a92380bac2bab5` |
| Technology | `870e3b3068661e6280fad2ab456829bc` |
| Software   | `9b611b848b12491b9b6b43f3cf019b8b` |
| Finance    | `c5729fc78c2de3a0ae948ca1df489e8d` |

### Meta types

| Name            | ID                                 |
| --------------- | ---------------------------------- |
| Type (meta)     | `e7d737c536764c609fa16aa64a8c90ad` |
| Property (meta) | `808a04ceb21c4d888ad12e240613e5ca` |

### Common content types

| Name    | ID                                 |
| ------- | ---------------------------------- |
| Person  | `4faff0b210cb49958e20109409b8699c` |
| Project | `4d0076ff1e824585b03066f6bf6420ce` |
| Article | `a2a5ed0cacef46b1835de457956ce915` |
| Stories | `4e22a7b291e94c9cad90992ccb6f2d6c` |
| Claim   | `96f859efa1ca4b229372c86ad58b694b` |
| Topic   | `5ef5a5860f274d8e8f6c59ae5b3e89e2` |

### SDK-exported IDs

```typescript
import { SystemIds, ContentIds } from "@geoprotocol/geo-sdk";

// Types
SystemIds.PERSON_TYPE;
SystemIds.COMPANY_TYPE;
SystemIds.PROJECT_TYPE;
SystemIds.EVENT_TYPE;
SystemIds.INSTITUTION_TYPE;
SystemIds.IMAGE_TYPE;
ContentIds.ARTICLE_TYPE;
ContentIds.TALK_TYPE;
ContentIds.PODCAST_TYPE;
ContentIds.EPISODE_TYPE;
ContentIds.TOPIC_TYPE;
ContentIds.SKILL_TYPE;
```

## Troubleshooting

| Symptom                                           | Likely cause                                                    | Fix                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Pagination argument "offset" cannot exceed 1000` | Using `entities`/`relations`/`values` past offset 1000          | Switch to `*Connection` with cursor.                                               |
| `INTERNAL_SERVER_ERROR` on filtered query         | Unscoped relation filter across all spaces, or `first` too high | Add `spaceId: { is: "..." }` inside relation filter; reduce `first`.               |
| Empty `nodes` from `entities` query               | Wrapping in `{ nodes }` — `entities` returns flat array         | Remove `nodes` wrapper.                                                            |
| `field "equalTo" not defined on UUIDFilter`       | Using `equalTo` on a UUID field                                 | Use `is` (or `in` for a set).                                                      |
| Missing property value                            | Value has a different type than queried                         | Check all typed fields (`text`, `date`, `boolean`, `decimal`, `integer`, `float`). |
| `every` filter returns no results                 | `every` requires all items to match full condition              | Use `none` for exclusion.                                                          |
