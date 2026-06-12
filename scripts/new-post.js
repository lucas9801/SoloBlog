import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const title = process.argv.slice(2).join(" ").trim();

if (!title) {
  console.error('Usage: npm run new:post -- "文章标题"');
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

function parseFrontMatterValue(value) {
  return value.replace(/^["']|["']$/g, "");
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
const usedSlugs = await existingSlugs(postsDir);
const baseSlug = slugify(title);
let slug = baseSlug;
let suffix = 2;
let file = path.join(postsDir, `${date}-${slug}.md`);
while (usedSlugs.has(slug) || (await fileExists(file))) {
  slug = `${baseSlug}-${suffix}`;
  file = path.join(postsDir, `${date}-${slug}.md`);
  suffix += 1;
}

const template = `---
title: ${title}
slug: ${slug}
date: ${date}
category: 未分类
tags: []
# series: 专题名称
# seriesOrder: 1
summary: 这里写一句文章摘要。
status: draft
---

从这里开始写正文。

## 小标题

正文内容。
`;

await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, template, { encoding: "utf8", flag: "wx" });

console.log(`Created ${file}`);
console.log("Edit it, change status to published, then run: npm run build");
