## Contributing

The canonical content is the per-skill `SKILL.md` + `reference.md` + `examples/`. Keep `SKILL.md` focused (~500 lines); push depth into `reference.md` and discrete worked examples.

Publishing documentation and examples target the exact stable `@geoprotocol/geo-sdk@0.20.1` contract. Use configured clients with `GeoTestnetConfig`, current `Ops` builders, and only IDs exported by that version. When a property has no canonical export, require schema discovery and use an explicit placeholder instead of guessing.

Custom Node ESM examples install exact `@geoprotocol/geo-sdk@0.20.1` plus direct `viem` in their project. Shipped CLIs alone may rely on the skill-local frozen install. Credential examples must use a dedicated, least-privilege testnet key in a protected gitignored env file and must never expose it through command arguments, repository files, fork PR CI, artifacts, or debug output.

Before submitting changes, run:

```bash
bun install --frozen-lockfile
bun install --cwd geo-publish --frozen-lockfile
bun run fmt:check
bun test
```

The migration scanner intentionally permits current GraphQL operators such as `isInsensitive` and `includesInsensitive`. Add a regression only for an actually retired endpoint, SDK surface, ID, filter, or value representation.

## Scope (v1)

Core CRUD against the knowledge graph. Out of scope for v1:

- Advanced cross-space operations (entity merges, ID changes, property-reference migration).
- Automated eval harness for skill quality regression.
- Mainnet (testnet only).
- Compatibility fallbacks for earlier Geo SDK or API versions.
