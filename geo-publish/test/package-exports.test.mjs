import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import * as abis from "@geoprotocol/geo-sdk/abis";
import * as client from "@geoprotocol/geo-sdk/client";
import * as contracts from "@geoprotocol/geo-sdk/contracts";
import * as networks from "@geoprotocol/geo-sdk/networks";
import * as ops from "@geoprotocol/geo-sdk/ops";
import * as sdk from "@geoprotocol/geo-sdk";

const requiredRootExports = [
  "ContentIds",
  "GeoTestnetConfig",
  "Ops",
  "Position",
  "SystemIds",
  "TextBlock",
  "createGeoClient",
  "createGeoWalletClient",
];

test("the installed SDK is the complete 0.20.1 release", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../node_modules/@geoprotocol/geo-sdk/package.json", import.meta.url)),
  );

  assert.equal(packageJson.version, "0.20.1");
  for (const name of requiredRootExports) {
    assert.ok(name in sdk, `missing root export: ${name}`);
  }
});

test("the migration-required SDK subpaths are importable", () => {
  for (const [name, module] of Object.entries({ abis, client, contracts, networks, ops })) {
    assert.ok(Object.keys(module).length > 0, `empty SDK subpath: ${name}`);
  }
});
