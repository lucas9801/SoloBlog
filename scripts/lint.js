import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "content/site.json",
  "content/about.md",
  "src/styles.css",
  "src/search.js",
  "scripts/build.js",
  "scripts/new-post.js",
  "public/_headers",
  "public/_redirects",
  "wrangler.toml",
  ".node-version",
  "docs/cloudflare-pages.md",
  "assets/hero-game-tech.png"
];

for (const file of requiredFiles) {
  await access(path.join(root, file)).catch(() => {
    throw new Error(`Missing required file: ${file}`);
  });
}

const [site, css, buildScript, heroStats] = await Promise.all([
  readFile(path.join(root, "content/site.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "src/styles.css"), "utf8"),
  readFile(path.join(root, "scripts/build.js"), "utf8"),
  stat(path.join(root, "assets/hero-game-tech.png"))
]);

const postFiles = (await readdir(path.join(root, "content/posts"))).filter((file) =>
  file.endsWith(".md")
);

if (postFiles.length === 0) {
  throw new Error("content/posts must contain at least one markdown post.");
}

const postChecks = await Promise.all(
  postFiles.map(async (file) => {
    const raw = await readFile(path.join(root, "content/posts", file), "utf8");
    return {
      file,
      hasTitle: /^title:\s+.+$/m.test(raw),
      hasDate: /^date:\s+\d{4}-\d{2}-\d{2}$/m.test(raw),
      hasStatus: /^status:\s+(published|draft)$/m.test(raw),
      hasBody: raw.split("---").slice(2).join("---").trim().length > 20
    };
  })
);

const failures = [];

if (!site.title || !site.navigation?.length) failures.push("site config needs title and navigation.");
if (!css.includes(".site-header")) failures.push("CSS must define real blog header.");
if (!css.includes(".article-content")) failures.push("CSS must define article content styles.");
if (!css.includes("@media (max-width: 720px)")) failures.push("CSS must include mobile breakpoint.");
if (!buildScript.includes("search-index.json")) failures.push("Build must generate search index.");
if (!buildScript.includes("rss.xml")) failures.push("Build must generate RSS.");
if (!buildScript.includes("sitemap.xml")) failures.push("Build must generate sitemap.");
if (!buildScript.includes("CF_PAGES_URL")) failures.push("Build must support Cloudflare Pages URL.");
if (!buildScript.includes("robots.txt")) failures.push("Build must generate robots.txt.");
if (heroStats.size < 100000) failures.push("Hero asset appears too small or missing.");

for (const check of postChecks) {
  if (!check.hasTitle) failures.push(`${check.file} is missing title.`);
  if (!check.hasDate) failures.push(`${check.file} is missing YYYY-MM-DD date.`);
  if (!check.hasStatus) failures.push(`${check.file} is missing status.`);
  if (!check.hasBody) failures.push(`${check.file} body is too short.`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Failed: ${failure}`);
  }
  process.exit(1);
}

console.log(`Lint checks passed for ${postFiles.length} posts.`);
