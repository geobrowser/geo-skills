# geo-skills

Skills for AI coding agents (Claude Code, Cursor, Pi.dev, Copilot, Cline, …) to query and publish data to the [Geo](https://www.geobrowser.io) decentralized knowledge graph.

## What's here

| Skill                                   | Purpose                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`geo-query`](./geo-query/SKILL.md)     | Query the Geo knowledge graph via GraphQL — look up entities, search by type, paginate, discover schemas.             |
| [`geo-publish`](./geo-publish/SKILL.md) | Publish entities and relations via `@geoprotocol/geo-sdk` — create, update, delete, submit to personal or DAO spaces. |

Each skill ships with a compact `SKILL.md`, a deep `reference.md`, and worked `examples/`.

## Install

### Cross-harness install via `npx skills`

If you use [skills.sh](https://skills.sh), one command installs both skills into whichever harness you have:

```bash
npx skills add geobrowser/geo-skills
# or a single skill:
npx skills add geobrowser/geo-skills --skill geo-query
```

### Claude Code — direct

Symlink (or copy) either skill folder into your Claude Code skills directory:

```bash
# per-user, all projects
ln -s "$(pwd)/geo-query"   ~/.claude/skills/geo-query
ln -s "$(pwd)/geo-publish" ~/.claude/skills/geo-publish

# or per-project (commit to the repo you want them loaded in)
mkdir -p .claude/skills
cp -r /path/to/geo-skills/geo-query   .claude/skills/
cp -r /path/to/geo-skills/geo-publish .claude/skills/
```

Claude Code will activate the skill when its `description` / trigger phrases match the user's prompt.

### Pi.dev — direct from git

```bash
pi install git:github.com/geobrowser/geo-skills
```

Pi.dev treats each `SKILL.md` folder as a capability package.

### Cursor / Copilot — manual

Both harnesses read markdown instruction files. The simplest path: symlink or copy `geo-query/SKILL.md` and `geo-publish/SKILL.md` into the location your harness expects (`.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, etc.). Strip the frontmatter that your harness doesn't recognize; the body content is portable.

## Prerequisites

- **Reads (`geo-query`)**: none — the testnet GraphQL endpoint is public.
- **Writes (`geo-publish`)**:
  - `GEO_PRIVATE_KEY` env var — [export from geobrowser.io](https://www.geobrowser.io/export-wallet).
  - A JS/TS project (Bun or Node). The skill installs `@geoprotocol/geo-sdk` and `@geoprotocol/grc-20` on demand if they're not already dependencies.
  - To propose to a DAO space, your wallet must be an editor of that space.

## License

[MIT License](./LICENSE)
