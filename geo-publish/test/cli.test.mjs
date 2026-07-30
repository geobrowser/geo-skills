import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { ContentIds, GeoTestnetConfig, SystemIds } from "@geoprotocol/geo-sdk";

import { mainPublishEntity, runPublishEntity, TYPE_ALIASES } from "../bin/publish-entity.mjs";
import { runWhoami } from "../bin/whoami.mjs";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const PERSONAL_SPACE_ID = "11111111111111111111111111111111";
const DAO_SPACE_ID = "22222222222222222222222222222222";
const ENTITY_ID = "33333333333333333333333333333333";
const PRIVATE_KEY = `0x${"11".repeat(32)}`;
const REGISTRY = GeoTestnetConfig.contracts.SPACE_REGISTRY_ADDRESS;
const CALLDATA = "0x1234";

function captureLogger() {
  const lines = [];
  return {
    lines,
    log(...values) {
      lines.push(values.join(" "));
    },
    error(...values) {
      lines.push(values.join(" "));
    },
  };
}

function entityOpsRecorder(calls) {
  return {
    entities: {
      create(params) {
        calls.push(params);
        return { id: ENTITY_ID, ops: [{ type: "create" }] };
      },
    },
  };
}

test("whoami reports signer identity, personal space, and editable spaces", async () => {
  const logger = captureLogger();
  const queries = [];
  const runtime = {
    address: ADDRESS,
    geo: {
      api: {
        async graphql(query) {
          queries.push(query);
          if (queries.length === 1) return { data: { spaces: [{ id: PERSONAL_SPACE_ID }] } };
          return {
            data: {
              editorsConnection: {
                nodes: [
                  {
                    space: { id: DAO_SPACE_ID, type: "DAO", topic: { name: "Builders" } },
                  },
                ],
              },
            },
          };
        },
      },
    },
  };

  const result = await runWhoami({ runtime, logger });

  assert.deepEqual(result, {
    address: ADDRESS,
    personalSpaceId: PERSONAL_SPACE_ID,
    editableSpaces: [{ space: { id: DAO_SPACE_ID, type: "DAO", topic: { name: "Builders" } } }],
  });
  assert.match(queries[0], new RegExp(ADDRESS));
  assert.match(queries[1], new RegExp(PERSONAL_SPACE_ID));
  assert.match(logger.lines.join("\n"), new RegExp(`Wallet address : ${ADDRESS}`));
  assert.match(logger.lines.join("\n"), new RegExp(`Personal space : ${PERSONAL_SPACE_ID}`));
  assert.match(logger.lines.join("\n"), new RegExp(`${DAO_SPACE_ID}  \\[DAO\\]  Builders`));
});

test("the type alias map contains exactly the supported 0.20.1 aliases", () => {
  assert.deepEqual(Object.keys(TYPE_ALIASES), [
    "DEFAULT_TYPE",
    "PERSON_TYPE",
    "COMPANY_TYPE",
    "PROJECT_TYPE",
    "ROLE_TYPE",
    "ARTICLE_TYPE",
    "TOPIC_TYPE",
    "SKILL_TYPE",
  ]);
  assert.deepEqual(TYPE_ALIASES, {
    DEFAULT_TYPE: SystemIds.DEFAULT_TYPE,
    PERSON_TYPE: SystemIds.PERSON_TYPE,
    COMPANY_TYPE: SystemIds.COMPANY_TYPE,
    PROJECT_TYPE: SystemIds.PROJECT_TYPE,
    ROLE_TYPE: SystemIds.ROLE_TYPE,
    ARTICLE_TYPE: ContentIds.ARTICLE_TYPE,
    TOPIC_TYPE: ContentIds.TOPIC_TYPE,
    SKILL_TYPE: ContentIds.SKILL_TYPE,
  });
});

test("every retained alias resolves while removed aliases fail before runtime creation", async () => {
  for (const [alias, expectedType] of Object.entries(TYPE_ALIASES)) {
    const createCalls = [];
    let walletCalls = 0;

    await runPublishEntity({
      argv: [
        "--name",
        `Alias ${alias}`,
        "--type",
        alias,
        "--space-id",
        PERSONAL_SPACE_ID,
        "--author",
        PERSONAL_SPACE_ID,
        "--dry-run",
      ],
      privateKey: PRIVATE_KEY,
      logger: captureLogger(),
      opsApi: entityOpsRecorder(createCalls),
      createRuntime() {
        return {
          address: ADDRESS,
          network: GeoTestnetConfig,
          geo: {},
          async createWallet() {
            walletCalls += 1;
          },
        };
      },
    });

    assert.deepEqual(createCalls[0].types, [expectedType]);
    assert.equal(walletCalls, 0);
  }

  let runtimeCalls = 0;
  await assert.rejects(
    runPublishEntity({
      argv: ["--name", "Removed alias", "--type", "EVENT_TYPE", "--dry-run"],
      privateKey: PRIVATE_KEY,
      logger: captureLogger(),
      createRuntime() {
        runtimeCalls += 1;
      },
    }),
    /Unknown --type "EVENT_TYPE".*DEFAULT_TYPE.*SKILL_TYPE/,
  );
  assert.equal(runtimeCalls, 0);
});

test("omitting --type uses SystemIds.DEFAULT_TYPE and dry-run creates no wallet", async () => {
  const createCalls = [];
  let walletCalls = 0;
  const logger = captureLogger();

  const result = await runPublishEntity({
    argv: [
      "--name",
      "Default entity",
      "--space-id",
      PERSONAL_SPACE_ID,
      "--author",
      PERSONAL_SPACE_ID,
      "--dry-run",
    ],
    privateKey: PRIVATE_KEY,
    logger,
    opsApi: entityOpsRecorder(createCalls),
    createRuntime() {
      return {
        address: ADDRESS,
        network: GeoTestnetConfig,
        geo: {},
        async createWallet() {
          walletCalls += 1;
        },
      };
    },
  });

  assert.deepEqual(createCalls[0].types, [SystemIds.DEFAULT_TYPE]);
  assert.equal(walletCalls, 0);
  assert.equal(result.type, "DEFAULT_TYPE");
  assert.match(logger.lines.join("\n"), /\[dry-run\] would publish 1 ops/);
});

test("a write publishes with the configured client and submits the exact target and calldata", async () => {
  const publishCalls = [];
  const sendCalls = [];
  let walletCalls = 0;
  const runtime = {
    address: ADDRESS,
    network: GeoTestnetConfig,
    geo: {
      personalSpaces: {
        async publishEdit(params) {
          publishCalls.push(params);
          return { editId: "edit-id", cid: "ipfs://cid", to: REGISTRY, calldata: CALLDATA };
        },
      },
    },
    async createWallet() {
      walletCalls += 1;
      return {
        async sendTransaction(params) {
          sendCalls.push(params);
          return "0xtransaction";
        },
      };
    },
  };

  const result = await runPublishEntity({
    argv: [
      "--name",
      "Published entity",
      "--description",
      "A current entity.",
      "--space-id",
      PERSONAL_SPACE_ID,
      "--author",
      PERSONAL_SPACE_ID,
    ],
    privateKey: PRIVATE_KEY,
    logger: captureLogger(),
    opsApi: entityOpsRecorder([]),
    createRuntime(params) {
      assert.deepEqual(params, { privateKey: PRIVATE_KEY, network: GeoTestnetConfig });
      return runtime;
    },
  });

  assert.equal(runtime.network, GeoTestnetConfig);
  assert.equal(walletCalls, 1);
  assert.deepEqual(publishCalls, [
    {
      name: "Add Published entity",
      spaceId: PERSONAL_SPACE_ID,
      ops: [{ type: "create" }],
      author: PERSONAL_SPACE_ID,
    },
  ]);
  assert.deepEqual(sendCalls, [{ to: REGISTRY, data: CALLDATA }]);
  assert.equal(result.txHash, "0xtransaction");
});

test("publishing fails before operation or wallet creation when no personal space exists", async () => {
  let operationCalls = 0;
  let walletCalls = 0;

  await assert.rejects(
    runPublishEntity({
      argv: ["--name", "No personal space"],
      privateKey: PRIVATE_KEY,
      logger: captureLogger(),
      opsApi: {
        entities: {
          create() {
            operationCalls += 1;
          },
        },
      },
      createRuntime() {
        return {
          address: ADDRESS,
          network: GeoTestnetConfig,
          geo: {
            api: { graphql: async () => ({ data: { spaces: [] } }) },
          },
          async createWallet() {
            walletCalls += 1;
          },
        };
      },
    }),
    /No personal space found.*Create one before publishing/,
  );

  assert.equal(operationCalls, 0);
  assert.equal(walletCalls, 0);
});

test("writes fail closed on the wrong chain, target, or malformed calldata", async (t) => {
  const scenarios = [
    {
      name: "chain",
      network: { ...GeoTestnetConfig, chain: { ...GeoTestnetConfig.chain, id: 1 } },
      transaction: { to: REGISTRY, calldata: CALLDATA },
      expected: /Refusing to publish on chain 1/,
    },
    {
      name: "target",
      network: GeoTestnetConfig,
      transaction: { to: "0x2222222222222222222222222222222222222222", calldata: CALLDATA },
      expected: /does not match the configured space registry/,
    },
    {
      name: "calldata",
      network: GeoTestnetConfig,
      transaction: { to: REGISTRY, calldata: "0x" },
      expected: /invalid transaction calldata/,
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      let walletCalls = 0;
      await assert.rejects(
        runPublishEntity({
          argv: [
            "--name",
            "Unsafe entity",
            "--space-id",
            PERSONAL_SPACE_ID,
            "--author",
            PERSONAL_SPACE_ID,
          ],
          privateKey: PRIVATE_KEY,
          logger: captureLogger(),
          opsApi: entityOpsRecorder([]),
          createRuntime() {
            return {
              address: ADDRESS,
              network: scenario.network,
              geo: {
                personalSpaces: {
                  async publishEdit() {
                    return {
                      editId: "edit-id",
                      cid: "ipfs://cid",
                      ...scenario.transaction,
                    };
                  },
                },
              },
              async createWallet() {
                walletCalls += 1;
              },
            };
          },
        }),
        scenario.expected,
      );
      assert.equal(walletCalls, 0);
    });
  }
});

test("CLI entry points return useful statuses without logging malformed keys", async () => {
  const logger = captureLogger();
  const malformedKey = "this-is-not-a-private-key";
  const status = await mainPublishEntity({
    argv: ["--name", "Invalid signer", "--dry-run"],
    privateKey: malformedKey,
    logger,
  });

  assert.equal(status, 1);
  assert.match(logger.lines.join("\n"), /GEO_PRIVATE_KEY/);
  assert.doesNotMatch(logger.lines.join("\n"), new RegExp(malformedKey));

  const script = fileURLToPath(new URL("../bin/publish-entity.mjs", import.meta.url));
  const spawned = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, GEO_PRIVATE_KEY: "" },
  });
  assert.equal(spawned.status, 2);
  assert.match(spawned.stderr, /Usage: publish-entity\.mjs/);
});
