import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import path from "node:path";

const source = await readFile(path.join(process.cwd(), "src/theme-init.js"), "utf8");

function runThemeInit({ stored = "", storageThrows = false, prefersDark = false, mediaThrows = false } = {}) {
  const sandbox = {
    document: { documentElement: { dataset: {} } },
    localStorage: {
      getItem(key) {
        if (storageThrows) throw new Error("storage disabled");
        return key === "solus-theme" ? stored : "";
      }
    },
    window: {
      matchMedia(query) {
        if (mediaThrows) throw new Error("matchMedia disabled");
        assert.equal(query, "(prefers-color-scheme: dark)");
        return { matches: prefersDark };
      }
    }
  };

  vm.runInNewContext(source, sandbox);
  return sandbox.document.documentElement.dataset.theme;
}

assert.equal(runThemeInit({ stored: "dark", prefersDark: false }), "dark");
assert.equal(runThemeInit({ stored: "light", prefersDark: true }), "light");
assert.equal(runThemeInit({ stored: "invalid", prefersDark: true }), "dark");
assert.equal(runThemeInit({ storageThrows: true, prefersDark: true }), "dark");
assert.equal(runThemeInit({ storageThrows: true, mediaThrows: true }), "light");

console.log("Theme init tests passed.");
