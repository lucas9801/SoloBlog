import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter, setFrontmatterField } from "./frontmatter.js";

const root = process.cwd();
const postsDir = path.join(root, "content", "posts");

export async function findArticles(options) {
  const files = await postFiles();

  if (options.file) {
    const filePath = path.resolve(root, options.file);
    return [await readArticle(filePath)];
  }

  const articles = await Promise.all(files.map(readArticle));

  if (options.slug) {
    const article = articles.find((item) => item.slug === options.slug);
    if (!article) throw new Error(`No post found for slug: ${options.slug}`);
    return [article];
  }

  if (options.all) return articles;

  throw new Error("Select a post with --slug, --file, or --all.");
}

export async function readArticle(filePath) {
  const source = await readFile(filePath, "utf8");
  const parsed = parseFrontmatter(source);
  if (!parsed.hasFrontmatter) {
    throw new Error(`${path.relative(root, filePath)} is missing frontmatter.`);
  }

  const data = parsed.data;
  const slug = data.slug || slugify(data.title || path.basename(filePath, ".md"));
  if (!slug) throw new Error(`${path.relative(root, filePath)} has no slug.`);

  return {
    filePath,
    source,
    body: parsed.body,
    data,
    slug,
    title: String(data.title || slug),
    category: String(data.category || "随笔"),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    summary: String(data.summary || ""),
    date: String(data.date || "")
  };
}

export async function writeArticleCover(article, coverPath) {
  const nextSource = setFrontmatterField(article.source, "cover", coverPath);
  await writeFile(article.filePath, nextSource, "utf8");
}

async function postFiles(dir = postsDir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return postFiles(fullPath);
      if (entry.isFile() && entry.name.endsWith(".md")) return [fullPath];
      return [];
    })
  );
  return files.flat().sort((a, b) => a.localeCompare(b));
}

function slugify(value = "") {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `post-${Date.now().toString(36)}`;
}
