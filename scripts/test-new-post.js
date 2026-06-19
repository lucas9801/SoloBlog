import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
  await mkdir(path.join(tempRoot, "content"), { recursive: true });
  await mkdir(path.join(tempRoot, "assets", "posts"), { recursive: true });
  await writeFile(
    path.join(tempRoot, "assets", "posts", "custom-cover.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
    "utf8"
  );
  await writeFile(
    path.join(tempRoot, "content", "site.json"),
    JSON.stringify({
      defaultPostCategory: "工具链",
      categoryCovers: {
        Unity: "/assets/posts/unity.svg",
        工具链: "/assets/posts/toolchain.svg"
      }
    }),
    "utf8"
  );

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
    assert.equal(parseJsonString(frontMatterValue(post, "category")), "工具链");
    assert.match(post, /## 小标题/);
  }

  result = await runNewPost(tempRoot, [
    "Unity 性能预算",
    "--category",
    "Unity",
    "--tags",
    "#Unity, 性能，Profiler, unity",
    "--summary",
    "建立 Unity 性能分析入口。",
    "--slug",
    "unity-performance-budget",
    "--date",
    "2026-01-02",
    "--updated",
    "2026-01-03",
    "--cover",
    "/assets/posts/custom-cover.svg",
    "--series",
    "性能与渲染排查",
    "--series-order",
    "3",
    "--featured"
  ]);
  assert.equal(result.code, 0);

  const updatedFiles = (await readdir(postsDir)).filter((file) => file.endsWith(".md")).sort();
  assert.equal(updatedFiles.length, 3);
  const optionPost = (
    await Promise.all(updatedFiles.map((file) => readFile(path.join(postsDir, file), "utf8")))
  ).find((post) => parseJsonString(frontMatterValue(post, "title")) === "Unity 性能预算");
  assert.ok(optionPost);
  assert.equal(parseJsonString(frontMatterValue(optionPost, "slug")), "unity-performance-budget");
  assert.equal(frontMatterValue(optionPost, "date"), "2026-01-02");
  assert.equal(frontMatterValue(optionPost, "updated"), "2026-01-03");
  assert.equal(parseJsonString(frontMatterValue(optionPost, "category")), "Unity");
  assert.deepEqual(JSON.parse(frontMatterValue(optionPost, "tags")), ["Unity", "性能", "Profiler"]);
  assert.equal(parseJsonString(frontMatterValue(optionPost, "summary")), "建立 Unity 性能分析入口。");
  assert.equal(parseJsonString(frontMatterValue(optionPost, "cover")), "/assets/posts/custom-cover.svg");
  assert.equal(parseJsonString(frontMatterValue(optionPost, "series")), "性能与渲染排查");
  assert.equal(frontMatterValue(optionPost, "seriesOrder"), "3");
  assert.equal(frontMatterValue(optionPost, "featured"), "true");
  assert.equal(frontMatterValue(optionPost, "status"), "draft");

  result = await runNewPost(tempRoot, ["Bad Category", "--category", "Unknown"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown category/);

  result = await runNewPost(tempRoot, ["Bad Series", "--series-order", "0"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /positive integer/);

  result = await runNewPost(tempRoot, ["Series Order Without Series", "--series-order", "1"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /requires --series/);

  result = await runNewPost(tempRoot, ["Bad Slug", "--slug", "Bad Slug"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /lowercase English/);

  result = await runNewPost(tempRoot, ["Duplicate Slug", "--slug", "unity-performance-budget"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Slug already exists/);

  result = await runNewPost(tempRoot, ["Bad Date", "--date", "2026-02-31"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /valid YYYY-MM-DD/);

  result = await runNewPost(tempRoot, ["Bad Updated", "--date", "2026-02-02", "--updated", "2026-02-01"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /cannot be earlier/);

  result = await runNewPost(tempRoot, ["Remote Cover", "--cover", "https://example.com/cover.png"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /local \/assets/);

  result = await runNewPost(tempRoot, ["Backslash Cover", "--cover", "/assets/posts\\cover.svg"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /local \/assets/);

  result = await runNewPost(tempRoot, ["Missing Cover", "--cover", "/assets/posts/missing.svg"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Cover file does not exist/);

  await writeFile(
    path.join(tempRoot, "content", "site.json"),
    JSON.stringify({
      defaultPostCategory: "Unknown",
      categoryCovers: {
        Unity: "/assets/posts/unity.svg",
        工具链: "/assets/posts/toolchain.svg"
      }
    }),
    "utf8"
  );
  result = await runNewPost(tempRoot, ["Fallback Category", "--slug", "fallback-category"]);
  assert.equal(result.code, 0);
  assert.match(result.stderr, /defaultPostCategory is unknown/);
  const fallbackFiles = (await readdir(postsDir)).filter((file) => file.endsWith("fallback-category.md"));
  assert.equal(fallbackFiles.length, 1);
  const fallbackPost = await readFile(path.join(postsDir, fallbackFiles[0]), "utf8");
  assert.equal(parseJsonString(frontMatterValue(fallbackPost, "category")), "Unity");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("New post tests passed.");
