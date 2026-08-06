import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const publishRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function readGuidance() {
  const paths = [
    "SKILL.md",
    "reference.md",
    "examples/create-entity.md",
    "examples/create-relation.md",
    "examples/update-entity.md",
  ];
  return (
    await Promise.all(paths.map((path) => readFile(resolve(publishRoot, path), "utf8")))
  ).join("\n");
}

test("custom scripts install exact direct dependencies and credentials stay out of logs", async () => {
  const skill = await readFile(resolve(publishRoot, "SKILL.md"), "utf8");
  const guidance = await readGuidance();
  const credentials = skill.match(
    /### Credentials\n\n(?<credentials>[\s\S]*?)\n\nThe signer also needs/,
  )?.groups?.credentials;

  assert.match(guidance, /@geoprotocol\/geo-sdk@0\.20\.1/);
  assert.match(guidance, /\bviem\b/);
  assert.doesNotMatch(guidance, /\bNODE_PATH\b/);
  assert.match(guidance, /dedicated, least-privilege testnet key/i);
  assert.match(guidance, /fork(?:ed)? PR CI/i);
  assert.match(guidance, /rotate/i);
  assert.ok(credentials, "missing Credentials guidance");
  assert.match(
    credentials,
    /When the user does not have one configured,[\s\S]*https:\/\/www\.geobrowser\.io\/export-wallet[\s\S]*press \*\*Copy key\*\*/,
  );
  assert.match(credentials, /protected local or manual secret store/);
  assert.match(credentials, /Never paste or write the key in chat/);
});

test("guidance uses configured v0.20 clients, ops, and wallet submission", async () => {
  const guidance = await readGuidance();

  assert.match(guidance, /createGeoClient\(\{\s*network:\s*GeoTestnetConfig\s*\}\)/s);
  assert.match(
    guidance,
    /createGeoWalletClient\(\{\s*signer,\s*network:\s*GeoTestnetConfig\s*\}\)/s,
  );
  assert.match(guidance, /privateKeyToAccount\(privateKey\)/);
  assert.match(guidance, /Ops\.entities\.create\(/);
  assert.match(guidance, /Ops\.entities\.update\(/);
  assert.match(guidance, /Ops\.relations\.create\(/);
  assert.match(guidance, /Ops\.relations\.update\(/);
  assert.match(guidance, /Ops\.relations\.delete\(/);
  assert.match(guidance, /geo\.personalSpaces\.publishEdit\(/);
  assert.match(guidance, /wallet\.sendTransaction\(\{\s*to,\s*data:\s*calldata\s*\}\)/s);
  assert.match(guidance, /geo\.personalSpaces\.create\(/);
  assert.match(guidance, /ops:\s*creation\.ops/);
  assert.match(guidance, /geo\.personalSpaces\.setTopic\(/);
  assert.match(guidance, /functionName:\s*"addressToSpaceId"/);
});

test("DAO guidance is space-ID based and version aware", async () => {
  const guidance = await readGuidance();

  assert.match(guidance, /geo\.daoSpaces\.proposeEdit\(/);
  assert.match(guidance, /author:\s*PERSONAL_SPACE_ID/);
  assert.match(guidance, /callerSpaceId:\s*PERSONAL_SPACE_ID/);
  assert.match(guidance, /daoSpaceId:\s*DAO_SPACE_ID/);
  assert.match(guidance, /versionId:\s*proposal\.versionId/);
  assert.match(guidance, /authorSpaceId:\s*PERSONAL_SPACE_ID/);
  assert.match(guidance, /spaceId:\s*DAO_SPACE_ID/);
  assert.match(guidance, /votingMode:\s*"SLOW"/);
  assert.match(guidance, /geo\.daoSpaces\.executeProposal\(/);
  assert.match(guidance, /\bendTime\b/);
  assert.match(guidance, /\bexecuteBy\b/);
  assert.match(guidance, /spaceVotingSetting/);
  assert.match(guidance, /currentVersion/);
  assert.match(guidance, /proposalVersions/);
});

test("specialized publishing workflows match v0.20 value and context semantics", async () => {
  const guidance = await readGuidance();

  assert.match(guidance, /await geo\.entities\.delete\(\{\s*id:\s*entityId,\s*spaceId/s);
  assert.match(guidance, /if \(deleteOps\.length === 0\)/);
  assert.match(guidance, /const \w+Ops = TextBlock\.make\(/);
  assert.match(guidance, /Position\.generate\(\)/);
  assert.match(guidance, /Position\.generateBetween\(/);
  assert.match(guidance, /await geo\.images\.create\(/);
  assert.match(guidance, /type:\s*"decimal"[\s\S]*exponent:[\s\S]*mantissa:/);
  assert.match(guidance, /type:\s*"time",\s*value:\s*"14:30:00Z"/);
  assert.match(guidance, /type:\s*"datetime",\s*value:\s*"2026-07-30T14:30:00\+02:00"/);
  assert.match(guidance, /type:\s*"text",\s*value:\s*"https:\/\//);
});

test("every worked example uses its current executable workflow", async () => {
  const [createEntity, createRelation, updateEntity] = await Promise.all(
    ["examples/create-entity.md", "examples/create-relation.md", "examples/update-entity.md"].map(
      (path) => readFile(resolve(publishRoot, path), "utf8"),
    ),
  );

  assert.match(createEntity, /Ops\.entities\.create\(/);
  assert.match(createEntity, /geo\.personalSpaces\.publishEdit\(/);
  assert.match(createEntity, /geo\.daoSpaces\.proposeEdit\(/);
  assert.match(createEntity, /versionId:\s*proposal\.versionId/);

  assert.match(createRelation, /Ops\.relations\.create\(/);
  assert.match(createRelation, /Ops\.relations\.update\(/);
  assert.match(createRelation, /Ops\.relations\.delete\(/);
  assert.match(createRelation, /SystemIds\.WORKS_AT_PROPERTY/);
  assert.match(createRelation, /DISCOVERED_START_DATE_PROPERTY_ID/);

  assert.match(updateEntity, /Ops\.entities\.update\(/);
  assert.match(updateEntity, /Ops\.relations\.update\(/);
  assert.match(updateEntity, /Ops\.relations\.delete\(/);
  assert.match(updateEntity, /await geo\.entities\.delete\(/);
  assert.match(updateEntity, /deleteOps\.length === 0/);
});
