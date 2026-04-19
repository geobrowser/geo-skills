# Example: look up a single entity

The starting point for almost any investigation is fetching one entity by ID and seeing its full shape: types, values, and relations.

## Query

```graphql
{
  entity(id: "4faff0b210cb49958e20109409b8699c") {
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
        id # edge ID (use to delete the relation)
        entityId # relation-as-entity ID (use to update relation properties)
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

## Example response shape

```json
{
  "data": {
    "entity": {
      "id": "4faff0b210cb49958e20109409b8699c",
      "name": "Person",
      "description": "A human being.",
      "spaceIds": ["a19c345ab9866679b001d7d2138d88a1"],
      "types": [{ "id": "e7d737c536764c609fa16aa64a8c90ad", "name": "Type" }],
      "values": {
        "nodes": [
          {
            "property": { "id": "...", "name": "Name" },
            "text": "Person",
            "date": null,
            "boolean": null,
            "decimal": null,
            "integer": null,
            "float": null
          }
        ]
      },
      "relations": {
        "nodes": [
          {
            "id": "...",
            "entityId": "...",
            "type": { "id": "...", "name": "Properties" },
            "toEntity": { "id": "...", "name": "Date of birth" }
          }
        ]
      }
    }
  }
}
```

## Reading the result

- **`values.nodes[].text` / `.date` / `.boolean` / …** — exactly one of these typed fields is non-null per value. Don't assume a generic `value` field exists.
- **`relations.nodes[].id`** — the edge. Pass this to `Graph.deleteRelation({ id })` if you need to remove the relation.
- **`relations.nodes[].entityId`** — the relation as an entity. Use this if the relation has its own properties (e.g. a "Worked at" relation with a start date).
- **`types`** — the types this entity is categorized as. For most content entities you'll see one or two.

## curl

```bash
curl -s --compressed 'https://testnet-api.geobrowser.io/graphql' \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ entity(id: \"4faff0b210cb49958e20109409b8699c\") { id name types { name } } }"}' | jq .
```

If you only have a browser link like `https://www.geobrowser.io/space/{spaceId}/{entityId}`, the last path segment is the entity ID.
