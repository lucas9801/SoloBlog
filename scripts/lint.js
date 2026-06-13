import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "content/site.json",
  "content/about.md",
  "src/styles.css",
  "src/site.js",
  "src/article.js",
  "src/search.js",
  "src/theme-init.js",
  "src/views.js",
  "scripts/build.js",
  "scripts/check-all.js",
  "scripts/check-layout.js",
  "scripts/check-output.js",
  "scripts/new-post.js",
  "scripts/test-build.js",
  "scripts/test-lint.js",
  "scripts/test-new-post.js",
  "scripts/test-preview.js",
  "scripts/test-views.js",
  "public/_headers",
  "public/_redirects",
  "public/favicon.svg",
  "public/site.webmanifest",
  "wrangler.toml",
  ".node-version",
  "docs/cloudflare-pages.md",
  "assets/og/solus-og.svg",
  "assets/og/solus-og.png",
  "migrations/0002_post_view_events.sql"
];

for (const file of requiredFiles) {
  await access(path.join(root, file)).catch(() => {
    throw new Error(`Missing required file: ${file}`);
  });
}

const [
  site,
  manifest,
  css,
  siteScript,
  articleScript,
  searchScript,
  viewsFunction,
  viewsMigration,
  viewEventsMigration,
  buildScript,
  checkOutputScript,
  headers,
  packageConfig,
  wranglerConfig,
  socialImageStats
] = await Promise.all([
  readFile(path.join(root, "content/site.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "public/site.webmanifest"), "utf8").then(JSON.parse),
  readFile(path.join(root, "src/styles.css"), "utf8"),
  readFile(path.join(root, "src/site.js"), "utf8"),
  readFile(path.join(root, "src/article.js"), "utf8"),
  readFile(path.join(root, "src/search.js"), "utf8"),
  readFile(path.join(root, "functions/api/views.js"), "utf8"),
  readFile(path.join(root, "migrations/0001_post_views.sql"), "utf8"),
  readFile(path.join(root, "migrations/0002_post_view_events.sql"), "utf8"),
  readFile(path.join(root, "scripts/build.js"), "utf8"),
  readFile(path.join(root, "scripts/check-output.js"), "utf8"),
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

function localDateString(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

async function existsLocalPath(urlPath) {
  if (!urlPath.startsWith("/") || /^\/(posts|archive|categories|tags|search|about)\//.test(urlPath)) return true;
  const pathname = urlPath.split(/[?#]/)[0].replace(/^\/+/, "");
  await access(path.join(root, pathname));
  return true;
}

function markdownUrlReferences(markdown) {
  return [...String(markdown || "").matchAll(/(!?)\[[^\]]*]\(([^)]+)\)/g)].map((match) => {
    const raw = match[2].trim();
    const url = raw.replace(/^<(.+)>$/, "$1").split(/\s+/)[0] || "";
    return {
      raw,
      url,
      isImage: match[1] === "!"
    };
  });
}

function markdownUrlIssue(ref) {
  const url = String(ref.url || "").trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!url) return "has an empty URL.";
  if (url.startsWith("//")) return `uses a protocol-relative URL: ${ref.raw}`;
  if (url.startsWith("#")) return "";

  const scheme = url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme) {
    if (scheme === "http" || scheme === "https") return "";
    if (!ref.isImage && scheme === "mailto") return "";
    return `uses unsupported URL scheme "${scheme}": ${ref.raw}`;
  }

  if (!url.startsWith("/")) return `uses a rootless relative URL: ${ref.raw}`;
  return "";
}

function normalizedLabel(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
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
if (!buildScript.includes("feed.json") || !buildScript.includes("jsonFeed")) {
  failures.push("Build must generate JSON Feed.");
}
if (!buildScript.includes("sitemap.xml")) failures.push("Build must generate sitemap.");
if (!buildScript.includes("opensearch.xml") || !buildScript.includes("openSearch")) {
  failures.push("Build must generate an OpenSearch descriptor.");
}
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
if (!buildScript.includes("resolveAssetVersion") || !buildScript.includes("hashDirectory")) {
  failures.push("Build must version CSS and JS assets from source content when no deploy SHA is available.");
}
if (!buildScript.includes("comparePostsNewestFirst")) {
  failures.push("Build must sort posts with a deterministic newest-first comparator.");
}
if (!buildScript.includes("robots.txt")) failures.push("Build must generate robots.txt.");
if (!buildScript.includes("404.html") || !buildScript.includes("notFoundPage")) failures.push("Build must generate a custom 404 page.");
if (!buildScript.includes("noindex,follow")) failures.push("404 page must be marked noindex.");
if (!buildScript.includes("content:encoded") || !buildScript.includes("absolutizeFeedHtml")) {
  failures.push("RSS feed must include full post content with absolute local URLs.");
}
if (!buildScript.includes("https://jsonfeed.org/version/1.1") || !buildScript.includes("content_html")) {
  failures.push("JSON Feed must include full HTML content using JSON Feed 1.1.");
}
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
if (!checkOutputScript.includes("checkStructuredData") || !checkOutputScript.includes("TechArticle")) {
  failures.push("Output checks must validate structured data.");
}
if (!checkOutputScript.includes("checkInteractiveNames")) {
  failures.push("Output checks must validate accessible names for interactive elements.");
}
if (!buildScript.includes("pageSchema") || !checkOutputScript.includes("CollectionPage")) {
  failures.push("Index pages must expose page-level structured data.");
}
if (!buildScript.includes("paginationHead") || !buildScript.includes('rel="prev"') || !buildScript.includes('rel="next"')) {
  failures.push("Paginated archive pages must expose prev/next head links.");
}
if (!buildScript.includes("groupByYear") || !buildScript.includes("/years/") || !css.includes(".archive-filter-stack")) {
  failures.push("Archive pages must expose year-based browsing alongside category filters.");
}
if (!buildScript.includes("writeTagPages") || !buildScript.includes("tagListPage({ tag, posts, tags, page")) {
  failures.push("Tag result pages must be paginated.");
}
if (!buildScript.includes("writeSeriesPages") || !buildScript.includes("seriesPage({ name, posts, seriesEntries, page")) {
  failures.push("Series detail pages must be paginated.");
}
if (!buildScript.includes("uniqueHeadingId") || !buildScript.includes("headingIds")) {
  failures.push("Markdown heading IDs must be stable and unique within each post.");
}
if (!buildScript.includes("safeMarkdownUrl") || !buildScript.includes("allowMailto")) {
  failures.push("Markdown links and images must validate URL schemes before rendering.");
}
if (!buildScript.includes("/favicon.svg")) failures.push("Page head must link favicon.svg.");
if (!buildScript.includes("/site.webmanifest")) failures.push("Page head must link site.webmanifest.");
if (!buildScript.includes("application/feed+json")) failures.push("Page head must expose JSON Feed discovery.");
if (!buildScript.includes('rel="search"') || !buildScript.includes("application/opensearchdescription+xml")) {
  failures.push("Page head must expose OpenSearch discovery.");
}
if (!buildScript.includes("/src/theme-init.js")) failures.push("Page head must load the external theme initializer.");
if (!buildScript.includes("socialImageForPost")) failures.push("Article pages must choose social images independently from visual covers.");
if (!buildScript.includes("coverImage") || !buildScript.includes('fetchpriority="${escapeAttr(fetchPriority)}"')) {
  failures.push("Build must render cover images with stable dimensions and explicit hero priority.");
}
if (!buildScript.includes("data-giscus-comments")) failures.push("Giscus comments must render a lazy-load container.");
if (!buildScript.includes("includeViewsScript") || !buildScript.includes("viewsScript: false")) {
  failures.push("Views script must load only on pages that need it, with article pages handled by article.js.");
}
if (!siteScript.includes("focusin") || !siteScript.includes("revealHeader")) {
  failures.push("Site script must reveal the sticky header when it receives keyboard focus.");
}
if (!siteScript.includes("syncGiscusTheme") || !siteScript.includes("solus-theme")) {
  failures.push("Site script must keep theme state persistent and synced with comments.");
}
if (!articleScript.includes("IntersectionObserver") || !articleScript.includes("https://giscus.app/client.js")) {
  failures.push("Article script must lazy load Giscus comments.");
}
if (!articleScript.includes("giscusTheme") || !articleScript.includes("preferred_color_scheme")) {
  failures.push("Article script must load Giscus with the current site theme.");
}
if (!articleScript.includes("readingTarget") || !articleScript.includes(".article-content")) {
  failures.push("Article reading progress must be based on article content, not the whole document.");
}
if (!searchScript.includes("searchFacets") || !searchScript.includes("data-facet-type")) {
  failures.push("Search page must support category and tag facets.");
}
if (!searchScript.includes("fields.year")) {
  failures.push("Search page must index post years for archive-scale discovery.");
}
if (!searchScript.includes('width="1200" height="675"')) {
  failures.push("Search result cover images must reserve their 1200x675 aspect ratio.");
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
if (!viewsFunction.includes("storageError") || !viewsFunction.includes("View counter storage is unavailable.")) {
  failures.push("Views API must return JSON errors when storage operations fail.");
}
if (!viewsFunction.includes("idx_post_views_ranking") || !viewsMigration.includes("idx_post_views_ranking")) {
  failures.push("Views API and migration must create an index for reading ranking queries.");
}
if (
  !viewsFunction.includes("post_view_events") ||
  !viewsFunction.includes("INSERT OR IGNORE INTO post_view_events") ||
  !viewEventsMigration.includes("post_view_events")
) {
  failures.push("Views API must enforce server-side daily view dedupe with a post_view_events migration.");
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
if (!headers.includes("/feed.json")) failures.push("Cloudflare headers must cache feed.json.");
if (!headers.includes("/opensearch.xml")) failures.push("Cloudflare headers must cache opensearch.xml.");
if (!/\/src\/\*\s+Cache-Control: public, max-age=31536000, immutable/s.test(headers)) {
  failures.push("Cloudflare headers must cache versioned src assets as immutable.");
}
if (/script-src[^;\n]*'unsafe-inline'/.test(headers)) {
  failures.push("Cloudflare script-src must not allow unsafe-inline.");
}
if (/style-src[^;\n]*'unsafe-inline'/.test(headers)) {
  failures.push("Cloudflare style-src must not allow unsafe-inline.");
}
if (manifest.name !== "SOLUS Dev Notes") failures.push("site.webmanifest name must match the site title.");
if (manifest.short_name !== "SOLUS") failures.push("site.webmanifest short_name must be SOLUS.");
if (manifest.start_url !== "/" || manifest.scope !== "/") failures.push("site.webmanifest must start at the site root.");
if (manifest.display !== "standalone") failures.push("site.webmanifest display must be standalone.");
if (!Array.isArray(manifest.icons) || !manifest.icons.some((icon) => icon.src === "/favicon.svg")) {
  failures.push("site.webmanifest must include /favicon.svg as an icon.");
}
if (packageConfig.name !== "solus-blog") failures.push("package name should match the SOLUS blog project.");
if (packageConfig.scripts?.["check:all"] !== "node scripts/check-all.js") {
  failures.push("package scripts must expose check:all.");
}
if (packageConfig.scripts?.["check:output"] !== "node scripts/check-output.js") {
  failures.push("package scripts must expose check:output.");
}
if (packageConfig.scripts?.["check:layout"] !== "node scripts/check-layout.js") {
  failures.push("package scripts must expose check:layout.");
}
if (packageConfig.scripts?.["test:lint"] !== "node scripts/test-lint.js") {
  failures.push("package scripts must expose test:lint.");
}
if (packageConfig.scripts?.["test:build"] !== "node scripts/test-build.js") {
  failures.push("package scripts must expose test:build.");
}
if (packageConfig.scripts?.["test:new-post"] !== "node scripts/test-new-post.js") {
  failures.push("package scripts must expose test:new-post.");
}
if (packageConfig.scripts?.["test:preview"] !== "node scripts/test-preview.js") {
  failures.push("package scripts must expose test:preview.");
}
if (packageConfig.scripts?.["test:views"] !== "node scripts/test-views.js") {
  failures.push("package scripts must expose test:views.");
}
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
  await access(path.join(root, "migrations/0002_post_view_events.sql")).catch(() => {
    failures.push("views are enabled, but migrations/0002_post_view_events.sql is missing.");
  });
}
for (const [category, cover] of Object.entries(site.categoryCovers || {})) {
  await existsLocalPath(cover).catch(() => {
    failures.push(`category cover for ${category} does not exist: ${cover}`);
  });
}
const knownCategories = new Set(Object.keys(site.categoryCovers || {}));

const slugs = new Map();
const seriesOrders = new Map();
const today = localDateString();
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

  if (data.category && String(data.category).trim() !== data.category) {
    failures.push(`${file} category must not have leading or trailing whitespace.`);
  }
  if (data.series && String(data.series).trim() !== data.series) {
    failures.push(`${file} series must not have leading or trailing whitespace.`);
  }
  if (Array.isArray(data.tags)) {
    const seenTags = new Map();
    data.tags.forEach((tag, index) => {
      const value = String(tag || "");
      const normalized = normalizedLabel(value);
      if (!normalized) failures.push(`${file} tag #${index + 1} must not be empty.`);
      if (value.trim() !== value) failures.push(`${file} tag "${value}" must not have leading or trailing whitespace.`);
      if (value.trim().startsWith("#")) failures.push(`${file} tag "${value}" must not start with #.`);
      if (seenTags.has(normalized)) {
        failures.push(`${file} duplicates tag "${value}" from tag #${seenTags.get(normalized)}.`);
      }
      seenTags.set(normalized, index + 1);
    });
  }

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

  for (const ref of markdownUrlReferences(body)) {
    const issue = markdownUrlIssue(ref);
    if (issue) {
      failures.push(`${file} markdown ${ref.isImage ? "image" : "link"} ${issue}`);
      continue;
    }

    if (ref.url.startsWith("/")) {
      await existsLocalPath(ref.url).catch(() => {
        failures.push(`${file} references missing local target: ${ref.url}`);
      });
    }
  }

  if (status === "published") {
    if (isDate(data.date) && data.date > today) {
      failures.push(`${file} published date cannot be in the future.`);
    }
    if (isDate(data.updated) && data.updated > today) {
      failures.push(`${file} published updated date cannot be in the future.`);
    }
    if (!data.category || data.category === "未分类") failures.push(`${file} published posts need a real category.`);
    if (data.category && !knownCategories.has(data.category)) {
      failures.push(`${file} category "${data.category}" must be declared in content/site.json categoryCovers.`);
    }
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
