#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");

const server = http.createServer((request, response) => {
  if (request.url === "/share") {
    response.writeHead(302, { location: `${finalBaseUrl}/final` });
    response.end();
    return;
  }

  if (request.url === "/final") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }

  if (request.url === "/missing") {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("missing");
    return;
  }

  response.writeHead(500, { "content-type": "text/plain" });
  response.end("unexpected fixture path");
});

await new Promise((resolve) => server.listen(0, resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;
const finalBaseUrl = `http://localhost:${port}`;

try {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "v8s-check-targets-"));
  fs.mkdirSync(path.join(fixture, "build"), { recursive: true });
  fs.mkdirSync(path.join(fixture, "custom"), { recursive: true });
  fs.mkdirSync(path.join(fixture, "defaults"), { recursive: true });

  fs.writeFileSync(
    path.join(fixture, "defaults", "v8s-site-config.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      targets: {
        normalizers: {
          amazon: {
            preserve_affiliate_tag: false,
            allowed_tags: []
          }
        }
      }
    })}\n`
  );

  fs.writeFileSync(
    path.join(fixture, "custom", "v8s-site-config.json"),
    `${JSON.stringify({
      targets: {
        normalizers: {
          amazon: {
            preserve_affiliate_tag: true,
            allowed_tags: ["felleg-20"]
          }
        }
      }
    })}\n`
  );

  fs.writeFileSync(
    path.join(fixture, "defaults", "v8s-policies.json"),
    `${JSON.stringify({
      defaults: {
        allowed_protocols: ["http:", "https:"],
        block_localhost: false,
        block_private_networks: false
      },
      review_domains: [
        {
          domain: "127.0.0.1",
          category: "platform-share"
        }
      ]
    })}\n`
  );

  fs.writeFileSync(
    path.join(fixture, "build", "v8s.json"),
    `${JSON.stringify({
      tree: {
        children: {
          old: {
            link: {
              slug: "old",
              target: `${baseUrl}/share`,
              state: "permanent",
              match: "exact"
            }
          },
          missing: {
            link: {
              slug: "missing",
              target: `${baseUrl}/missing`,
              state: "permanent",
              match: "exact"
            }
          },
          dynamic: {
            splat_link: {
              slug: "dynamic",
              target: `${baseUrl}/share/:splat`,
              state: "permanent",
              match: "splat"
            }
          }
        }
      }
    })}\n`
  );

  const linksPath = path.join(fixture, "custom", "v8s-links.txt");
  const originalLinks = [
    `old|${baseUrl}/share|permanent|Old|||||`,
    `missing|${baseUrl}/missing|permanent|Missing|||||`,
    `dynamic/*|${baseUrl}/share/:splat|permanent|Dynamic|||||`
  ].join("\n");
  fs.writeFileSync(linksPath, `${originalLinks}\n`);

  const run = () =>
    runProcess(
      process.execPath,
      [
        path.join(root, "scripts", "check-targets.mjs"),
        "build/v8s.json",
        "--fix",
        "--fix-broken-404",
        "--links-file=custom/v8s-links.txt"
      ],
      {
        cwd: fixture,
        env: {
          ...process.env,
          V8S_TARGET_CONCURRENCY: "1",
          V8S_TARGET_TIMEOUT_MS: "2000"
        }
      }
    );

  const first = await run();
  assert.equal(first.status, 1, first.stderr);
  assert.match(first.stdout, /Fixes applied: 1 long URL migration\(s\), 1 broken 404 disable\(s\)\./);

  const backup = fs.readFileSync(path.join(fixture, "custom", "v8s-links.bak"), "utf8");
  assert.equal(backup, `${originalLinks}\n`);

  const fixed = fs.readFileSync(linksPath, "utf8");
  assert.match(fixed, new RegExp(`^# old\\|${escapeRegExp(baseUrl)}/share\\|permanent\\|Old`, "m"));
  assert.match(fixed, new RegExp(`^old\\|${escapeRegExp(finalBaseUrl)}/final\\|permanent\\|Old\\|\\|migrated\\|`, "m"));
  assert.match(fixed, new RegExp(`^# missing\\|${escapeRegExp(baseUrl)}/missing\\|permanent\\|Missing`, "m"));
  assert.match(
    fixed,
    new RegExp(`^missing\\|${escapeRegExp(baseUrl)}/missing\\|disabled\\|Missing\\|\\|broken-404,review\\|`, "m")
  );
  assert.match(fixed, new RegExp(`^dynamic/\\*\\|${escapeRegExp(baseUrl)}/share/:splat\\|permanent\\|Dynamic`, "m"));

  const second = await run();
  assert.equal(second.status, 1, second.stderr);
  assert.match(second.stdout, /Fixes applied: 0 long URL migration\(s\), 0 broken 404 disable\(s\)\./);
  assert.equal(fs.readFileSync(linksPath, "utf8"), fixed);

  console.log("check-targets fixer tests ok");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runProcess(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
