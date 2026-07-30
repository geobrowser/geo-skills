# Example: look up a single entity

The starting point for almost any investigation is fetching one entity by ID and seeing its full shape: types, values, and relations.

## Query

```graphql
{
  entity(id: "6b9f649e38b64224927dd66171343730") {
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
      "id": "6b9f649e38b64224927dd66171343730",
      "name": "Geo",
      "description": null,
      "spaceIds": ["a19c345ab9866679b001d7d2138d88a1"],
      "types": [{ "id": "06053fcf64434dc680ca8a3b173a6016", "name": "Root" }],
      "values": {
        "nodes": [
          {
            "property": { "id": "a126ca530c8e48d5b88882c734c38935", "name": "Name" },
            "text": "Geo",
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
            "type": { "id": "39e40cadb23d4f63ab2faea1596436c7", "name": "Subtopics" },
            "toEntity": { "id": "5a98682790a1473385dc92263503f93b", "name": "Technology" }
          }
        ]
      }
    }
  }
}
```

## Reading the result

- **`values.nodes[].text` / `.date` / `.boolean` / …** — exactly one of these typed fields is non-null per value. Don't assume a generic `value` field exists.
- **`relations.nodes[].id`** — the edge ID to use when deleting the relation.
- **`relations.nodes[].entityId`** — the relation as an entity. Use this if the relation has its own properties (e.g. a "Worked at" relation with a start date).
- **`types`** — the types this entity is categorized as. For most content entities you'll see one or two.

## curl

```bash
curl -s --compressed 'https://api-testnet.geobrowser.io/graphql' \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ entity(id: \"6b9f649e38b64224927dd66171343730\") { id name types { name } } }"}' | jq .
```

If you only have a browser link like `https://www.geobrowser.io/space/{spaceId}/{entityId}`, the last path segment is the entity ID.
