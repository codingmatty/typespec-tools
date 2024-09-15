/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@typespec-tools/eslint-config/library.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: './tsconfig.json',
  },
};
