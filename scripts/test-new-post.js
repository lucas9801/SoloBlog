import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const node = process.execPath;
const title = 'Unity: Render "A/B" #1';

function runNewPost(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(node, [path.join(root, "scripts", "new-post.js"), ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function frontMatterValue(markdown, key) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return "";
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    if (line.slice(0, separator).trim() === key) {
      return line.slice(separator + 1).trim();
    }
  }
  return "";
}

function parseJsonString(value) {
  return JSON.parse(value);
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "solus-new-post-"));

try {
  let result = await runNewPost(tempRoot, []);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Usage:/);

  result = await runNewPost(tempRoot, [title]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /npm run check:all/);

  result = await runNewPost(tempRoot, [title]);
  assert.equal(result.code, 0);

  const postsDir = path.join(tempRoot, "content", "posts");
  const files = (await readdir(postsDir)).filter((file) => file.endsWith(".md")).sort();
  assert.equal(files.length, 2);
  assert.notEqual(files[0], files[1]);

  const posts = await Promise.all(files.map((file) => readFile(path.join(postsDir, file), "utf8")));
  const bySlug = new Map(posts.map((post) => [parseJsonString(frontMatterValue(post, "slug")), post]));
  assert.deepEqual([...bySlug.keys()].sort(), ["unity-render-a-b-1", "unity-render-a-b-1-2"]);

  for (const post of bySlug.values()) {
    assert.equal(parseJsonString(frontMatterValue(post, "title")), title);
    assert.equal(frontMatterValue(post, "status"), "draft");
    assert.equal(frontMatterValue(post, "category"), "未分类");
    assert.match(post, /## 小标题/);
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("New post tests passed.");
