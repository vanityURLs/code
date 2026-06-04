import { spawnSync } from "node:child_process";

export function runCommand(command, args = [], options = {}) {
  const normalized = normalizeCommand(command, args);
  const capture = options.capture === true;

  return spawnSync(normalized.command, normalized.args, {
    cwd: options.cwd || process.cwd(),
    encoding: capture ? "utf8" : undefined,
    env: options.env || process.env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: normalized.shell
  });
}

function normalizeCommand(command, args) {
  if (command !== "npm") {
    return { command, args, shell: false };
  }

  const npmExecPath = process.env.npm_execpath || "";
  if (npmExecPath) {
    return {
      command: process.execPath,
      args: [npmExecPath, ...args],
      shell: false
    };
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args,
    shell: process.platform === "win32"
  };
}

export function commandLine(command, args = []) {
  return [command, ...args].map(String).join(" ");
}
