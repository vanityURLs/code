import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../defaults/public/lookup.js", import.meta.url), "utf8");

const calls = [];
const beacons = [];
const listeners = {};
const elements = {
  lookupForm: element(),
  lookupKey: element(),
  lookupResult: element()
};

const context = {
  Blob,
  URLSearchParams,
  document: {
    documentElement: { lang: "en" },
    addEventListener(name, listener) {
      listeners[name] = listener;
    },
    getElementById(id) {
      return elements[id] || null;
    }
  },
  fetch: async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      json: async () => ({
        result: "resolved",
        state: "ephemeral",
        target: "https://example.com/poolit"
      })
    };
  },
  navigator: {
    sendBeacon(url, body) {
      beacons.push({ url, body });
      return true;
    }
  },
  window: {
    location: { search: "?slug=poolit" }
  }
};

vm.runInNewContext(source, context);
await listeners.DOMContentLoaded();
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(elements.lookupKey.value, "poolit");
assert.equal(calls.length, 1);
assert.deepEqual(calls[0], {
  url: "/lookup/resolve",
  body: { slug: "poolit" }
});
assert(elements.lookupResult.innerHTML.includes("https://example.com/poolit"));
assert.equal(beacons.length, 1);

function element() {
  const eventListeners = {};

  return {
    classList: {
      states: new Set(),
      add(name) {
        this.states.add(name);
      },
      toggle(name, enabled) {
        if (enabled) this.states.add(name);
        else this.states.delete(name);
      }
    },
    value: "",
    innerHTML: "",
    addEventListener(name, listener) {
      eventListeners[name] = listener;
    }
  };
}
