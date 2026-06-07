import { mkdir, writeFile } from "node:fs/promises";
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

const now = new Date();
const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
const date = localDate.toISOString().slice(0, 10);
const slug = slugify(title);
const file = path.join(process.cwd(), "content", "posts", `${date}-${slug}.md`);

const template = `---
title: ${title}
slug: ${slug}
date: ${date}
category: 未分类
tags: []
summary: 这里写一句文章摘要。
cover: /assets/hero-game-tech.png
status: draft
---

从这里开始写正文。

## 小标题

正文内容。
`;

await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, template, "utf8");

console.log(`Created ${file}`);
console.log("Edit it, change status to published, then run: npm run build");
