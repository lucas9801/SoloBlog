import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const options = {
  category: "未分类",
  tags: [],
  summary: "这里写一句文章摘要。",
  series: "",
  seriesOrder: "",
  slug: "",
  date: "",
  updated: "",
  cover: "",
  featured: false
};
const titleParts = [];

function usage() {
  return `Usage: npm run new:post -- "文章标题" [options]

Options:
  --category <name>       设置分类，例如 Unity
  --tags <a,b,c>          设置标签，使用逗号分隔
  --summary <text>        设置摘要
  --slug <slug>           设置英文 URL slug，例如 unity-performance-budget
  --date <YYYY-MM-DD>     设置发布日期
  --updated <YYYY-MM-DD>  设置更新日期
  --cover <path>          设置封面路径，例如 /assets/posts/unity-budget.svg
  --series <name>         设置专题名称
  --series-order <number> 设置专题内排序
  --featured             标记为推荐阅读`;
}

function readOptionValue(flag, index) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`${flag} requires a value.`);
    console.error(usage());
    process.exit(1);
  }
  return value;
}

function splitList(value) {
  return String(value || "")
    .split(/[，,;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (!arg.startsWith("--")) {
    titleParts.push(arg);
    continue;
  }

  if (arg === "--help" || arg === "-h") {
    console.log(usage());
    process.exit(0);
  }
  if (arg === "--featured") {
    options.featured = true;
    continue;
  }
  if (arg === "--category") {
    options.category = readOptionValue(arg, index).trim();
    index += 1;
    continue;
  }
  if (arg === "--tags" || arg === "--tag") {
    options.tags = splitList(readOptionValue(arg, index));
    index += 1;
    continue;
  }
  if (arg === "--summary") {
    options.summary = readOptionValue(arg, index).trim();
    index += 1;
    continue;
  }
  if (arg === "--slug") {
    options.slug = readOptionValue(arg, index).trim();
    index += 1;
    continue;
  }
  if (arg === "--date") {
    options.date = readOptionValue(arg, index).trim();
    index += 1;
    continue;
  }
  if (arg === "--updated") {
    options.updated = readOptionValue(arg, index).trim();
    index += 1;
    continue;
  }
  if (arg === "--cover") {
    options.cover = readOptionValue(arg, index).trim();
    index += 1;
    continue;
  }
  if (arg === "--series") {
    options.series = readOptionValue(arg, index).trim();
    index += 1;
    continue;
  }
  if (arg === "--series-order") {
    options.seriesOrder = readOptionValue(arg, index).trim();
    index += 1;
    continue;
  }

  console.error(`Unknown option: ${arg}`);
  console.error(usage());
  process.exit(1);
}

const title = titleParts.join(" ").trim();

if (!title) {
  console.error(usage());
  process.exit(1);
}

if (options.seriesOrder && (!/^\d+$/.test(options.seriesOrder) || Number.parseInt(options.seriesOrder, 10) <= 0)) {
  console.error("--series-order must be a positive integer.");
  process.exit(1);
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "new-post";
}

function isCanonicalSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ""));
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isAssetPath(value) {
  const pathname = String(value || "").trim();
  if (!pathname.startsWith("/assets/")) return false;
  if (/[?#\\\u0000-\u001f\u007f]/.test(pathname)) return false;
  return pathname
    .split("/")
    .slice(1)
    .every((segment) => segment && segment !== "." && segment !== "..");
}

function parseFrontMatterValue(value) {
  return value.replace(/^["']|["']$/g, "");
}

function yamlString(value) {
  return JSON.stringify(String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
}

function yamlArray(values) {
  return `[${values.map(yamlString).join(", ")}]`;
}

function parseSlug(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return "";
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (key !== "slug") continue;
    return parseFrontMatterValue(line.slice(separator + 1).trim());
  }
  return "";
}

async function existingSlugs(postsDir) {
  const files = await readdir(postsDir).catch(() => []);
  const slugs = new Set();
  for (const file of files.filter((item) => item.endsWith(".md"))) {
    const raw = await readFile(path.join(postsDir, file), "utf8");
    const slug = parseSlug(raw);
    if (slug) slugs.add(slug);
  }
  return slugs;
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function localAssetExists(urlPath) {
  if (!isAssetPath(urlPath)) return false;
  return fileExists(path.join(process.cwd(), urlPath.replace(/^\/+/, "")));
}

const now = new Date();
const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
const date = options.date || localDate.toISOString().slice(0, 10);
if (!isValidDate(date)) {
  console.error("--date must use a valid YYYY-MM-DD date.");
  process.exit(1);
}
if (options.updated && !isValidDate(options.updated)) {
  console.error("--updated must use a valid YYYY-MM-DD date.");
  process.exit(1);
}
if (options.updated && options.updated < date) {
  console.error("--updated cannot be earlier than --date.");
  process.exit(1);
}
if (options.cover && !isAssetPath(options.cover)) {
  console.error("--cover must point to a local /assets/... file.");
  process.exit(1);
}
if (options.cover && !(await localAssetExists(options.cover))) {
  console.error(`Cover file does not exist: ${options.cover}`);
  process.exit(1);
}
const postsDir = path.join(process.cwd(), "content", "posts");
const siteConfigPath = path.join(process.cwd(), "content", "site.json");
const knownCategories = await readFile(siteConfigPath, "utf8")
  .then((raw) => new Set(Object.keys(JSON.parse(raw).categoryCovers || {})))
  .catch(() => new Set());

if (
  options.category &&
  options.category !== "未分类" &&
  knownCategories.size > 0 &&
  !knownCategories.has(options.category)
) {
  console.error(`Unknown category: ${options.category}`);
  console.error(`Known categories: ${[...knownCategories].join(", ")}`);
  process.exit(1);
}

const usedSlugs = await existingSlugs(postsDir);
const baseSlug = options.slug || slugify(title);
if (options.slug && !isCanonicalSlug(options.slug)) {
  console.error("--slug must use lowercase English letters, numbers, and single hyphens.");
  process.exit(1);
}
if (options.slug && usedSlugs.has(options.slug)) {
  console.error(`Slug already exists: ${options.slug}`);
  process.exit(1);
}
let slug = baseSlug;
let suffix = 2;
let file = path.join(postsDir, `${date}-${slug}.md`);
while (!options.slug && (usedSlugs.has(slug) || (await fileExists(file)))) {
  slug = `${baseSlug}-${suffix}`;
  file = path.join(postsDir, `${date}-${slug}.md`);
  suffix += 1;
}
if (options.slug && (await fileExists(file))) {
  console.error(`Post file already exists: ${file}`);
  process.exit(1);
}

const frontMatter = [
  "---",
  `title: ${yamlString(title)}`,
  `slug: ${yamlString(slug)}`,
  `date: ${date}`,
  options.updated ? `updated: ${options.updated}` : "",
  `category: ${options.category === "未分类" ? options.category : yamlString(options.category)}`,
  `tags: ${yamlArray(options.tags)}`,
  options.series ? `series: ${yamlString(options.series)}` : "# series: 专题名称",
  options.seriesOrder ? `seriesOrder: ${Number.parseInt(options.seriesOrder, 10)}` : "# seriesOrder: 1",
  `summary: ${yamlString(options.summary)}`,
  options.cover ? `cover: ${yamlString(options.cover)}` : "# cover: /assets/posts/example.svg",
  options.featured ? "featured: true" : "",
  "status: draft",
  "---"
].filter(Boolean);

const template = `${frontMatter.join("\n")}

从这里开始写正文。

## 小标题

正文内容。
`;

await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, template, { encoding: "utf8", flag: "wx" });

console.log(`Created ${file}`);
console.log("Edit it, change status to published, then run: npm run check:all");
