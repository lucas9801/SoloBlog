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

function checkSocialMeta(file, html) {
  const relative = displayPath(file);
  for (const property of ["og:image", "og:image:secure_url", "twitter:image"]) {
    const value = html.match(new RegExp(`<meta\\s+(?:property|name)="${property}"\\s+content="([^"]+)"`))?.[1];
    if (!value) {
      failures.push(`${relative} is missing ${property}.`);
      continue;
    }
    checkSiteUrl(`${relative} ${property}`, value);
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

async function checkSearchIndex(searchIndex) {
  if (!Array.isArray(searchIndex)) {
    failures.push("dist/search-index.json must be a JSON array.");
    return;
  }

  const seen = new Set();
  for (const item of searchIndex) {
    if (!item?.title || !item?.slug || !item?.url) {
      failures.push("dist/search-index.json items must include title, slug, and url.");
      continue;
    }
    if (seen.has(item.slug)) failures.push(`dist/search-index.json contains duplicate slug: ${item.slug}`);
    seen.add(item.slug);
    if (!(await localTargetExists(item.url))) {
      failures.push(`dist/search-index.json references missing post URL: ${item.url}`);
    }
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
  await checkSearchIndex(searchIndex);

  const rss = await readFile(path.join(dist, "rss.xml"), "utf8").catch(() => "");
  await checkRss(rss);

  const sitemap = await readFile(path.join(dist, "sitemap.xml"), "utf8").catch(() => "");
  await checkSitemap(sitemap);

  const files = await htmlFiles();
  for (const file of files) {
    const html = await readFile(file, "utf8");
    const relative = displayPath(file);

    if (/pages\.dev/i.test(html)) failures.push(`${relative} must not contain a pages.dev URL.`);
    if (/javascript:|data:text\/html/i.test(html)) failures.push(`${relative} contains an unsafe URL scheme.`);
    if (/\son(?:click|error|load|mouseover)=/i.test(html)) failures.push(`${relative} contains an inline event handler.`);
    if (html.includes("@@INLINE_HTML_")) failures.push(`${relative} contains an unreplaced inline token.`);
    if (html.includes("/assets/hero-game-tech.png")) failures.push(`${relative} references the retired hero PNG.`);
    if (/<a\b[^>]*\saria-hidden="true"/i.test(html)) failures.push(`${relative} contains an aria-hidden link.`);
    if (relative.startsWith("dist/posts/") && html.includes("/src/views.js")) {
      failures.push(`${relative} loads views.js even though article.js handles article views.`);
    }

    checkRobots(file, html);
    checkCanonical(file, html);
    checkSocialMeta(file, html);
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
