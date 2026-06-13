import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const failures = [];

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function htmlFiles(dir = dist) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await htmlFiles(target)));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(target);
    }
  }
  return files;
}

function displayPath(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function localPathFromUrl(value) {
  if (!value || value.startsWith("#") || value.startsWith("mailto:")) return "";
  if (value.startsWith("/api/")) return "";

  try {
    const url = new URL(value, "https://blog.solus.games");
    if (url.origin !== "https://blog.solus.games") return "";
    return decodeURIComponent(url.pathname);
  } catch {
    return "";
  }
}

async function localTargetExists(pathname) {
  if (!pathname) return true;
  const clean = pathname.replace(/^\/+/, "");
  if (!clean) return exists(path.join(dist, "index.html"));

  const direct = path.join(dist, clean);
  if (await exists(direct)) return true;

  return exists(path.join(direct, "index.html"));
}

async function checkLocalReferences(file, html) {
  for (const match of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const pathname = localPathFromUrl(match[1]);
    if (!pathname) continue;
    if (!(await localTargetExists(pathname))) {
      failures.push(`${displayPath(file)} references missing local target: ${match[1]}`);
    }
  }
}

function checkHeadingIds(file, html) {
  const ids = [...html.matchAll(/<h[1-4][^>]*\sid="([^"]+)"/g)].map((match) => match[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) failures.push(`${displayPath(file)} has duplicate heading id: ${id}`);
    seen.add(id);
  }
}

async function main() {
  if (!(await exists(dist))) {
    throw new Error("dist/ does not exist. Run npm run build first.");
  }

  const requiredFiles = ["404.html", "_headers", "rss.xml", "sitemap.xml", "search-index.json"];
  for (const file of requiredFiles) {
    if (!(await exists(path.join(dist, file)))) failures.push(`Missing dist/${file}`);
  }

  const headers = await readFile(path.join(dist, "_headers"), "utf8").catch(() => "");
  for (const requiredHeader of ["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options: DENY"]) {
    if (!headers.includes(requiredHeader)) failures.push(`dist/_headers is missing ${requiredHeader}`);
  }

  const searchIndex = await readFile(path.join(dist, "search-index.json"), "utf8")
    .then(JSON.parse)
    .catch(() => null);
  if (!Array.isArray(searchIndex)) failures.push("dist/search-index.json must be a JSON array.");

  const rss = await readFile(path.join(dist, "rss.xml"), "utf8").catch(() => "");
  if (!rss.includes('xmlns:content="http://purl.org/rss/1.0/modules/content/"')) {
    failures.push("dist/rss.xml must declare the content namespace.");
  }
  if (!rss.includes("<content:encoded><![CDATA[")) {
    failures.push("dist/rss.xml must include full post content.");
  }
  if (/\s(?:href|src)="\//.test(rss)) {
    failures.push("dist/rss.xml must not contain relative local href/src URLs.");
  }

  for (const file of await htmlFiles()) {
    const html = await readFile(file, "utf8");
    const relative = displayPath(file);

    if (/javascript:|data:text\/html/i.test(html)) failures.push(`${relative} contains an unsafe URL scheme.`);
    if (/\son(?:click|error|load|mouseover)=/i.test(html)) failures.push(`${relative} contains an inline event handler.`);
    if (html.includes("@@INLINE_HTML_")) failures.push(`${relative} contains an unreplaced inline token.`);
    if (html.includes("/assets/hero-game-tech.png")) failures.push(`${relative} references the retired hero PNG.`);
    if (relative.startsWith("dist/posts/") && html.includes("/src/views.js")) {
      failures.push(`${relative} loads views.js even though article.js handles article views.`);
    }
    if (relative === "dist/404.html" && !html.includes('name="robots" content="noindex,follow"')) {
      failures.push("dist/404.html must be marked noindex,follow.");
    }

    checkHeadingIds(file, html);
    await checkLocalReferences(file, html);
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`Failed: ${failure}`);
    process.exit(1);
  }

  console.log(`Output checks passed for ${(await htmlFiles()).length} HTML files.`);
}

await main();
