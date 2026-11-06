// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  // Hermes は ES2023 の非破壊配列メソッドを実装していない（実機で undefined is not a function）。
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        ...["toSorted", "toReversed", "toSpliced"].map((name) => ({
          selector: `CallExpression[callee.property.name='${name}']`,
          message: `Hermes に ${name} はありません。[...arr].sort() などを使ってください。`,
        })),
      ],
    },
  },
  // Records render from the local DB only (plan §1 principle 1, R10). Only the sync engine,
  // the importer and their server client may talk to the API.
  {
    files: [
      "src/app/record/**",
      "src/app/(tabs)/record/**",
      "src/components/record/**",
      "src/hooks/use-exercise-backfill.ts",
      "src/hooks/use-unclassified-exercises.ts",
      "src/lib/records/**",
    ],
    ignores: [
      "src/lib/records/sync-engine.ts",
      "src/lib/records/sync-engine.test.ts",
      "src/lib/records/importer.ts",
      "src/lib/records/importer.test.ts",
      "src/lib/records/server-api.ts",
      "src/lib/records/no-network.test.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/lib/api", message: "Record screens read and write the local DB only; the sync engine talks to the server." },
            { name: "axios", message: "Record screens read and write the local DB only; the sync engine talks to the server." },
          ],
        },
      ],
    },
  },
]);
