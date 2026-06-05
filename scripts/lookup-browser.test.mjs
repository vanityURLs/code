#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../defaults/public/lookup.js", import.meta.url), "utf8");

async function run(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function createClassList() {
  const values = new Set();
  return {
    add(value) {
      values.add(value);
    },
    toggle(value, enabled) {
      if (enabled) values.add(value);
      else values.delete(value);
    },
    has(value) {
      return values.has(value);
    }
  };
}

function createElement(tagName = "div") {
  const listeners = new Map();
  return {
    tagName: tagName.toUpperCase(),
    className: "",
    classList: createClassList(),
    dataset: {},
    innerHTML: "",
    value: "",
    attributes: new Map(),
    listeners,
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    insertAdjacentElement(_position, element) {
      this.insertedElement = element;
    }
  };
}

async function createLookupContext(options = {}) {
  const form = createElement("form");
  const input = createElement("input");
  const result = createElement("div");
  const scripts = [];
  const beacons = [];
  const fetchCalls = [];
  let domReady;
  let renderedTurnstile;

  const context = {
    Blob,
    Error,
    Promise,
    String,
    URLSearchParams,
    console,
    navigator: {
      sendBeacon(url, blob) {
        beacons.push({ url, blob });
        return true;
      }
    },
    window: {
      turnstile: {
        render(container, config) {
          renderedTurnstile = { container, config };
          config.callback?.(options.initialToken || "token-1");
          return "widget-1";
        },
        reset(id) {
          renderedTurnstile.resetId = id;
        }
      }
    },
    document: {
      documentElement: { lang: options.language || "en-CA" },
      head: {
        append(element) {
          scripts.push(element);
          element.listeners.get("load")?.();
        }
      },
      addEventListener(name, callback) {
        if (name === "DOMContentLoaded") domReady = callback;
      },
      createElement,
      querySelector() {
        return null;
      },
      getElementById(id) {
        return { lookupForm: form, lookupKey: input, lookupResult: result }[id] || null;
      }
    },
    fetch: async (url, init = {}) => {
      fetchCalls.push({ url, init });
      if (url === "/lookup/turnstile-config") {
        return Response.json({
          configured: options.configured !== false,
          siteKey: options.siteKey || "site-key"
        });
      }

      if (url === "/lookup/resolve") {
        const body = JSON.parse(init.body || "{}");
        return Response.json({
          result: "resolved",
          slug: body.slug,
          state: "permanent",
          target: options.target || "https://example.com/<script>alert(1)</script>"
        });
      }

      return new Response(null, { status: 204 });
    }
  };
  context.window.window = context.window;

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "lookup.js" });
  domReady?.();
  await waitFor(() => renderedTurnstile || options.configured === false);

  return {
    beacons,
    fetchCalls,
    form,
    input,
    result,
    scripts,
    turnstile: () => renderedTurnstile
  };
}

async function waitFor(predicate) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("Timed out waiting for lookup browser setup");
}

async function submit(context, value) {
  context.input.value = value;
  await context.form.listeners.get("submit")?.({ preventDefault() {} });
}

await run("lookup browser submits exact slug with Turnstile action and resets token", async () => {
  const context = await createLookupContext();
  await submit(context, " /d/gv ");

  const turnstile = context.turnstile();
  assert.equal(turnstile.config.sitekey, "site-key");
  assert.equal(turnstile.config.action, "lookup");
  assert.equal(turnstile.resetId, "widget-1");

  const resolveCall = context.fetchCalls.find((call) => call.url === "/lookup/resolve");
  assert(resolveCall, "lookup resolve called");
  assert.deepEqual(JSON.parse(resolveCall.init.body), {
    slug: "d/gv",
    turnstileToken: "token-1"
  });
  assert(!context.result.innerHTML.includes("<script>alert(1)</script>"), "target HTML escaped");
  assert(context.result.innerHTML.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "escaped target rendered");
  assert.equal(context.beacons.length, 1, "lookup analytics beacon sent");
});

await run("lookup browser blocks resolve after expired Turnstile token", async () => {
  const context = await createLookupContext();
  context.turnstile().config["expired-callback"]();

  await submit(context, "d/gv");

  assert(!context.fetchCalls.some((call) => call.url === "/lookup/resolve"), "lookup resolve not called");
  assert(context.result.innerHTML.includes("Complete the verification"), "verification message rendered");
});

await run("lookup browser blocks resolve after Turnstile widget error", async () => {
  const context = await createLookupContext();
  context.turnstile().config["error-callback"]();

  await submit(context, "d/gv");

  assert(!context.fetchCalls.some((call) => call.url === "/lookup/resolve"), "lookup resolve not called");
  assert(context.result.innerHTML.includes("Complete the verification"), "verification message rendered");
});

await run("lookup browser fails closed when Turnstile config is missing", async () => {
  const context = await createLookupContext({ configured: false });

  await submit(context, "d/gv");

  assert(!context.fetchCalls.some((call) => call.url === "/lookup/resolve"), "lookup resolve not called");
  assert(context.result.innerHTML.includes("Lookup verification is not configured"), "config message rendered");
});
