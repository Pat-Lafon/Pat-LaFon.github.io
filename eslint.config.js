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
      // useState seeds read the clock (todayKey) and localStorage — impure but fine
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
    files: ["_config/sw/hiragana.js", "_config/sw/meditation.js"],
    languageOptions: {
      globals: { ...globals.serviceworker },
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Pure shared modules (DOM/storage passed in, never referenced globally) —
    // run in the browser app and imported by Node tests.
    files: ["hiragana/srs.js", "hiragana/numbers.js", "hiragana/storage.js"],
    languageOptions: {
      globals: { ...globals.browser },
      sourceType: "module",
    },
  },
  {
    files: ["hiragana/**/*.test.js", "hiragana/vendor/*.js", "hiragana/audio/build.js"],
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
    ignores: ["_site/", "node_modules/", "hiragana/vendor/react*.js", "hiragana/vendor/scheduler.js", "hiragana/vendor/htm.js"],
  },
];
