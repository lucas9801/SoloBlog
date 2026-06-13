import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "content/site.json",
  "content/about.md",
  "src/styles.css",
  "src/article.js",
  "src/search.js",
  "src/views.js",
  "scripts/build.js",
  "scripts/new-post.js",
  "public/_headers",
  "public/_redirects",
  "public/favicon.svg",
  "public/site.webmanifest",
  "wrangler.toml",
  ".node-version",
  "docs/cloudflare-pages.md",
  "assets/og/solus-og.svg",
  "assets/og/solus-og.png"
];

for (const file of requiredFiles) {
  await access(path.join(root, file)).catch(() => {
    throw new Error(`Missing required file: ${file}`);
  });
}

const [site, manifest, css, articleScript, searchScript, viewsFunction, buildScript, headers, packageConfig, wranglerConfig, socialImageStats] = await Promise.all([
  readFile(path.join(root, "content/site.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "public/site.webmanifest"), "utf8").then(JSON.parse),
  readFile(path.join(root, "src/styles.css"), "utf8"),
  readFile(path.join(root, "src/article.js"), "utf8"),
  readFile(path.join(root, "src/search.js"), "utf8"),
  readFile(path.join(root, "functions/api/views.js"), "utf8"),
  readFile(path.join(root, "scripts/build.js"), "utf8"),
  readFile(path.join(root, "public/_headers"), "utf8"),
  readFile(path.join(root, "package.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "wrangler.toml"), "utf8"),
  stat(path.join(root, "assets/og/solus-og.png"))
]);

const postFiles = (await readdir(path.join(root, "content/posts"))).filter((file) =>
  file.endsWith(".md")
);

const failures = [];
const warnings = [];

function parseFrontMatterValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return value.replace(/^["']|["']$/g, "");
}

function parseFrontMatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: source, hasFrontMatter: false };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    data[key] = parseFrontMatterValue(raw);
  }

  return { data, body: match[2], hasFrontMatter: true };
}

function slugify(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(Date.parse(value));
}

async function existsLocalPath(urlPath) {
  if (!urlPath.startsWith("/") || /^\/(posts|archive|categories|tags|search|about)\//.test(urlPath)) return true;
  const pathname = urlPath.split(/[?#]/)[0].replace(/^\/+/, "");
  await access(path.join(root, pathname));
  return true;
}

function markdownAssetPaths(markdown) {
  const paths = [];
  for (const match of markdown.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)) paths.push(match[1]);
  return paths.filter((item) => item.startsWith("/"));
}

if (postFiles.length === 0) {
  failures.push("content/posts must contain at least one markdown post.");
}

const posts = await Promise.all(
  postFiles.map(async (file) => {
    const raw = await readFile(path.join(root, "content/posts", file), "utf8");
    const parsed = parseFrontMatter(raw);
    return { file, raw, ...parsed };
  })
);

if (!site.title || !site.navigation?.length) failures.push("site config needs title and navigation.");
if (!site.baseUrl || !/^https:\/\/.+\/$/.test(site.baseUrl)) {
  failures.push("site baseUrl must be an https URL ending with /.");
}
if (!css.includes(".site-header")) failures.push("CSS must define real blog header.");
if (!css.includes(".article-content")) failures.push("CSS must define article content styles.");
if (!css.includes("@media (max-width: 720px)")) failures.push("CSS must include mobile breakpoint.");
if (!buildScript.includes("search-index.json")) failures.push("Build must generate search index.");
if (!buildScript.includes("rss.xml")) failures.push("Build must generate RSS.");
if (!buildScript.includes("sitemap.xml")) failures.push("Build must generate sitemap.");
if (site.baseUrl !== "https://blog.solus.games/") failures.push("site baseUrl must use the production domain.");
if (!site.socialImage) failures.push("site config must define a default socialImage.");
if (!site.heroCover) failures.push("site config must define a heroCover.");
if (site.heroCover) {
  await existsLocalPath(site.heroCover).catch(() => {
    failures.push(`site heroCover does not exist: ${site.heroCover}`);
  });
}
if (site.socialImage && !/^\/assets\/og\/.+\.(svg|png|jpe?g|webp)$/i.test(site.socialImage)) {
  failures.push("site socialImage should point to a dedicated Open Graph asset under /assets/og/.");
}
if (site.socialImage) {
  await existsLocalPath(site.socialImage).catch(() => {
    failures.push(`site socialImage does not exist: ${site.socialImage}`);
  });
}
if (site.socialImage !== "/assets/og/solus-og.png") failures.push("site socialImage must use the generated PNG social card.");
if (socialImageStats.size < 50000 || socialImageStats.size > 400000) {
  failures.push("Open Graph PNG should be a complete but reasonably small social card.");
}
if (css.includes("/assets/hero-game-tech.png") || searchScript.includes("/assets/hero-game-tech.png")) {
  failures.push("Runtime fallbacks should not reference the retired large hero PNG.");
}
if (!buildScript.includes("process.env.SITE_URL")) failures.push("Build must support explicit SITE_URL override.");
if (!buildScript.includes("robots.txt")) failures.push("Build must generate robots.txt.");
if (!buildScript.includes("theme-color")) failures.push("Page head must define browser theme colors.");
if (!buildScript.includes('name="robots"')) failures.push("Page head must define robots indexing policy.");
if (!buildScript.includes('name="color-scheme"')) failures.push("Page head must declare supported color schemes.");
if (!buildScript.includes("og:image:width") || !buildScript.includes("og:image:height")) {
  failures.push("Page head must expose Open Graph image dimensions.");
}
if (!buildScript.includes("twitter:image:alt")) failures.push("Page head must expose social image alt text.");
if (!buildScript.includes("article:published_time") || !buildScript.includes("article:tag")) {
  failures.push("Article pages must expose article-specific Open Graph metadata.");
}
if (!buildScript.includes("BreadcrumbList")) failures.push("Article pages must expose breadcrumb structured data.");
if (!buildScript.includes("paginationHead") || !buildScript.includes('rel="prev"') || !buildScript.includes('rel="next"')) {
  failures.push("Paginated archive pages must expose prev/next head links.");
}
if (!buildScript.includes("uniqueHeadingId") || !buildScript.includes("headingIds")) {
  failures.push("Markdown heading IDs must be stable and unique within each post.");
}
if (!buildScript.includes("/favicon.svg")) failures.push("Page head must link favicon.svg.");
if (!buildScript.includes("/site.webmanifest")) failures.push("Page head must link site.webmanifest.");
if (!buildScript.includes("socialImageForPost")) failures.push("Article pages must choose social images independently from visual covers.");
if (!buildScript.includes("data-giscus-comments")) failures.push("Giscus comments must render a lazy-load container.");
if (!buildScript.includes("includeViewsScript") || !buildScript.includes("viewsScript: false")) {
  failures.push("Views script must load only on pages that need it, with article pages handled by article.js.");
}
if (!articleScript.includes("IntersectionObserver") || !articleScript.includes("https://giscus.app/client.js")) {
  failures.push("Article script must lazy load Giscus comments.");
}
if (!articleScript.includes("readingTarget") || !articleScript.includes(".article-content")) {
  failures.push("Article reading progress must be based on article content, not the whole document.");
}
if (!searchScript.includes("searchFacets") || !searchScript.includes("data-facet-type")) {
  failures.push("Search page must support category and tag facets.");
}
if (!searchScript.includes("data-search-clear") || !searchScript.includes("Escape")) {
  failures.push("Search page must provide clear/reset controls.");
}
if (!viewsFunction.includes("isSameOriginRequest") || !viewsFunction.includes("isJsonRequest")) {
  failures.push("Views API must reject cross-origin and non-JSON write requests.");
}
if (viewsFunction.includes("body.slug ||")) {
  failures.push("Views API POST must not accept slug from query parameters.");
}
if (!viewsFunction.includes('"X-Content-Type-Options": "nosniff"')) {
  failures.push("Views API JSON responses must set X-Content-Type-Options.");
}
for (const requiredHeader of [
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "X-Frame-Options: DENY",
  "frame-src https://giscus.app",
  "frame-ancestors 'none'"
]) {
  if (!headers.includes(requiredHeader)) failures.push(`Cloudflare headers must include ${requiredHeader}.`);
}
if (!headers.includes("/favicon.svg")) failures.push("Cloudflare headers must cache favicon.svg.");
if (!headers.includes("/site.webmanifest")) failures.push("Cloudflare headers must cache site.webmanifest.");
if (manifest.name !== "SOLUS Dev Notes") failures.push("site.webmanifest name must match the site title.");
if (manifest.short_name !== "SOLUS") failures.push("site.webmanifest short_name must be SOLUS.");
if (manifest.start_url !== "/" || manifest.scope !== "/") failures.push("site.webmanifest must start at the site root.");
if (manifest.display !== "standalone") failures.push("site.webmanifest display must be standalone.");
if (!Array.isArray(manifest.icons) || !manifest.icons.some((icon) => icon.src === "/favicon.svg")) {
  failures.push("site.webmanifest must include /favicon.svg as an icon.");
}
if (packageConfig.name !== "solus-blog") failures.push("package name should match the SOLUS blog project.");
if (!packageConfig.scripts?.["deploy:cloudflare"]?.includes("--project-name soloblog-4w3")) {
  failures.push("deploy:cloudflare must target the current Cloudflare Pages project.");
}
if (!/^name\s*=\s*"soloblog-4w3"/m.test(wranglerConfig)) {
  failures.push("wrangler.toml must target the current Cloudflare Pages project.");
}
if (site.comments?.enabled) {
  for (const key of ["provider", "repo", "repoId", "category", "categoryId"]) {
    if (!site.comments[key]) failures.push(`comments.${key} is required when comments are enabled.`);
  }
}
if (site.views?.enabled !== false) {
  await access(path.join(root, "functions/api/views.js")).catch(() => {
    failures.push("views are enabled, but functions/api/views.js is missing.");
  });
  await access(path.join(root, "migrations/0001_post_views.sql")).catch(() => {
    failures.push("views are enabled, but migrations/0001_post_views.sql is missing.");
  });
}
for (const [category, cover] of Object.entries(site.categoryCovers || {})) {
  await existsLocalPath(cover).catch(() => {
    failures.push(`category cover for ${category} does not exist: ${cover}`);
  });
}

const slugs = new Map();
const seriesOrders = new Map();
for (const post of posts) {
  const { file, data, body, hasFrontMatter } = post;
  const slug = data.slug || slugify(data.title || path.basename(file, ".md"));
  const status = data.status;

  if (!hasFrontMatter) failures.push(`${file} is missing front matter.`);
  if (!data.title) failures.push(`${file} is missing title.`);
  if (!slug) failures.push(`${file} has an empty slug.`);
  if (!isDate(data.date)) failures.push(`${file} is missing YYYY-MM-DD date.`);
  if (data.updated && !isDate(data.updated)) failures.push(`${file} has invalid updated date.`);
  if (isDate(data.date) && isDate(data.updated) && new Date(data.updated) < new Date(data.date)) {
    failures.push(`${file} updated date cannot be earlier than date.`);
  }
  if (!["published", "draft"].includes(status)) failures.push(`${file} status must be published or draft.`);
  if (body.trim().length <= 20) failures.push(`${file} body is too short.`);

  if (slugs.has(slug)) failures.push(`${file} duplicates slug "${slug}" from ${slugs.get(slug)}.`);
  slugs.set(slug, file);

  if (data.cover) {
    await existsLocalPath(data.cover).catch(() => {
      failures.push(`${file} cover does not exist: ${data.cover}`);
    });
  }

  if (data.seriesOrder && (!/^\d+$/.test(String(data.seriesOrder)) || Number.parseInt(data.seriesOrder, 10) <= 0)) {
    failures.push(`${file} seriesOrder must be a positive integer when set.`);
  }
  if (data.seriesOrder && !data.series) {
    failures.push(`${file} seriesOrder requires series.`);
  }
  if (data.series && !data.seriesOrder) {
    warnings.push(`${file} has series but no seriesOrder; ordering will fall back to date.`);
  }
  if (data.series && data.seriesOrder) {
    const seriesOrderKey = `${data.series}:${data.seriesOrder}`;
    if (seriesOrders.has(seriesOrderKey)) {
      failures.push(`${file} duplicates seriesOrder ${data.seriesOrder} in series "${data.series}" from ${seriesOrders.get(seriesOrderKey)}.`);
    }
    seriesOrders.set(seriesOrderKey, file);
  }

  for (const asset of markdownAssetPaths(body)) {
    await existsLocalPath(asset).catch(() => {
      failures.push(`${file} references missing asset: ${asset}`);
    });
  }

  if (status === "published") {
    if (!data.category || data.category === "未分类") failures.push(`${file} published posts need a real category.`);
    if (!Array.isArray(data.tags) || data.tags.length === 0) failures.push(`${file} published posts need at least one tag.`);
    if (!data.summary || data.summary === "这里写一句文章摘要。" || data.summary.length < 12) {
      failures.push(`${file} published posts need a useful summary.`);
    }
  }

  if (status === "draft" && data.summary === "这里写一句文章摘要。") {
    warnings.push(`${file} still has the default summary placeholder.`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Failed: ${failure}`);
  }
  process.exit(1);
}

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}

console.log(`Lint checks passed for ${postFiles.length} posts.`);
