import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readManifest(filePath) {
  try {
    const data = JSON.parse(await readFile(filePath, "utf8"));
    if (data && typeof data === "object" && data.entries) return data;
    if (Array.isArray(data)) {
      return { entries: Object.fromEntries(data.map((item) => [item.slug, item])) };
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { entries: {} };
}

export async function writeManifest(filePath, manifest) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(`${filePath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await import("node:fs/promises").then(({ rename }) => rename(`${filePath}.tmp`, filePath));
}

export function manifestEntry(manifest, slug) {
  return manifest.entries?.[slug] || null;
}

export function setManifestEntry(manifest, entry) {
  manifest.entries ||= {};
  manifest.entries[entry.slug] = entry;
}
