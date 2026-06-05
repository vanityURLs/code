import sonarjs from "eslint-plugin-sonarjs";

const COMMON_GLOBALS = {
  AbortController: "readonly",
  Buffer: "readonly",
  Headers: "readonly",
  Request: "readonly",
  Response: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  console: "readonly",
  crypto: "readonly",
  fetch: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly"
};

const COMPLEXITY_BUDGET = {
  complexity: ["warn", { max: 12 }],
  "max-depth": ["warn", 4],
  "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
  "max-lines-per-function": ["warn", { max: 60, skipBlankLines: true, skipComments: true, IIFEs: true }],
  "max-params": ["warn", 4],
  "sonarjs/cognitive-complexity": ["warn", 15]
};

export default [
  {
    ignores: ["build/**", "src/**", "node_modules/**", ".wrangler/**", "coverage/**", "!scripts/lib/build/**"]
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: COMMON_GLOBALS,
      sourceType: "module"
    },
    plugins: {
      sonarjs
    },
    rules: COMPLEXITY_BUDGET
  }
];
