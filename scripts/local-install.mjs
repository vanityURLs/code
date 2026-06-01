#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ROOT = process.cwd();
const DEFAULT_CONFIG_PATH = path.join(ROOT, "defaults", "v8s-local-config.json");
const CUSTOM_CONFIG_PATH = path.join(ROOT, "custom", "v8s-local-config.json");
const HELPER_SOURCE_PATH = path.join(ROOT, "scripts", "v8s.sh");
const LNK_SOURCE_PATH = path.join(ROOT, "scripts", "lnk");
const V8S_FIX_SOURCE_PATH = path.join(ROOT, "scripts", "v8s-fix");
const START_MARKER = "# >>> V8S >>>";
const END_MARKER = "# <<< V8S <<<";

function parseArgs(argv) {
  const args = {
    build: true,
    dryRun: false,
    yes: false
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--no-build") {
      args.build = false;
    } else if (arg === "--yes" || arg === "-y") {
      args.yes = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run local-install -- [options]

Configure the local V8S shell helper and lnk CLI for this workstation.

Options:
  --yes       Accept defaults without prompting
  --dry-run   Show planned changes without writing files
  --no-build  Skip npm run build after installing
`);
}

function commandExists(command) {
  return (
    spawnSync(command, ["--version"], {
      encoding: "utf8",
      stdio: "ignore"
    }).status === 0
  );
}

function printJqInstallHelp() {
  console.error("jq is required by the V8S shell helper.");
  console.error("");
  console.error("Install jq, then rerun npm run local-install:");
  console.error("- macOS: brew install jq");
  console.error("- Windows: winget install jqlang.jq");
  console.error("- Debian/Ubuntu: sudo apt install jq");
  console.error("- Fedora: sudo dnf install jq");
  console.error("- Arch: sudo pacman -S jq");
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value, args) {
  if (args.dryRun) {
    console.log(`[dry-run] would write ${path.relative(ROOT, filePath)}`);
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function mergeConfig(base, local) {
  return {
    ...base,
    ...local,
    shell_helper: {
      ...(base.shell_helper || {}),
      ...(local.shell_helper || {})
    },
    lnk_cli: {
      ...(base.lnk_cli || {}),
      ...(local.lnk_cli || {})
    },
    v8s_fix_cli: {
      ...(base.v8s_fix_cli || {}),
      ...(local.v8s_fix_cli || {})
    },
    local_publish: {
      ...(base.local_publish || {}),
      ...(local.local_publish || {}),
      commit_messages: {
        ...(base.local_publish?.commit_messages || {}),
        ...(local.local_publish?.commit_messages || {})
      }
    },
    registry: {
      ...(base.registry || {}),
      ...(local.registry || {})
    },
    repository: {
      ...(base.repository || {}),
      ...(local.repository || {})
    }
  };
}

async function promptConfig(config, args) {
  if (!process.stdin.isTTY && !args.yes) {
    throw new Error("Interactive prompts are unavailable. Rerun with --yes to accept defaults.");
  }

  if (args.yes) {
    return {
      ...config,
      shell_helper: {
        ...config.shell_helper,
        enabled: true
      },
      repository: {
        ...config.repository,
        path: config.repository?.path || ROOT
      },
      lnk_cli: {
        ...config.lnk_cli
      },
      v8s_fix_cli: {
        ...config.v8s_fix_cli
      },
      local_publish: {
        ...config.local_publish,
        commit_messages: {
          ...(config.local_publish?.commit_messages || {})
        }
      }
    };
  }

  const rl = readline.createInterface({ input, output });
  try {
    const enabled = await confirm(rl, "Install/update the V8S shell helper?", true);
    const next = {
      ...config,
      shell_helper: {
        ...config.shell_helper,
        enabled
      },
      lnk_cli: {
        ...config.lnk_cli
      },
      v8s_fix_cli: {
        ...config.v8s_fix_cli
      },
      local_publish: {
        ...config.local_publish,
        commit_messages: {
          ...(config.local_publish?.commit_messages || {})
        }
      },
      registry: {
        ...config.registry
      },
      repository: {
        ...config.repository
      }
    };

    if (!enabled) return next;

    next.shell_helper.install_path = await question(rl, "Shell helper install path", next.shell_helper.install_path);
    next.lnk_cli.install_path = await question(rl, "lnk CLI install path", next.lnk_cli.install_path);
    next.v8s_fix_cli.install_path = await question(rl, "v8s-fix CLI install path", next.v8s_fix_cli.install_path);
    next.local_publish.commit_messages = {
      ...(next.local_publish.commit_messages || {})
    };
    next.local_publish.commit_messages.mixed = await question(
      rl,
      "Local publish mixed commit message",
      next.local_publish.commit_messages.mixed || next.local_publish.commit_message
    );
    next.local_publish.commit_messages.links = await question(
      rl,
      "Links-only commit message",
      next.local_publish.commit_messages.links
    );
    next.local_publish.commit_messages.policies = await question(
      rl,
      "Policies-only commit message",
      next.local_publish.commit_messages.policies
    );
    next.local_publish.commit_messages.site_config = await question(
      rl,
      "Site-config-only commit message",
      next.local_publish.commit_messages.site_config
    );
    next.local_publish.commit_message = next.local_publish.commit_messages.mixed;
    next.shell_helper.rc_file = await question(rl, "Shell rc file to update", next.shell_helper.rc_file);
    next.registry.local_path = await question(rl, "Local registry path", next.registry.local_path);
    next.repository.path = await question(rl, "Local repository path", next.repository.path || ROOT);

    return next;
  } finally {
    rl.close();
  }
}

async function confirm(rl, label, defaultValue) {
  const suffix = defaultValue ? "Y/n" : "y/N";
  const answer = (await rl.question(`${label} (${suffix}): `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return ["y", "yes", "true", "1"].includes(answer);
}

async function question(rl, label, defaultValue) {
  const answer = await rl.question(`${label} (${defaultValue}): `);
  return answer.trim() || defaultValue;
}

function expandLocalPath(value) {
  const fallbackXdgConfig = path.join(os.homedir(), ".config");
  return String(value || "")
    .replace(/^~(?=$|\/)/, os.homedir())
    .replaceAll("$HOME", os.homedir())
    .replaceAll("${HOME}", os.homedir())
    .replaceAll("$XDG_CONFIG_HOME", process.env.XDG_CONFIG_HOME || fallbackXdgConfig)
    .replaceAll("${XDG_CONFIG_HOME}", process.env.XDG_CONFIG_HOME || fallbackXdgConfig)
    .replaceAll("$ZDOTDIR", process.env.ZDOTDIR || os.homedir())
    .replaceAll("${ZDOTDIR}", process.env.ZDOTDIR || os.homedir());
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function installHelper(config, args) {
  if (config.shell_helper?.enabled !== true) {
    console.log("Shell helper disabled; installing CLI helpers only.");
    installCliHelpers(config, args);
    return;
  }

  const helperTarget = expandLocalPath(config.shell_helper.install_path);
  const lnkTarget = expandLocalPath(config.lnk_cli?.install_path || "$XDG_CONFIG_HOME/bin/lnk");
  const v8sFixTarget = expandLocalPath(config.v8s_fix_cli?.install_path || "$XDG_CONFIG_HOME/bin/v8s-fix");
  const rcFile = expandLocalPath(config.shell_helper.rc_file);
  const registryPath = expandLocalPath(config.registry?.local_path || "~/.v8s.json");
  const repoPath = expandLocalPath(config.repository?.path || ROOT);

  if (args.dryRun) {
    console.log(`[dry-run] would copy scripts/v8s.sh to ${helperTarget}`);
    console.log(`[dry-run] would copy scripts/lnk to ${lnkTarget}`);
    console.log(`[dry-run] would copy scripts/v8s-fix to ${v8sFixTarget}`);
    console.log(`[dry-run] would update ${rcFile}`);
    return;
  }

  fs.mkdirSync(path.dirname(helperTarget), { recursive: true });
  fs.copyFileSync(HELPER_SOURCE_PATH, helperTarget);
  copyExecutable(LNK_SOURCE_PATH, lnkTarget);
  copyExecutable(V8S_FIX_SOURCE_PATH, v8sFixTarget);

  const block = [
    START_MARKER,
    `export V8S_REGISTRY=${shellQuote(registryPath)}`,
    `export V8S_REPO=${shellQuote(repoPath)}`,
    `source ${shellQuote(helperTarget)}`,
    END_MARKER,
    ""
  ].join("\n");

  fs.mkdirSync(path.dirname(rcFile), { recursive: true });
  const current = fs.existsSync(rcFile) ? fs.readFileSync(rcFile, "utf8") : "";
  const re = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}\\n?`, "m");
  const next = re.test(current) ? current.replace(re, block) : `${current.trimEnd()}\n\n${block}`;

  fs.writeFileSync(rcFile, next);
  console.log(`Installed V8S shell helper to ${helperTarget}`);
  console.log(`Installed lnk CLI to ${lnkTarget}`);
  console.log(`Installed v8s-fix CLI to ${v8sFixTarget}`);
  console.log(`Updated ${rcFile}`);
}

function installCliHelpers(config, args) {
  const lnkTarget = expandLocalPath(config.lnk_cli?.install_path || "$XDG_CONFIG_HOME/bin/lnk");
  const v8sFixTarget = expandLocalPath(config.v8s_fix_cli?.install_path || "$XDG_CONFIG_HOME/bin/v8s-fix");

  if (args.dryRun) {
    console.log(`[dry-run] would copy scripts/lnk to ${lnkTarget}`);
    console.log(`[dry-run] would copy scripts/v8s-fix to ${v8sFixTarget}`);
    return;
  }

  copyExecutable(LNK_SOURCE_PATH, lnkTarget);
  copyExecutable(V8S_FIX_SOURCE_PATH, v8sFixTarget);
  console.log(`Installed lnk CLI to ${lnkTarget}`);
  console.log(`Installed v8s-fix CLI to ${v8sFixTarget}`);
}

function copyExecutable(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  fs.chmodSync(targetPath, 0o755);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runBuild(args) {
  if (!args.build) return;
  if (args.dryRun) {
    console.log("[dry-run] would run npm run build");
    return;
  }

  execFileSync("npm", ["run", "build"], {
    cwd: ROOT,
    stdio: "inherit"
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!commandExists("jq")) {
    printJqInstallHelp();
    process.exit(1);
  }

  const defaultConfig = readJson(DEFAULT_CONFIG_PATH);
  const localConfig = readJson(CUSTOM_CONFIG_PATH);
  const config = await promptConfig(mergeConfig(defaultConfig, localConfig), args);

  writeJson(CUSTOM_CONFIG_PATH, config, args);
  installHelper(config, args);
  runBuild(args);
}

main().catch((error) => {
  console.error(`local-install failed: ${error.message}`);
  process.exit(1);
});
