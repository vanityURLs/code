#!/usr/bin/env node

const daily = [
  {
    title: "1. Modify links",
    detail: "Edit custom/v8s-links.txt with v8s-lnk or your preferred editor."
  },
  {
    title: "2. Prove the change",
    detail: "Run npm run check:links for link-only changes, or npm run check for the full confidence gate."
  },
  {
    title: "3. Commit and push",
    detail: "Commit the modified custom/ files and push to GitHub."
  },
  {
    title: "4. Let Cloudflare deploy",
    detail: "Workers CI/CD deploys the new configuration automatically from GitHub."
  }
];

const sections = [
  {
    title: "Daily commands",
    rationale: "These are the commands you normally need while changing an instance.",
    commands: [
      ["npm run check", "Run the full local confidence gate before pushing."],
      ["npm run check:links", "Run the fast link-change gate: build, lint, and registry tests."],
      ["npm run build", "Generate build/ and src/ when you want to inspect output without the full gate."],
      ["npm run help", "Show this operating guide."]
    ]
  },
  {
    title: "Debugging commands",
    rationale: "Use these when check fails or when you want to isolate one layer.",
    commands: [
      ["npm run validate", "Validate generated runtime artifacts."],
      ["npm run validate:registry", "Validate build/v8s.json structure and policy constraints."],
      ["npm run validate:targets", "Check outbound link targets for release confidence."],
      ["npm run test", "Run all behavior tests."],
      ["npm run test:worker", "Worker runtime behavior tests only."],
      ["npm run test:registry", "Registry generation and schema contract tests only."],
      ["npm run lint", "Run vanityURLs-specific repository hygiene checks."],
      ["npm run format", "Rewrite supported files with Prettier."],
      ["npm run clean", "Remove generated output before rebuilding or comparing artifacts."],
      ["npm run smoke", "Run configured runtime/provider smoke checks."],
      ["npm run smoke:analytics", "Provider-facing analytics smoke check."]
    ]
  },
  {
    title: "Setup and maintenance commands",
    rationale: "Use these when creating an instance, upgrading product files, or preparing your workstation.",
    commands: [
      ["npm run setup", "Configure or refresh instance-owned settings."],
      ["npm run detach", "Detach a clone from the upstream product repository."],
      ["npm run upgrade", "Refresh product-owned files while preserving custom/."],
      ["npm run local-install", "Install workstation helper commands."],
      ["npm run local-publish", "Run local checks, select commits, and push local changes."],
      ["npm run generate:blocklist", "Generate blocklist feed data."]
    ]
  },
  {
    title: "Manual deployment commands",
    rationale:
      "Normal production deploys should happen through GitHub and Cloudflare CI/CD. Use these only when debugging or intentionally bypassing that flow.",
    commands: [
      ["npm run dev", "Run the Worker locally with Wrangler."],
      ["npm run deploy", "Deploy directly with Wrangler."]
    ]
  },
  {
    title: "Aliases",
    rationale: "Kept for muscle memory.",
    commands: [
      ["npm run build:links", "Alias for npm run build."],
      ["npm run check:targets", "Alias for npm run validate:targets."],
      ["npm run ci:check", "Alias for npm run check."],
      ["npm run generate", "Alias for npm run generate:manifest."],
      ["npm run update", "Alias for npm run upgrade."]
    ]
  }
];

const commandWidth = Math.max(...sections.flatMap((section) => section.commands.map(([command]) => command.length)));

console.log("vanityURLs command flow\n");
console.log("Daily use");
for (const step of daily) {
  console.log(`  ${step.title}`);
  console.log(`     ${step.detail}`);
}
console.log("");

for (const section of sections) {
  console.log(section.title);
  console.log(section.rationale);

  for (const [command, description] of section.commands) {
    console.log(`  ${command.padEnd(commandWidth)}  ${description}`);
  }

  console.log("");
}

console.log("Mental model");
console.log("  build    = make deployable output");
console.log("  validate = prove generated data is structurally correct");
console.log("  test     = prove behavior");
console.log("  smoke    = try runtime/provider integrations");
console.log("  check    = build + lint + tests, the normal pre-push gate");
