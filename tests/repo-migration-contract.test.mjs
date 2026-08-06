import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publishPackagePath = resolve(repositoryRoot, "geo-publish/package.json");
const querySkillPath = resolve(repositoryRoot, "geo-query/SKILL.md");
const queryReferencePath = resolve(repositoryRoot, "geo-query/reference.md");
const sourceExtensions = new Set([".js", ".jsx", ".md", ".mjs", ".ts", ".tsx"]);

const forbiddenPatterns = [
  ["old testnet API hostname", /testnet-api\.geobrowser\.io/],
  ["direct grc-20 import", /@geoprotocol\/grc-20/],
  ["legacy Graph namespace", /\bGraph\./],
  ["legacy personalSpace namespace", /\bpersonalSpace\./],
  ["legacy daoSpace namespace", /\bdaoSpace\./],
  ["legacy smart-account wallet helper", /\bgetSmartAccountWalletClient\b/],
  ["string TESTNET network selector", /network\s*:\s*["']TESTNET["']/],
  ["DAO contract-address argument", /\bdaoSpaceAddress\b/],
  ["removed URL value type", /type\s*:\s*["']url["']/],
  ["legacy Position helper", /\bPosition\.(?:default|after|before)\b/],
  [
    "removed SDK constant",
    /\b(?:SystemIds\.(?:DATE_FOUNDED_PROPERTY|END_DATE_PROPERTY|EVENT_TYPE|INSTITUTION_TYPE|START_DATE_PROPERTY|STUDIED_AT_PROPERTY|TEAM_MEMBERS_PROPERTY|WORKED_AT_PROPERTY)|ContentIds\.(?:EPISODE_TYPE|PODCAST_TYPE|TALK_TYPE))\b/,
  ],
  ["legacy GraphQL filter operator", /\b(?:equalTo|notEqualTo)\b/],
  ["removed UUID-list contains operator", /\bcontains\s*:/],
  ["retired Person type fixture", /4faff0b210cb49958e20109409b8699c/],
  ["retired Project type fixture", /4d0076ff1e824585b03066f6bf6420ce/],
];

async function collectSourceFiles(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "node_modules") continue;

    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (sourceExtensions.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

test("geo-publish declares the stable SDK and every direct runtime dependency", async () => {
  const manifest = JSON.parse(await readFile(publishPackagePath, "utf8"));

  assert.equal(manifest.dependencies?.["@geoprotocol/geo-sdk"], "0.20.1");
  assert.equal(manifest.dependencies?.viem, "^2.37.6");
  assert.equal(manifest.dependencies?.["@geoprotocol/grc-20"], undefined);
});

test("active sources contain no forbidden pre-v0.20 migration patterns", async () => {
  const files = [
    resolve(repositoryRoot, "README.md"),
    resolve(repositoryRoot, "CONTRIBUTING.md"),
    ...(await collectSourceFiles(resolve(repositoryRoot, "geo-query"))),
    ...(await collectSourceFiles(resolve(repositoryRoot, "geo-publish"))),
  ];
  const violations = [];

  for (const path of files.sort()) {
    const lines = (await readFile(path, "utf8")).split("\n");
    for (const [index, line] of lines.entries()) {
      for (const [label, pattern] of forbiddenPatterns) {
        if (pattern.test(line)) {
          violations.push(`${relative(repositoryRoot, path)}:${index + 1}: ${label}`);
        }
      }
    }
  }

  assert.deepEqual(violations, [], `Forbidden migration patterns:\n${violations.join("\n")}`);
});

test("migration scanner permits current insensitive filter operators", () => {
  const currentOperators = "isInsensitive includesInsensitive";

  for (const [label, pattern] of forbiddenPatterns) {
    assert.equal(pattern.test(currentOperators), false, `${label} rejects a current operator`);
  }
});

test("geo-query documents the current API, fixtures, filters, and resolvable spaces", async () => {
  const [skill, reference] = await Promise.all([
    readFile(querySkillPath, "utf8"),
    readFile(queryReferencePath, "utf8"),
  ]);
  const queryGuidance = `${skill}\n${reference}`;

  assert.match(queryGuidance, /https:\/\/api-testnet\.geobrowser\.io\/graphql/);
  assert.match(queryGuidance, /7ed45f2bc48b419e8e4664d5ff680b0d/);
  assert.match(queryGuidance, /484a18c5030a499cb0f2ef588ff16d50/);
  assert.match(queryGuidance, /e550fe517e904b2c8fffdf13408f5634/);
  assert.match(queryGuidance, /6b9f649e38b64224927dd66171343730/);
  assert.match(queryGuidance, /\bisNot\b/);
  assert.match(queryGuidance, /\bnotIn\b/);
  assert.match(queryGuidance, /\bcontainedBy\b/);
  assert.match(queryGuidance, /\boverlaps\b/);
  assert.match(queryGuidance, /\banyEqualTo\b/);

  assert.doesNotMatch(queryGuidance, /testnet-api\.geobrowser\.io/);
  assert.doesNotMatch(
    queryGuidance,
    /(?:4faff0b210cb49958e20109409b8699c|4d0076ff1e824585b03066f6bf6420ce)/,
  );
  assert.doesNotMatch(queryGuidance, /\b(?:equalTo|notEqualTo)\b/);
  assert.doesNotMatch(queryGuidance, /\bcontains\s*:/);
  assert.doesNotMatch(reference, /^\| Education\s+\|/m);
  assert.doesNotMatch(reference, /^\| Finance\s+\|/m);
});
