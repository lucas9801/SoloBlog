import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const failures = [];
const site = JSON.parse(await readFile(path.join(root, "content", "site.json"), "utf8"));
const siteBaseUrl = new URL(site.baseUrl);
const siteOrigin = siteBaseUrl.origin;
const absoluteSiteRoot = new URL("/", siteBaseUrl).toString();

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

function tagAttributes(tag) {
  const attributes = new Map();
  for (const match of tag.matchAll(/\s([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function hasToken(value = "", token) {
  return String(value).split(/\s+/).includes(token);
}

function localPathFromUrl(value) {
  if (!value || value.startsWith("#") || value.startsWith("mailto:")) return "";
  if (value.startsWith("/api/")) return "";

  try {
    const url = new URL(value, absoluteSiteRoot);
    if (url.origin !== siteOrigin) return "";
    if (url.pathname.startsWith("/api/")) return "";
    return decodeURIComponent(url.pathname);
  } catch {
    return "";
  }
}

async function localTargetExists(pathname) {
  if (!pathname) return true;
  let clean = pathname.replace(/^\/+/, "");
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // Keep the original path if it is not valid percent-encoding.
  }
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

function checkDocumentBasics(file, html) {
  const relative = displayPath(file);
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0];
  if (!htmlTag) {
    failures.push(`${relative} is missing an html element.`);
  } else if (!tagAttributes(htmlTag).get("lang")?.trim()) {
    failures.push(`${relative} html element must include a lang attribute.`);
  }

  const titles = [...html.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map((match) => match[1].trim());
  if (titles.length !== 1) {
    failures.push(`${relative} must contain exactly one title element.`);
  } else if (!titles[0]) {
    failures.push(`${relative} title element must not be empty.`);
  }

  const descriptions = [...html.matchAll(/<meta\s+name="description"\s+content="([^"]*)"/gi)].map((match) =>
    match[1].trim()
  );
  if (descriptions.length !== 1) {
    failures.push(`${relative} must contain exactly one meta description.`);
  } else if (!descriptions[0]) {
    failures.push(`${relative} meta description must not be empty.`);
  }

  const h1Count = [...html.matchAll(/<h1\b[^>]*>/gi)].length;
  if (h1Count !== 1) failures.push(`${relative} must contain exactly one h1 element.`);
}

function pagePathFromFile(file) {
  const relative = path.relative(dist, file).replaceAll("\\", "/");
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"index.html".length)}`;
  return `/${relative}`;
}

function isValidDate(value) {
  return !Number.isNaN(Date.parse(value));
}

function checkSiteUrl(name, value) {
  try {
    const url = new URL(value);
    if (url.origin !== siteOrigin) failures.push(`${name} must use ${siteOrigin}: ${value}`);
    if (/pages\.dev/i.test(url.hostname)) failures.push(`${name} must not use a pages.dev URL: ${value}`);
    return url;
  } catch {
    failures.push(`${name} is not a valid URL: ${value}`);
    return null;
  }
}

function checkCanonical(file, html) {
  const relative = displayPath(file);
  const canonicals = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"/g)].map((match) => match[1]);
  if (canonicals.length !== 1) {
    failures.push(`${relative} must contain exactly one canonical link.`);
    return;
  }

  const canonicalUrl = checkSiteUrl(`${relative} canonical`, canonicals[0]);
  if (!canonicalUrl) return;

  const expected = new URL(pagePathFromFile(file), absoluteSiteRoot).toString();
  if (canonicalUrl.toString() !== expected) {
    failures.push(`${relative} canonical must match its output path: expected ${expected}, got ${canonicalUrl}`);
  }

  const ogUrl = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/)?.[1];
  if (ogUrl !== canonicalUrl.toString()) {
    failures.push(`${relative} og:url must match canonical URL.`);
  }
}

function checkSearchDiscovery(file, html) {
  const relative = displayPath(file);
  const links = [...html.matchAll(/<link\s+rel="search"\s+type="application\/opensearchdescription\+xml"\s+title="([^"]+)"\s+href="([^"]+)"/g)];
  if (links.length !== 1) {
    failures.push(`${relative} must contain exactly one OpenSearch discovery link.`);
    return;
  }

  const href = links[0][2];
  if (href !== "/opensearch.xml") failures.push(`${relative} OpenSearch discovery link must point to /opensearch.xml.`);
}

async function checkSocialMeta(file, html) {
  const relative = displayPath(file);
  for (const property of ["og:image", "og:image:secure_url", "twitter:image"]) {
    const value = html.match(new RegExp(`<meta\\s+(?:property|name)="${property}"\\s+content="([^"]+)"`))?.[1];
    if (!value) {
      failures.push(`${relative} is missing ${property}.`);
      continue;
    }
    const url = checkSiteUrl(`${relative} ${property}`, value);
    if (url?.origin === siteOrigin && !(await localTargetExists(url.pathname))) {
      failures.push(`${relative} ${property} references missing local target: ${value}`);
    }
  }

  for (const property of ["og:image:alt", "twitter:image:alt"]) {
    const value = html.match(new RegExp(`<meta\\s+(?:property|name)="${property}"\\s+content="([^"]*)"`))?.[1];
    if (!value?.trim()) failures.push(`${relative} is missing ${property}.`);
  }
}

function checkRobots(file, html) {
  const relative = displayPath(file);
  const robots = html.match(/<meta\s+name="robots"\s+content="([^"]+)"/)?.[1];
  if (!robots) failures.push(`${relative} is missing a robots meta tag.`);
  if (relative === "dist/404.html" && robots !== "noindex,follow") {
    failures.push("dist/404.html must be marked noindex,follow.");
  }
  if (relative !== "dist/404.html" && robots?.includes("noindex")) {
    failures.push(`${relative} should not be noindex.`);
  }
}

function checkInlineScripts(file, html) {
  const relative = displayPath(file);
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = match[1] || "";
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (/\btype\s*=\s*"application\/ld\+json"/i.test(attrs)) continue;
    failures.push(`${relative} contains an inline executable script.`);
  }
}

function isArticleContentImage(html, index) {
  const articleContent = html.lastIndexOf('<div class="article-content"', index);
  if (articleContent === -1) return false;

  const articleFooter = html.lastIndexOf('<footer class="article-footer"', index);
  const articleEnd = html.lastIndexOf("</article>", index);
  return articleContent > Math.max(articleFooter, articleEnd);
}

function checkImages(file, html) {
  const relative = displayPath(file);
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const attrs = tagAttributes(tag);
    const src = attrs.get("src") || "";
    const className = attrs.get("class") || "";
    const isHero = hasToken(className, "hero-cover");
    const isCoverImage =
      isHero ||
      html.lastIndexOf('class="thumb', match.index) > html.lastIndexOf("</a>", match.index) ||
      html.lastIndexOf('class="archive-card-thumb', match.index) > html.lastIndexOf("</a>", match.index) ||
      html.lastIndexOf('class="search-result-thumb', match.index) > html.lastIndexOf("</a>", match.index);

    if (!src.trim()) failures.push(`${relative} contains an img without a src.`);
    if (!attrs.has("alt")) {
      failures.push(`${relative} contains an img without an alt attribute: ${src || tag}`);
    } else if (isArticleContentImage(html, match.index) && !attrs.get("alt")?.trim()) {
      failures.push(`${relative} article content image must have descriptive alt text: ${src || tag}`);
    }

    if (attrs.get("decoding") !== "async") {
      failures.push(`${relative} image must use decoding="async": ${src || tag}`);
    }

    if (!isHero && attrs.get("loading") !== "lazy") {
      failures.push(`${relative} non-hero image must use loading="lazy": ${src || tag}`);
    }
    if (isHero && attrs.get("fetchpriority") !== "high") {
      failures.push(`${relative} hero image must use fetchpriority="high": ${src || tag}`);
    }
    if (isCoverImage && (attrs.get("width") !== "1200" || attrs.get("height") !== "675")) {
      failures.push(`${relative} cover images must include 1200x675 dimensions: ${src || tag}`);
    }
  }
}

function checkLinks(file, html) {
  const relative = displayPath(file);
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const tag = match[0];
    const attrs = tagAttributes(tag);
    const href = attrs.get("href");
    if (!href) {
      failures.push(`${relative} contains an anchor without href: ${tag}`);
      continue;
    }

    const target = attrs.get("target") || "";
    const rel = attrs.get("rel") || "";
    if (target === "_blank" && (!hasToken(rel, "noopener") || !hasToken(rel, "noreferrer"))) {
      failures.push(`${relative} target="_blank" link must include rel="noopener noreferrer": ${href}`);
    }

    try {
      const url = new URL(href, absoluteSiteRoot);
      const external = (url.protocol === "http:" || url.protocol === "https:") && url.origin !== siteOrigin;
      if (external && target !== "_blank") {
        failures.push(`${relative} external link should open in a new tab: ${href}`);
      }
      if (external && (!hasToken(rel, "noopener") || !hasToken(rel, "noreferrer"))) {
        failures.push(`${relative} external link must include rel="noopener noreferrer": ${href}`);
      }
    } catch {
      failures.push(`${relative} contains an invalid anchor href: ${href}`);
    }
  }
}

async function checkSitemap(sitemap) {
  if (!sitemap.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')) {
    failures.push("dist/sitemap.xml must declare the sitemap namespace.");
  }

  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  if (locs.length === 0) failures.push("dist/sitemap.xml must contain at least one URL.");

  const seen = new Set();
  for (const loc of locs) {
    if (seen.has(loc)) failures.push(`dist/sitemap.xml contains duplicate URL: ${loc}`);
    seen.add(loc);

    const url = checkSiteUrl("dist/sitemap.xml URL", loc);
    if (!url) continue;

    if (!(await localTargetExists(url.pathname))) {
      failures.push(`dist/sitemap.xml references missing local target: ${loc}`);
    }
  }

  for (const match of sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
    if (!isValidDate(match[1])) failures.push(`dist/sitemap.xml contains invalid lastmod: ${match[1]}`);
  }
}

async function checkRss(rss) {
  if (!rss.includes('xmlns:content="http://purl.org/rss/1.0/modules/content/"')) {
    failures.push("dist/rss.xml must declare the content namespace.");
  }
  if (!rss.includes("<content:encoded><![CDATA[")) {
    failures.push("dist/rss.xml must include full post content.");
  }
  if (/\s(?:href|src)="\//.test(rss)) {
    failures.push("dist/rss.xml must not contain relative local href/src URLs.");
  }

  const self = rss.match(/<atom:link\s+href="([^"]+)"\s+rel="self"\s+type="application\/rss\+xml"\s+\/>/)?.[1];
  const expectedSelf = new URL("/rss.xml", absoluteSiteRoot).toString();
  if (self !== expectedSelf) failures.push(`dist/rss.xml self link must be ${expectedSelf}.`);

  const feedUrls = [
    ...rss.matchAll(/<link>(https?:\/\/[^<]+)<\/link>/g),
    ...rss.matchAll(/<guid\b[^>]*>(https?:\/\/[^<]+)<\/guid>/g)
  ].map((match) => match[1]);
  if (self) feedUrls.push(self);

  for (const urlText of feedUrls) {
    const url = checkSiteUrl("dist/rss.xml URL", urlText);
    if (!url) continue;
    if (!(await localTargetExists(url.pathname))) {
      failures.push(`dist/rss.xml references missing local target: ${urlText}`);
    }
  }

  for (const match of rss.matchAll(/\s(?:href|src)="(https?:\/\/[^"]+)"/g)) {
    const urlText = match[1];
    const url = new URL(urlText);
    if (/pages\.dev/i.test(url.hostname)) failures.push(`dist/rss.xml must not contain a pages.dev URL: ${urlText}`);
    if (url.origin === siteOrigin && !(await localTargetExists(url.pathname))) {
      failures.push(`dist/rss.xml references missing local target: ${urlText}`);
    }
  }

  for (const match of rss.matchAll(/<(?:pubDate|lastBuildDate)>([^<]+)<\/(?:pubDate|lastBuildDate)>/g)) {
    if (!isValidDate(match[1])) failures.push(`dist/rss.xml contains invalid date: ${match[1]}`);
  }
}

async function checkOpenSearch(openSearch) {
  if (!openSearch.includes('<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">')) {
    failures.push("dist/opensearch.xml must declare the OpenSearch namespace.");
  }

  const shortName = openSearch.match(/<ShortName>([^<]+)<\/ShortName>/)?.[1];
  if (!shortName?.trim()) failures.push("dist/opensearch.xml must include a ShortName.");

  const template = openSearch.match(/<Url\b[^>]*\stemplate="([^"]+)"/)?.[1];
  if (!template) {
    failures.push("dist/opensearch.xml must include a search URL template.");
  } else {
    const url = checkSiteUrl("dist/opensearch.xml search template", template.replace("{searchTerms}", "solus"));
    if (url && (url.pathname !== "/search/" || url.searchParams.get("q") !== "solus")) {
      failures.push("dist/opensearch.xml search template must target /search/?q={searchTerms}.");
    }
    if (!template.includes("{searchTerms}")) {
      failures.push("dist/opensearch.xml search template must include {searchTerms}.");
    }
  }

  const image = openSearch.match(/<Image\b[^>]*>([^<]+)<\/Image>/)?.[1];
  if (!image) {
    failures.push("dist/opensearch.xml must include an Image.");
  } else {
    const url = checkSiteUrl("dist/opensearch.xml image", image);
    if (url?.origin === siteOrigin && !(await localTargetExists(url.pathname))) {
      failures.push(`dist/opensearch.xml image references missing local target: ${image}`);
    }
  }

  if (/pages\.dev/i.test(openSearch)) failures.push("dist/opensearch.xml must not contain a pages.dev URL.");
}

async function checkSearchIndex(searchIndex) {
  if (!Array.isArray(searchIndex)) {
    failures.push("dist/search-index.json must be a JSON array.");
    return;
  }

  const seen = new Set();
  let previousDate = "";
  for (const item of searchIndex) {
    if (!item?.title || !item?.slug || !item?.url || !item?.date || !item?.year || !item?.category || !item?.summary) {
      failures.push("dist/search-index.json items must include title, slug, url, date, year, category, and summary.");
      continue;
    }
    if (!isValidDate(item.date)) failures.push(`dist/search-index.json contains invalid post date: ${item.slug}`);
    if (!/^\d{4}$/.test(String(item.year))) failures.push(`dist/search-index.json contains invalid post year: ${item.slug}`);
    if (!Array.isArray(item.tags)) failures.push(`dist/search-index.json item tags must be an array: ${item.slug}`);
    if (typeof item.text !== "string") failures.push(`dist/search-index.json item text must be a string: ${item.slug}`);
    if (!item.readingTime) failures.push(`dist/search-index.json item must include readingTime: ${item.slug}`);
    if (seen.has(item.slug)) failures.push(`dist/search-index.json contains duplicate slug: ${item.slug}`);
    seen.add(item.slug);
    if (previousDate && new Date(item.date) > new Date(previousDate)) {
      failures.push(`dist/search-index.json must be sorted newest first: ${item.slug}`);
    }
    previousDate = item.date;
    if (!(await localTargetExists(item.url))) {
      failures.push(`dist/search-index.json references missing post URL: ${item.url}`);
    }
    if (!(await localTargetExists(`/years/${item.year}/`))) {
      failures.push(`dist/search-index.json references missing year archive: ${item.year}`);
    }
    if (item.cover && !(await localTargetExists(item.cover))) {
      failures.push(`dist/search-index.json references missing post cover: ${item.cover}`);
    }
  }
}

async function main() {
  if (!(await exists(dist))) {
    throw new Error("dist/ does not exist. Run npm run build first.");
  }

  const requiredFiles = ["404.html", "_headers", "robots.txt", "rss.xml", "sitemap.xml", "opensearch.xml", "search-index.json"];
  for (const file of requiredFiles) {
    if (!(await exists(path.join(dist, file)))) failures.push(`Missing dist/${file}`);
  }

  const headers = await readFile(path.join(dist, "_headers"), "utf8").catch(() => "");
  for (const requiredHeader of ["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options: DENY"]) {
    if (!headers.includes(requiredHeader)) failures.push(`dist/_headers is missing ${requiredHeader}`);
  }
  if (/script-src[^;\n]*'unsafe-inline'/.test(headers)) {
    failures.push("dist/_headers script-src must not allow unsafe-inline.");
  }
  if (/style-src[^;\n]*'unsafe-inline'/.test(headers)) {
    failures.push("dist/_headers style-src must not allow unsafe-inline.");
  }

  const searchIndex = await readFile(path.join(dist, "search-index.json"), "utf8")
    .then(JSON.parse)
    .catch(() => null);
  await checkSearchIndex(searchIndex);

  const robots = await readFile(path.join(dist, "robots.txt"), "utf8").catch(() => "");
  const expectedSitemap = `Sitemap: ${new URL("/sitemap.xml", absoluteSiteRoot).toString()}`;
  if (!robots.includes("User-agent: *")) failures.push("dist/robots.txt must include a default user-agent rule.");
  if (!robots.includes("Allow: /")) failures.push("dist/robots.txt must allow the site root.");
  if (!robots.includes(expectedSitemap)) failures.push(`dist/robots.txt must include ${expectedSitemap}.`);
  if (/pages\.dev/i.test(robots)) failures.push("dist/robots.txt must not contain a pages.dev URL.");

  const rss = await readFile(path.join(dist, "rss.xml"), "utf8").catch(() => "");
  await checkRss(rss);

  const openSearch = await readFile(path.join(dist, "opensearch.xml"), "utf8").catch(() => "");
  await checkOpenSearch(openSearch);

  const sitemap = await readFile(path.join(dist, "sitemap.xml"), "utf8").catch(() => "");
  await checkSitemap(sitemap);

  const files = await htmlFiles();
  for (const file of files) {
    const html = await readFile(file, "utf8");
    const relative = displayPath(file);

    if (/pages\.dev/i.test(html)) failures.push(`${relative} must not contain a pages.dev URL.`);
    if (/javascript:|data:text\/html/i.test(html)) failures.push(`${relative} contains an unsafe URL scheme.`);
    if (/\son(?:click|error|load|mouseover)=/i.test(html)) failures.push(`${relative} contains an inline event handler.`);
    if (/\sstyle="/i.test(html)) failures.push(`${relative} contains an inline style attribute.`);
    if (html.includes("@@INLINE_HTML_")) failures.push(`${relative} contains an unreplaced inline token.`);
    if (html.includes("/assets/hero-game-tech.png")) failures.push(`${relative} references the retired hero PNG.`);
    if (/<a\b[^>]*\saria-hidden="true"/i.test(html)) failures.push(`${relative} contains an aria-hidden link.`);
    if (relative.startsWith("dist/posts/") && html.includes("/src/views.js")) {
      failures.push(`${relative} loads views.js even though article.js handles article views.`);
    }
    if (!html.includes("/src/theme-init.js")) failures.push(`${relative} must load the external theme initializer.`);

    checkDocumentBasics(file, html);
    checkInlineScripts(file, html);
    checkImages(file, html);
    checkLinks(file, html);
    checkRobots(file, html);
    checkCanonical(file, html);
    checkSearchDiscovery(file, html);
    await checkSocialMeta(file, html);
    checkHeadingIds(file, html);
    await checkLocalReferences(file, html);
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`Failed: ${failure}`);
    process.exit(1);
  }

  console.log(`Output checks passed for ${files.length} HTML files.`);
}

await main();
