# Example: paginate a large list

When a result set might exceed 1000 entries, use `entitiesConnection` with cursor-based pagination. Offset-based pagination (`entities` with `offset`) is capped at 1000 server-side.

## Query shape

```graphql
{
  entitiesConnection(
    typeId: "4faff0b210cb49958e20109409b8699c" # Person
    spaceId: "c9f267dcb0d270718c2a3c45a64afd32" # Crypto space
    first: 500
    after: "OPTIONAL_CURSOR"
  ) {
    totalCount
    nodes {
      id
      name
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

- **`first`** — batch size. Start at 500; drop to 100 or 50 if complex filters trigger 500s.
- **`after`** — omit on the first request; pass `pageInfo.endCursor` from the previous response on subsequent requests.
- **`totalCount`** — the full count across all pages, available even on page 1.

## TypeScript loop

```typescript
type Entity = { id: string; name: string };

async function fetchAllPersons(spaceId: string): Promise<Entity[]> {
  const PERSON_TYPE = "4faff0b210cb49958e20109409b8699c";
  const out: Entity[] = [];
  let cursor: string | null = null;

  while (true) {
    const afterClause = cursor ? `after: "${cursor}"` : "";
    const res = await fetch("https://testnet-api.geobrowser.io/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
        entitiesConnection(typeId: "${PERSON_TYPE}", spaceId: "${spaceId}", first: 500 ${afterClause}) {
          nodes { id name }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      }),
    });
    const { data } = await res.json();
    const conn = data.entitiesConnection;
    out.push(...(conn?.nodes ?? []));
    if (!conn?.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  return out;
}
```

## When to use `entities` (flat) instead

- The result is known to be small (a few dozen).
- You're filtering by a bounded set of IDs: `entities(filter: { id: { in: ["…", "…"] } })`.
- You don't need `totalCount` or cursor continuation.

## Common mistakes

- **Wrapping `entities` in `nodes`** — only `entitiesConnection` has `nodes`. `entities` returns a flat array.
- **Paginating past offset 1000 on `entities`** — server returns 400. Switch to `entitiesConnection`.
- **Forgetting `spaceId` on relation filters** — triggers `INTERNAL_SERVER_ERROR` on cross-space scans. Always scope.
