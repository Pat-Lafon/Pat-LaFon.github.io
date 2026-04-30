import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["hiragana/app.js"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_|^e$" }],
      // localStorage init in effects is standard for this app pattern
      "react-hooks/set-state-in-effect": "off",
      // useState(() => Date.now()) is fine for a timestamp seed
      "react-hooks/purity": "off",
    },
    languageOptions: {
      globals: { ...globals.browser },
      sourceType: "module",
    },
  },
  {
    files: ["meditation/app.js"],
    languageOptions: {
      globals: { ...globals.browser },
      sourceType: "script",
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_|^e$" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["hiragana/sw.js", "meditation/sw.js"],
    languageOptions: {
      globals: { ...globals.serviceworker },
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["hiragana/**/*.test.js", "hiragana/vendor/*.js"],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: [
      "eleventy.config.js",
      "eslint.config.js",
      "_config/**/*.js",
      "_data/**/*.js",
      "content/**/*.11tydata.js",
    ],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_|^e$" }],
    },
  },
  {
    ignores: ["_site/", "node_modules/", "hiragana/vendor/react*.js", "hiragana/vendor/htm.js"],
  },
];
