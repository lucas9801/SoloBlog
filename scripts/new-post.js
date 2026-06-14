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

const now = new Date();
const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
const date = localDate.toISOString().slice(0, 10);
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
  `category: ${options.category === "未分类" ? options.category : yamlString(options.category)}`,
  `tags: ${yamlArray(options.tags)}`,
  options.series ? `series: ${yamlString(options.series)}` : "# series: 专题名称",
  options.seriesOrder ? `seriesOrder: ${Number.parseInt(options.seriesOrder, 10)}` : "# seriesOrder: 1",
  `summary: ${yamlString(options.summary)}`,
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
