import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "content/site.json",
  "content/about.md",
  "index.html",
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
  "scripts/preview.js",
  "scripts/test-build.js",
  "scripts/test-theme-init.js",
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
  "migrations/0002_post_view_events.sql",
  "README.md"
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
  themeInitScript,
  siteScript,
  articleScript,
  searchScript,
  viewsClientScript,
  viewsFunction,
  viewsMigration,
  viewEventsMigration,
  buildScript,
  newPostScript,
  previewScript,
  testBuildScript,
  testNewPostScript,
  testPreviewScript,
  checkAllScript,
  checkLayoutScript,
  checkOutputScript,
  headers,
  redirects,
  packageConfig,
  wranglerConfig,
  socialImageSvg,
  socialImageStats,
  rootIndex,
  readme,
  blogOperationsDocs,
  cloudflareDocs
] = await Promise.all([
  readFile(path.join(root, "content/site.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "public/site.webmanifest"), "utf8").then(JSON.parse),
  readFile(path.join(root, "src/styles.css"), "utf8"),
  readFile(path.join(root, "src/theme-init.js"), "utf8"),
  readFile(path.join(root, "src/site.js"), "utf8"),
  readFile(path.join(root, "src/article.js"), "utf8"),
  readFile(path.join(root, "src/search.js"), "utf8"),
  readFile(path.join(root, "src/views.js"), "utf8"),
  readFile(path.join(root, "functions/api/views.js"), "utf8"),
  readFile(path.join(root, "migrations/0001_post_views.sql"), "utf8"),
  readFile(path.join(root, "migrations/0002_post_view_events.sql"), "utf8"),
  readFile(path.join(root, "scripts/build.js"), "utf8"),
  readFile(path.join(root, "scripts/new-post.js"), "utf8"),
  readFile(path.join(root, "scripts/preview.js"), "utf8"),
  readFile(path.join(root, "scripts/test-build.js"), "utf8"),
  readFile(path.join(root, "scripts/test-new-post.js"), "utf8"),
  readFile(path.join(root, "scripts/test-preview.js"), "utf8"),
  readFile(path.join(root, "scripts/check-all.js"), "utf8"),
  readFile(path.join(root, "scripts/check-layout.js"), "utf8"),
  readFile(path.join(root, "scripts/check-output.js"), "utf8"),
  readFile(path.join(root, "public/_headers"), "utf8"),
  readFile(path.join(root, "public/_redirects"), "utf8"),
  readFile(path.join(root, "package.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "wrangler.toml"), "utf8"),
  readFile(path.join(root, "assets/og/solus-og.svg"), "utf8"),
  stat(path.join(root, "assets/og/solus-og.png")),
  readFile(path.join(root, "index.html"), "utf8"),
  readFile(path.join(root, "README.md"), "utf8"),
  readFile(path.join(root, "docs/blog-operations.md"), "utf8"),
  readFile(path.join(root, "docs/cloudflare-pages.md"), "utf8")
]);

const postFiles = (await readdir(path.join(root, "content/posts"))).filter((file) =>
  file.endsWith(".md")
);
const postCoverSvgFiles = (await readdir(path.join(root, "assets/posts"))).filter((file) =>
  file.endsWith(".svg")
);
const postCoverSvgs = await Promise.all(
  postCoverSvgFiles.map((file) => readFile(path.join(root, "assets/posts", file), "utf8"))
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

function isCanonicalSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ""));
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
      label: match[0].match(/!?\[([^\]]*)]/)?.[1] || "",
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
if (
  !css.includes("@media print") ||
  !css.includes(".comments-section") ||
  !css.includes(".reading-pill") ||
  !css.includes("break-inside: avoid") ||
  !css.includes("@page")
) {
  failures.push("CSS must provide a print stylesheet for long-form technical articles.");
}
if (!/body\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/.test(css) || !/body\s*>\s*main\s*\{[\s\S]*?flex:\s*1\s+0\s+auto;/.test(css)) {
  failures.push("Page layout must keep footers pinned to the viewport bottom on short pages.");
}
if (!/\[hidden]\s*\{[\s\S]*?display:\s*none\s*!important;/.test(css)) {
  failures.push("CSS must preserve the native hidden state even on styled controls.");
}
if (!css.includes("scroll-padding-top") || !css.includes("scroll-margin-top")) {
  failures.push("Article anchors must account for the sticky header on desktop and mobile.");
}
if (!/\.article-content h2\s*\{[\s\S]*?font-weight:\s*750;/.test(css)) {
  failures.push("Article h2 headings should use a restrained 750 weight for long-form reading.");
}
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
if (
  [css, searchScript, buildScript, readme, blogOperationsDocs, cloudflareDocs].some((source) =>
    source.includes("/assets/hero-game-tech.png")
  )
) {
  failures.push("Project sources should not reference the retired large hero PNG.");
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
if (!buildScript.includes('notFoundPage(posts)') || !buildScript.includes('compactPostIndex(posts, "最近文章")')) {
  failures.push("404 page must help readers recover with recent posts.");
}
if (!buildScript.includes("content:encoded") || !buildScript.includes("absolutizeFeedHtml")) {
  failures.push("RSS feed must include full post content with absolute local URLs.");
}
if (
  !buildScript.includes(":?-{3,}") ||
  !buildScript.includes('.replace(/\\\\\\|/g, " ")') ||
  !buildScript.includes('.replace(/\\|/g, " ")') ||
  !testBuildScript.includes("Name Value Pipe A B")
) {
  failures.push("Search index text must strip Markdown table syntax into readable plain text.");
}
if (!buildScript.includes('value.startsWith("#")') || !checkOutputScript.includes("fragment-only heading links")) {
  failures.push("RSS and JSON Feed content must absolutize article heading fragment links.");
}
if (
  !buildScript.includes("https://jsonfeed.org/version/1.1") ||
  !buildScript.includes("content_html") ||
  !buildScript.includes("favicon: absoluteUrl") ||
  !buildScript.includes("authors: [{ name: site.brand || site.title }]") ||
  !checkOutputScript.includes("dist/feed.json item must include tags")
) {
  failures.push("JSON Feed must include full HTML content and metadata using JSON Feed 1.1.");
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
if (!checkOutputScript.includes("must not render the page context title block")) {
  failures.push("Output checks must prevent title context blocks on archive index pages.");
}
if (!checkOutputScript.includes("must not render a visible page title block")) {
  failures.push("Output checks must prevent large visible title blocks on collection index pages.");
}
if (!checkOutputScript.includes("must not render a visible section kicker")) {
  failures.push("Output checks must prevent visible kicker labels on collection index pages.");
}
if (!checkOutputScript.includes("checkAriaReferences") || !checkOutputScript.includes("controls|describedby|labelledby")) {
  failures.push("Output checks must validate ARIA ID references.");
}
if (!checkOutputScript.includes("function checkDuplicateIds") || !checkOutputScript.includes("contains duplicate id")) {
  failures.push("Output checks must reject duplicate HTML ids.");
}
if (
  !checkOutputScript.includes("function checkContentLandmarks") ||
  !checkOutputScript.includes('main landmark must use id="content"') ||
  !checkOutputScript.includes("skip link must point to #content")
) {
  failures.push("Output checks must validate skip links and the main content landmark.");
}
if (
  !checkOutputScript.includes("function checkPaginationLinks") ||
  !checkOutputScript.includes("expectedPrev") ||
  !checkOutputScript.includes("expectedNext") ||
  !checkOutputScript.includes("pageHref(basePath") ||
  !checkOutputScript.includes("matching page")
) {
  failures.push("Output checks must validate pagination prev/next head links.");
}
if (
  !checkOutputScript.includes("function checkSitemapCoverage") ||
  !checkOutputScript.includes("dist/sitemap.xml is missing expected URL") ||
  !checkOutputScript.includes("/search/") ||
  !checkOutputScript.includes("/about/") ||
  !checkOutputScript.includes("/categories/${slugify")
) {
  failures.push("Output checks must ensure sitemap covers generated public indexes.");
}
if (
  !checkOutputScript.includes("function checkSitemapHtmlCoverage") ||
  !checkOutputScript.includes("does not include public HTML page") ||
  !checkOutputScript.includes('relative === "dist/404.html"')
) {
  failures.push("Output checks must ensure sitemap covers all public HTML output.");
}
if (
  !checkOutputScript.includes("references missing category archive") ||
  !checkOutputScript.includes("references missing tag archive") ||
  !checkOutputScript.includes("references missing series archive")
) {
  failures.push("Output checks must ensure search index taxonomy references resolve.");
}
if (css.includes(".page-context")) {
  failures.push("CSS must not keep the retired page context title block styles.");
}
if (/(function\s+(?:taxonomyIndexPage|listPage|postCard)\b)/.test(buildScript)) {
  failures.push("Build must not keep retired collection page builders.");
}
for (const retiredClass of [".post-card", ".post-grid", ".taxonomy-card", ".taxonomy-grid", ".tag-results-head"]) {
  if (css.includes(retiredClass)) failures.push(`CSS must not keep retired selector ${retiredClass}.`);
}
if (!buildScript.includes("pageSchema") || !checkOutputScript.includes("CollectionPage")) {
  failures.push("Index pages must expose page-level structured data.");
}
if (!checkLayoutScript.includes('"/about/"') || !checkLayoutScript.includes("/categories/${slugifyForPath(firstCategory)}/")) {
  failures.push("Layout checks must cover the about page and a category archive page by default.");
}
if (!checkLayoutScript.includes("hasMarkdownTable") || !checkLayoutScript.includes("firstContentPostPath(searchIndex, hasMarkdownTable)")) {
  failures.push("Layout checks must include a real article with a Markdown table when one exists.");
}
if (!checkLayoutScript.includes("startPreviewIfNeeded") || !checkLayoutScript.includes("scripts/preview.js")) {
  failures.push("Layout checks must start a local preview server when CHECK_URL is not provided.");
}
if (
  checkLayoutScript.includes("archiveRuntime") &&
  (!checkLayoutScript.includes('await send("Page.navigate", { url: page.url });') ||
    !checkLayoutScript.includes("waitForPathname(page.pathname)"))
) {
  failures.push("Layout checks must restore archive pages before screenshot capture.");
}
if (!checkLayoutScript.includes("footer is floating above the viewport bottom")) {
  failures.push("Layout checks must prevent short-page footers from floating mid-viewport.");
}
if (!checkLayoutScript.includes("const originalTheme = document.documentElement.dataset.theme")) {
  failures.push("Layout checks must restore the article theme after testing comments.");
}
if (!checkAllScript.includes("scripts/test-theme-init.js")) {
  failures.push("check:all must run theme initializer tests.");
}
if (!buildScript.includes("paginationHead") || !buildScript.includes('rel="prev"') || !buildScript.includes('rel="next"')) {
  failures.push("Paginated archive pages must expose prev/next head links.");
}
if (
  !buildScript.includes("function paginationItems") ||
  !buildScript.includes("pagination-ellipsis") ||
  !buildScript.includes('aria-label="第 ${page} 页"')
) {
  failures.push("Pagination must use compact, accessible page ranges for large archives.");
}
if (!buildScript.includes("groupByYear") || !buildScript.includes("/years/") || !css.includes(".archive-filter-stack")) {
  failures.push("Archive pages must expose year-based browsing alongside category filters.");
}
if (
  !buildScript.includes("archiveSelectionPath") ||
  !buildScript.includes("archiveSelectionRoute") ||
  !buildScript.includes("filterArchivePosts") ||
  !buildScript.includes("archive-filter-links") ||
  !buildScript.includes("archiveFilterRow") ||
  !buildScript.includes("archiveSelectionPath({ category: activeCategory, year })") ||
  !buildScript.includes("archiveSelectionPath({ category, year: activeYear })")
) {
  failures.push("Archive pages must support quick-link combined year and category filtering.");
}
if (
  buildScript.includes("archive-filter-form") ||
  buildScript.includes("<summary>快捷筛选</summary>") ||
  siteScript.includes("data-archive-filter-form") ||
  siteScript.includes("archiveFilterTarget")
) {
  failures.push("Archive pages must not render duplicate dropdown filters or visible quick-filter labels.");
}
if (!buildScript.includes("writeTagPages") || !buildScript.includes("tagListPage({ tag, posts, tags, page")) {
  failures.push("Tag result pages must be paginated.");
}
if (!buildScript.includes("writeSeriesPages") || !buildScript.includes("seriesPage({ name, posts, seriesEntries, page")) {
  failures.push("Series detail pages must be paginated.");
}
if (!buildScript.includes("series-card-list") || !css.includes(".series-card-list")) {
  failures.push("Series index cards must preview posts inside each series.");
}
if (buildScript.includes("<span>最近 ${formatDate") || !buildScript.includes("<span>更新 ${formatDate")) {
  failures.push("Series index cards must use archival update wording instead of recent-update wording.");
}
if (
  !buildScript.includes("series-detail-layout") ||
  !buildScript.includes('<aside class="series-related" aria-label="其他专题">') ||
  !css.includes(".series-detail-layout") ||
  !testBuildScript.includes('class="series-detail-layout"')
) {
  failures.push("Series detail pages must place related series in a side column when available.");
}
if (
  !buildScript.includes("function compactPostIndex") ||
  !buildScript.includes('compactPostIndex(posts, "最近文章")') ||
  !css.includes(".compact-post-list") ||
  !testBuildScript.includes("最近文章")
) {
  failures.push("404 recovery must keep a compact recent-post index without adding recent-update blocks to taxonomy indexes.");
}
if (
  !buildScript.includes("seriesPanel(post, posts, { compact: true })") ||
  !buildScript.includes("article-related-aside") ||
  !testBuildScript.includes("series-panel compact") ||
  !checkLayoutScript.includes("article series panel is not in the side column")
) {
  failures.push("Article series navigation must render in the side column instead of the article footer.");
}
if (
  !buildScript.includes('<nav class="sidebar-card toc" aria-labelledby="article-toc-title">') ||
  !articleScript.includes('aria-current", "location"') ||
  !checkLayoutScript.includes("active toc entry must mark the current reading location")
) {
  failures.push("Article table of contents must be a navigation landmark with current-location state.");
}
if (!buildScript.includes("uniqueHeadingId") || !buildScript.includes("headingIds")) {
  failures.push("Markdown heading IDs must be stable and unique within each post.");
}
if (!buildScript.includes("heading-anchor") || !buildScript.includes("章节链接：") || !css.includes(".heading-anchor")) {
  failures.push("Article headings must expose subtle, accessible section permalinks.");
}
if (!buildScript.includes("safeMarkdownUrl") || !buildScript.includes("allowMailto")) {
  failures.push("Markdown links and images must validate URL schemes before rendering.");
}
if (
  !buildScript.includes("data-external-link") ||
  !buildScript.includes("在新标签页打开") ||
  !css.includes(".article-content a[data-external-link]::after")
) {
  failures.push("Markdown external links must expose a visible marker and accessible new-tab label.");
}
if (!buildScript.includes("/favicon.svg")) failures.push("Page head must link favicon.svg.");
if (!buildScript.includes("/site.webmanifest")) failures.push("Page head must link site.webmanifest.");
if (
  !buildScript.includes('name="theme-color"') ||
  !buildScript.includes('(prefers-color-scheme: light)') ||
  !buildScript.includes('(prefers-color-scheme: dark)') ||
  !checkOutputScript.includes("theme-color meta tags")
) {
  failures.push("Page head must expose light and dark mobile theme colors.");
}
if (!buildScript.includes("application/rss+xml")) failures.push("Page head must expose RSS discovery.");
if (!buildScript.includes("application/feed+json")) failures.push("Page head must expose JSON Feed discovery.");
if (!buildScript.includes('rel="search"') || !buildScript.includes("application/opensearchdescription+xml")) {
  failures.push("Page head must expose OpenSearch discovery.");
}
if (!buildScript.includes("/src/theme-init.js")) failures.push("Page head must load the external theme initializer.");
if (!themeInitScript.includes("function storedTheme") || !themeInitScript.includes("function prefersDarkTheme") || !themeInitScript.includes("window.matchMedia?.")) {
  failures.push("Theme initializer must still honor system color scheme when localStorage is unavailable.");
}
if (!buildScript.includes("socialImageForPost")) failures.push("Article pages must choose social images independently from visual covers.");
if (!/function postPage[\s\S]*current:\s*"\/archive\/"/.test(buildScript)) {
  failures.push("Article pages must keep the archive navigation item active.");
}
if (!buildScript.includes('class="updated-date" datetime=') || !checkOutputScript.includes("checkTimeElements")) {
  failures.push("Published and updated dates must be rendered as valid time elements.");
}
if (!buildScript.includes("coverImage") || !buildScript.includes('fetchpriority="${escapeAttr(fetchPriority)}"')) {
  failures.push("Build must render cover images with stable dimensions and explicit hero priority.");
}
if (
  !buildScript.includes("function coverTextLines") ||
  !buildScript.includes("function svgTextBlock") ||
  !buildScript.includes("svgTextBlock(titleLines") ||
  !buildScript.includes("svgTextBlock(summaryLines") ||
  buildScript.includes("existingGeneratedCover")
) {
  failures.push("Generated post covers must include wrapped title and summary text instead of reusing stale decorative SVGs.");
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
if (!siteScript.includes("切换浅色模式") || !checkLayoutScript.includes("theme toggle aria-label is out of sync")) {
  failures.push("Theme toggle must expose an accurate accessible label for the next action.");
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
if (
  !articleScript.includes("function scheduleArticleMetricsUpdate") ||
  !articleScript.includes("window.requestAnimationFrame") ||
  !articleScript.includes('window.addEventListener("scroll", scheduleArticleMetricsUpdate') ||
  articleScript.includes('window.addEventListener("scroll", updateReadingProgress') ||
  articleScript.includes('window.addEventListener("scroll", updateActiveToc')
) {
  failures.push("Article scroll metrics must be coalesced into a single requestAnimationFrame update.");
}
if (
  !buildScript.includes("data-copy-code-status") ||
  !buildScript.includes('aria-label="复制代码"') ||
  !buildScript.includes('tabindex="0" aria-label="${escapeAttr(scrollLabel)}"') ||
  !articleScript.includes("代码已复制") ||
  !articleScript.includes("async function copyText") ||
  !articleScript.includes('document.execCommand("copy")')
) {
  failures.push("Article code blocks must expose keyboard scroll and accessible copy feedback.");
}
if (
  !buildScript.includes("data-copy-article-url") ||
  !buildScript.includes("data-copy-article-status") ||
  !articleScript.includes("data-copy-article-url") ||
  !articleScript.includes("本文链接已复制") ||
  !css.includes(".article-footer-tools") ||
  !articleScript.includes("event.target instanceof Element")
) {
  failures.push("Article pages must expose an accessible permalink copy action.");
}
if (
  !searchScript.includes("searchFacets") ||
  !searchScript.includes('facetGroup("年份", "year"') ||
  !searchScript.includes('facetGroup("分类", "category"') ||
  !searchScript.includes('facetGroup("标签", "tag"') ||
  !searchScript.includes("全部年份") ||
  !searchScript.includes("全部分类") ||
  !searchScript.includes("event.target instanceof Element") ||
  !searchScript.includes('["year", "category", "tag"].includes(type)') ||
  !searchScript.includes("function resetSearchState") ||
  !checkLayoutScript.includes("Escape did not clear active facets")
) {
  failures.push("Search page must support combined year/category/tag quick filters.");
}
if (
  searchScript.includes("searchYearFilter") ||
  searchScript.includes("searchCategoryFilter") ||
  searchScript.includes("renderFilterSelects") ||
  buildScript.includes("search-filter-selects")
) {
  failures.push("Search page must not render duplicate dropdown filters above quick filters.");
}
if (searchScript.includes("search-facets-title") || css.includes(".search-facets-title")) {
  failures.push("Search page must not render a visible quick-filter title above the facet groups.");
}
if (!searchScript.includes("fields.year") || !searchScript.includes("state.year")) {
  failures.push("Search page must index and filter post years for archive-scale discovery.");
}
if (
  !searchScript.includes("facetScope(posts") ||
  !searchScript.includes("includeActiveFacet") ||
  !searchScript.includes("matchesQuery(post)") ||
  !/function render\(posts\)[\s\S]*renderFacets\(posts\)[\s\S]*syncControls\(\)/.test(searchScript)
) {
  failures.push("Search facets must update against the current query and selected filters.");
}
if (!searchScript.includes('width="1200" height="675"')) {
  failures.push("Search result cover images must reserve their 1200x675 aspect ratio.");
}
if (
  !searchScript.includes("function dateTime") ||
  !searchScript.includes("Number.isNaN(value.getTime()) ? 0 : value.getTime()") ||
  !/function formatDate\(date\)[\s\S]*Number\.isNaN\(value\.getTime\(\)\)[\s\S]*return ""/.test(searchScript)
) {
  failures.push("Search page must tolerate invalid dates when formatting and sorting client results.");
}
if (!searchScript.includes("data-search-clear") || !searchScript.includes("Escape")) {
  failures.push("Search page must provide clear/reset controls.");
}
if (!searchScript.includes("function highlight") || !searchScript.includes("<mark>$&</mark>") || !css.includes(".search-result-card mark")) {
  failures.push("Search results must highlight matched query terms.");
}
if (
  !searchScript.includes("scheduleSearchRender") ||
  !searchScript.includes("cancelScheduledSearchRender") ||
  !searchScript.includes("window.setTimeout")
) {
  failures.push("Search page must debounce keyword input while keeping filter actions immediate.");
}
if (
  !buildScript.includes('id="searchStatus"') ||
  !buildScript.includes('aria-describedby="searchStatus"') ||
  !buildScript.includes('aria-controls="searchResults searchFacets"') ||
  !buildScript.includes('aria-controls="searchInputPage searchStatus searchResults searchFacets"') ||
  !buildScript.includes('id="searchPagination"') ||
  !searchScript.includes('aria-controls="searchResults searchStatus"') ||
  !searchScript.includes('results.setAttribute("role", "list")') ||
  !searchScript.includes('results.removeAttribute("role")')
) {
  failures.push("Search page must separate live status text from the result list semantics.");
}
if (buildScript.includes("autofocus")) {
  failures.push("Search page must not autofocus the query input on initial load.");
}
if (
  !searchScript.includes("SEARCH_RESULTS_PER_PAGE") ||
  !searchScript.includes("paginationItems") ||
  !searchScript.includes("data-search-page") ||
  !searchScript.includes('next.set("page", String(state.page))') ||
  !searchScript.includes("renderSearchPagination")
) {
  failures.push("Search results must paginate long result sets and preserve page state in the URL.");
}
if (
  !buildScript.includes('<noscript class="search-noscript">') ||
  !buildScript.includes("搜索功能需要启用 JavaScript") ||
  !css.includes(".search-noscript")
) {
  failures.push("Search page must provide a no-script fallback to the article archive.");
}
if (
  !siteScript.includes("function siteSearchTarget") ||
  !siteScript.includes("input[name=\"q\"]") ||
  !siteScript.includes("target.searchParams.set(\"q\", query)") ||
  !checkLayoutScript.includes("blank header search") ||
  !checkLayoutScript.includes("header search did not trim the submitted query")
) {
  failures.push("Header search must normalize blank and whitespace-padded submissions.");
}
if (!viewsFunction.includes("isSameOriginRequest") || !viewsFunction.includes("isJsonRequest")) {
  failures.push("Views API must reject cross-origin and non-JSON write requests.");
}
if (viewsFunction.includes("body.slug ||")) {
  failures.push("Views API POST must not accept slug from query parameters.");
}
if (!viewsFunction.includes("^[a-z0-9]+(?:-[a-z0-9]+)*$")) {
  failures.push("Views API must only accept canonical post slugs.");
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
  !buildScript.includes("<h2 data-ranking-title>阅读排行</h2>") ||
  !viewsClientScript.includes("rankingTitle.textContent = \"阅读排行\"")
) {
  failures.push("Reading ranking must use reading-rank wording in both static and loaded states.");
}
if (
  !viewsClientScript.includes("function rankingItems") ||
  !viewsClientScript.includes("seenSlugs") ||
  !viewsClientScript.includes("ranked: false") ||
  !buildScript.includes("category: post.category") ||
  !buildScript.includes("date: post.date")
) {
  failures.push("Reading ranking must backfill sparse view rankings with recent posts.");
}
if (/Recommended|Latest Posts|Technical Archive/.test(buildScript) || site.hero?.eyebrow === "Technical Archive") {
  failures.push("Home page must not keep template-like English kicker labels.");
}
if (
  !buildScript.includes("recommendedSlugs") ||
  !buildScript.includes('const primaryActionHref = latest.length ? "#latest-posts" : "/archive/"') ||
  buildScript.includes("posts.filter((post) => !post.featured).slice") ||
  !testBuildScript.includes('href="#latest-posts"') ||
  !checkLayoutScript.includes("home hero latest-posts link points to a missing section")
) {
  failures.push("Home page must avoid duplicate recommendations without creating a broken latest-posts hero link.");
}
if (site.tagline === "Game Development Archive" || readme.includes("My Game Dev Blog") || rootIndex.includes("My Game Dev Blog")) {
  failures.push("Project identity must not keep initial template naming.");
}
if (/Game Development Archive|Technical Archive/i.test(socialImageSvg)) {
  failures.push("Open Graph source image must not keep template archive wording.");
}
if (!socialImageSvg.includes("SOLUS Dev Notes") || !socialImageSvg.includes("游戏开发 / 图形渲染 / 工程实践")) {
  failures.push("Open Graph source image must carry the current SOLUS technical archive identity.");
}
if (
  buildScript.includes("SOLUS ARCHIVE") ||
  postCoverSvgs.some((source) => source.includes("SOLUS ARCHIVE")) ||
  buildScript.includes('placeholder="搜索文章、标签"') ||
  buildScript.includes(">⌕</button>")
) {
  failures.push("Visible generated surfaces must use current SOLUS wording.");
}
if (
  !buildScript.includes("function coverVisualSeed") ||
  !buildScript.includes(".update([post.slug, post.category, post.date].join(\"\\n\"))") ||
  /const seed = crypto[\s\S]*?post\.text/.test(buildScript)
) {
  failures.push("Generated cover visual seeds must stay stable across body and summary text changes.");
}
if (
  buildScript.includes('aria-label="搜索文章">搜索</button>') ||
  !buildScript.includes('aria-label="搜索文章"><span class="sr-only">搜索文章</span></button>') ||
  !css.includes(".site-search button::before") ||
  !css.includes(".site-search button::after")
) {
  failures.push("Header search submit must use a compact accessible icon button.");
}
if (
  !buildScript.includes('<a class="archive-card-thumb ${post.categorySlug}" href="${post.url}" aria-label="阅读文章：${escapeAttr(post.title)}">') ||
  !searchScript.includes('<a class="search-result-thumb" href="${escapeHtml(post.url)}" aria-label="阅读文章：${escapeHtml(post.title)}">') ||
  buildScript.includes('class="archive-card-thumb ${post.categorySlug}" aria-hidden="true"') ||
  searchScript.includes('class="search-result-thumb" aria-hidden="true"') ||
  !checkOutputScript.includes("card thumbnails must be article links") ||
  !checkLayoutScript.includes("search result card is missing a thumbnail article link")
) {
  failures.push("Article card thumbnails must be accessible article links, while cover images stay decorative.");
}
if (
  !/\.archive-card h2\s*\{[\s\S]*?min-height:\s*calc\(1\.38em \* 2\);[\s\S]*?-webkit-line-clamp:\s*2;/.test(css) ||
  !/\.search-result-card h2\s*\{[\s\S]*?-webkit-line-clamp:\s*2;/.test(css) ||
  !/\.search-result-card p\s*\{[\s\S]*?-webkit-line-clamp:\s*2;/.test(css) ||
  !css.includes(".archive-card-thumb:focus-visible") ||
  !css.includes(".search-result-card:focus-within")
) {
  failures.push("Post and search cards must keep stable text rhythm and visible focus states.");
}
if (/Game Development Archive|Deploy To Cloudflare Pages|Recommended: Git Integration/.test(`${blogOperationsDocs}\n${cloudflareDocs}`)) {
  failures.push("Project docs must not keep initial English template wording.");
}
for (const requiredCloudflareDocText of ["JSON Feed", "OpenSearch", "search-index.json", "feed.json", "opensearch.xml"]) {
  if (!cloudflareDocs.includes(requiredCloudflareDocText)) {
    failures.push(`Cloudflare docs must mention ${requiredCloudflareDocText}.`);
  }
}
if (blogOperationsDocs.includes("分类页和默认封面会保持一致")) {
  failures.push("Project docs must not claim category covers drive generated article covers.");
}
if (
  blogOperationsDocs.includes("可以，但需要额外接动态能力") ||
  !blogOperationsDocs.includes("当前博客已经支持阅读量和评论") ||
  !blogOperationsDocs.includes("[阅读量和评论配置](dynamic-features.md)")
) {
  failures.push("Blog operations docs must describe the implemented views/comments features instead of an old future-plan note.");
}
if (buildScript.includes('<span class="section-kicker">About</span>')) {
  failures.push("About page must not expose an English template kicker.");
}
if (
  !buildScript.includes("data-copy-rss-status") ||
  !buildScript.includes('href="/feed.json">JSON Feed</a>') ||
  !buildScript.includes(">复制 RSS</button>") ||
  site.subscribe?.description !== "通过 RSS 或 JSON Feed 跟踪最新文章。" ||
  !siteScript.includes("RSS 链接已复制") ||
  !siteScript.includes("RSS 链接复制失败") ||
  !siteScript.includes("async function copyText") ||
  !siteScript.includes('document.execCommand("copy")') ||
  !checkLayoutScript.includes("RSS copy button did not expose visible feedback") ||
  !checkLayoutScript.includes("RSS copy button did not restore its original label")
) {
  failures.push("Subscribe card must expose RSS, JSON Feed, and a clear RSS copy state.");
}
if (buildScript.includes(">Sitemap<")) {
  failures.push("Visible footer sitemap link should be localized.");
}
if (
  !viewsFunction.includes("post_view_events") ||
  !viewsFunction.includes("INSERT OR IGNORE INTO post_view_events") ||
  !viewEventsMigration.includes("post_view_events")
) {
  failures.push("Views API must enforce server-side daily view dedupe with a post_view_events migration.");
}
if (!viewsFunction.includes("DELETE FROM post_view_events WHERE viewed_on < ?")) {
  failures.push("Views API must prune old post_view_events rows.");
}
for (const requiredHeader of [
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "X-Frame-Options: DENY",
  "connect-src 'self' https://giscus.app https://*.giscus.app",
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
if (!/^\/rss\s+\/rss\.xml\s+301$/m.test(redirects) || !/^\/feed\.xml\s+\/rss\.xml\s+301$/m.test(redirects)) {
  failures.push("Cloudflare redirects must expose RSS aliases for /rss and /feed.xml.");
}
if (!previewScript.includes("loadRedirects") || !previewScript.includes("_redirects")) {
  failures.push("Preview server must read dist/_redirects.");
}
if (!testPreviewScript.includes('"/rss"') || !testPreviewScript.includes('"/feed.xml"') || !testPreviewScript.includes('redirect: "manual"')) {
  failures.push("Preview tests must verify RSS alias redirects.");
}
if (manifest.name !== "SOLUS Dev Notes") failures.push("site.webmanifest name must match the site title.");
if (manifest.short_name !== "SOLUS") failures.push("site.webmanifest short_name must be SOLUS.");
if (manifest.description !== site.description) failures.push("site.webmanifest description must match the localized site description.");
if (manifest.id !== "/") failures.push("site.webmanifest id must be stable at the site root.");
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
if (packageConfig.scripts?.["test:theme"] !== "node scripts/test-theme-init.js") {
  failures.push("package scripts must expose test:theme.");
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
if (
  !newPostScript.includes("--slug <slug>") ||
  !newPostScript.includes("--date <YYYY-MM-DD>") ||
  !newPostScript.includes("--updated <YYYY-MM-DD>") ||
  !newPostScript.includes("--cover <path>") ||
  !newPostScript.includes("isCanonicalSlug") ||
  !newPostScript.includes("isValidDate") ||
  !newPostScript.includes("isAssetPath") ||
  !newPostScript.includes("localAssetExists") ||
  !newPostScript.includes("defaultPostCategory") ||
  !newPostScript.includes("const category = options.category || defaultCategory") ||
  !testNewPostScript.includes('defaultPostCategory: "工具链"') ||
  !blogOperationsDocs.includes("`defaultPostCategory`") ||
  !blogOperationsDocs.includes("--slug unity-performance")
) {
  failures.push("New post workflow must support explicit canonical slugs, dates, and covers.");
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
if (!site.defaultPostCategory || !knownCategories.has(site.defaultPostCategory)) {
  failures.push("content/site.json defaultPostCategory must exist in categoryCovers.");
}

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
  if (slug && !isCanonicalSlug(slug)) {
    failures.push(`${file} slug must use lowercase English letters, numbers, and single hyphens.`);
  }
  if (!isDate(data.date)) failures.push(`${file} is missing YYYY-MM-DD date.`);
  if (isDate(data.date) && slug && isCanonicalSlug(slug)) {
    const expectedFile = `${data.date}-${slug}.md`;
    if (file !== expectedFile) {
      failures.push(`${file} filename must match its date and slug: ${expectedFile}.`);
    }
  }
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
    if (ref.isImage && !ref.label.trim()) {
      failures.push(`${file} markdown image needs descriptive alt text: ${ref.raw}`);
    }

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
