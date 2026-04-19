# Example: discover an entity type's schema

Before publishing entities of a type you haven't worked with — or before writing a script that assumes specific property IDs — **query an existing entity of the same type and read its shape**. This beats guessing or hardcoding IDs.

## Step 1 — Find a few entities of the target type

```graphql
{
  entities(typeId: "86db141cf7cb471194ed39088926adb8", first: 3) {
    id
    name
  }
}
```

If you don't know the type ID yet, search the `Type` meta-type by name:

```graphql
{
  entities(
    typeId: "e7d737c536764c609fa16aa64a8c90ad"
    filter: { name: { includesInsensitive: "talk" } }
    first: 20
  ) {
    id
    name
  }
}
```

## Step 2 — Fetch one of them fully

```graphql
{
  entity(id: "PICKED_ENTITY_ID") {
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
        boolean
        decimal
        integer
        float
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

## Step 3 — Read off the IDs

From the response you get everything needed to create new entities of this type:

- **Property IDs** — `values.nodes[].property.id`. Note the typed field that was non-null to know the data type (`text`, `date`, etc.).
- **Relation type IDs** — `relations.nodes[].type.id` and `type.name`.
- **Classification values** — for relations that point at a controlled vocabulary (e.g. a "Role" relation pointing at a specific role entity), `relations.nodes[].toEntity.id` is the value you'd reuse.

## Step 4 — Cross-check with a second sample

If the first entity is incomplete, fetch a second one to see properties the first didn't set. Types in Geo define default properties, but not every entity populates every property.

## Why this matters

Geo is a permissionless graph — anyone can define types and properties, and schemas evolve. Hardcoded IDs from older docs drift. Treat schema discovery as a first-class step before every new publishing script.

## Shortcut for common types

For widely-used types exported by the SDK, skip discovery and use the constants:

```typescript
import { SystemIds, ContentIds } from "@geoprotocol/geo-sdk";
// SystemIds.PERSON_TYPE, ContentIds.ARTICLE_TYPE, etc.
```

Still do discovery for property/relation IDs on those types — the SDK doesn't export everything.
