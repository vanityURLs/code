#!/usr/bin/env node

import fs from "node:fs";

const HEADER = "# slug|target|state|title|description|tags|owner|expires_at|notes";
const PERMANENT_STATUSES = new Set(["301", "308"]);
const EPHEMERAL_STATUSES = new Set(["302", "303", "307"]);
const VALID_DEFAULT_STATES = new Set(["permanent", "ephemeral"]);

function usage() {
  console.log(`Usage:
  node scripts/convert-lnk.mjs INPUT [OUTPUT] [options]

Converts legacy .lnk whitespace rows to v8s-links.txt pipe-delimited rows.

Legacy row format:
  /slug https://example.com [status] ["description"]
  /docs/* https://docs.example.com/:splat 302 "Docs passthrough"

Options:
  --owner OWNER              Owner label for migrated rows (default: bhd)
  --tags TAGS                Comma-separated tags for migrated rows (default: migrated)
  --default-state STATE      State for rows without a status: permanent | ephemeral (default: ephemeral)
  --append                   Append converted rows to OUTPUT instead of replacing it
  --force                    Replace OUTPUT if it exists
  --help                     Show this help

Examples:
  node scripts/convert-lnk.mjs .lnk custom/v8s-links.txt --owner bhd --force
  node scripts/convert-lnk.mjs old.lnk --owner team > custom/v8s-links.txt
`);
}

function parseArgs(argv) {
  const options = {
    owner: "bhd",
    tags: "migrated",
    defaultState: "ephemeral",
    append: false,
    force: false
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--owner":
        options.owner = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--tags":
        options.tags = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--default-state":
        options.defaultState = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--append":
        options.append = true;
        break;
      case "--force":
        options.force = true;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        positionals.push(arg);
        break;
    }
  }

  return {
    inputPath: positionals[0],
    outputPath: positionals[1],
    options
  };
}

function requireValue(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value`);
  }
  return value;
}

function stripComment(line) {
  let output = "";
  let quote = "";
  let escaped = false;

  for (const character of line) {
    if (escaped) {
      output += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      output += character;
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) quote = "";
      output += character;
      continue;
    }

    if (character === "\"" || character === "'") {
      quote = character;
      output += character;
      continue;
    }

    if (character === "#") break;

    output += character;
  }

  return output.trim();
}

function tokenize(line, lineNumber) {
  const tokens = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const character of line) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = "";
      } else {
        current += character;
      }
      continue;
    }

    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (quote) {
    throw new Error(`Line ${lineNumber}: unterminated quoted string`);
  }

  if (escaped) current += "\\";
  if (current) tokens.push(current);

  return tokens;
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");
}

function normalizeTarget(value) {
  const target = String(value || "").trim();
  if (/^https?:\/\//i.test(target)) return target;
  return `https://${target}`;
}

function stateFromStatus(status, defaultState) {
  if (!status) return defaultState;
  if (PERMANENT_STATUSES.has(status)) return "permanent";
  if (EPHEMERAL_STATUSES.has(status)) return "ephemeral";
  throw new Error(`unsupported redirect status '${status}'`);
}

function assertNoPipes(values, lineNumber) {
  for (const value of values) {
    if (String(value).includes("|")) {
      throw new Error(`Line ${lineNumber}: pipe character is reserved by v8s-links.txt`);
    }
  }
}

function parseLegacyLine(rawLine, lineNumber, options) {
  const line = stripComment(rawLine);
  if (!line) return null;

  const tokens = tokenize(line, lineNumber);
  if (tokens.length < 2) {
    throw new Error(`Line ${lineNumber}: expected source and target`);
  }

  const [rawSlug, rawTarget, maybeStatus, ...descriptionParts] = tokens;
  const status = /^\d{3}$/.test(maybeStatus || "") ? maybeStatus : "";
  const description = status
    ? descriptionParts.join(" ").trim()
    : [maybeStatus, ...descriptionParts].filter(Boolean).join(" ").trim();
  const slug = normalizeSlug(rawSlug);
  const target = normalizeTarget(rawTarget);
  const state = stateFromStatus(status, options.defaultState);
  const title = description || slug.replace(/\/\*$/, "");

  if (!slug || slug === "*") {
    throw new Error(`Line ${lineNumber}: source path is required`);
  }

  if (rawSlug.includes("?") || rawSlug.includes("#")) {
    throw new Error(`Line ${lineNumber}: source path must not include query strings or fragments`);
  }

  if (rawSlug.endsWith("/") && !rawSlug.endsWith("/*")) {
    throw new Error(`Line ${lineNumber}: source path must not end with /`);
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(target);
  } catch {
    throw new Error(`Line ${lineNumber}: invalid target URL '${rawTarget}'`);
  }

  if (parsedTarget.protocol !== "http:" && parsedTarget.protocol !== "https:") {
    throw new Error(`Line ${lineNumber}: target protocol '${parsedTarget.protocol}' is not supported`);
  }

  if (slug.endsWith("/*") && !target.includes(":splat")) {
    throw new Error(`Line ${lineNumber}: splat source must use :splat in the target`);
  }

  assertNoPipes([slug, rawTarget, state, title, description, options.tags, options.owner], lineNumber);

  return [
    slug,
    rawTarget.trim(),
    state,
    title,
    description,
    options.tags,
    options.owner,
    "",
    ""
  ].join("|");
}

function convert(inputPath, options) {
  const raw = fs.readFileSync(inputPath, "utf8");
  const errors = [];
  const rows = [];
  const seen = new Map();

  for (const [index, rawLine] of raw.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;

    try {
      const row = parseLegacyLine(rawLine, lineNumber, options);
      if (!row) continue;

      const slug = row.split("|")[0];
      if (seen.has(slug)) {
        throw new Error(`Line ${lineNumber}: duplicate source '${slug}' also appears on line ${seen.get(slug)}`);
      }
      seen.set(slug, lineNumber);
      rows.push(row);
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (errors.length) {
    for (const error of errors) console.error(`::error::${error}`);
    throw new Error(`Conversion failed: ${errors.length} error(s)`);
  }

  return `${HEADER}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

function writeOutput(outputPath, content, options) {
  if (!outputPath) {
    process.stdout.write(content);
    return;
  }

  if (options.append) {
    const rows = content.split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
    const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
    const existingSlugs = new Set(existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split("|")[0]?.trim())
      .filter(Boolean));
    const duplicate = rows
      .map((line) => line.split("|")[0]?.trim())
      .find((slug) => existingSlugs.has(slug));

    if (duplicate) {
      throw new Error(`Output already contains slug '${duplicate}'. Remove the existing row before using --append.`);
    }

    const prefix = existing.trim() ? "\n" : `${HEADER}\n`;
    fs.appendFileSync(outputPath, `${prefix}${rows.join("\n")}\n`, "utf8");
    return;
  }

  if (fs.existsSync(outputPath) && !options.force) {
    throw new Error(`Output exists: ${outputPath}. Use --force to replace it or --append to append rows.`);
  }

  fs.writeFileSync(outputPath, content, "utf8");
}

function main() {
  try {
    const { inputPath, outputPath, options } = parseArgs(process.argv.slice(2));

    if (options.help) {
      usage();
      return;
    }

    if (!inputPath) {
      usage();
      process.exitCode = 1;
      return;
    }

    if (!VALID_DEFAULT_STATES.has(options.defaultState)) {
      throw new Error("--default-state must be permanent or ephemeral");
    }

    const content = convert(inputPath, options);
    writeOutput(outputPath, content, options);

    if (outputPath) {
      const rows = content.split(/\r?\n/).filter((line) => line && !line.startsWith("#")).length;
      console.log(`Converted ${rows} link(s) from ${inputPath} to ${outputPath}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
