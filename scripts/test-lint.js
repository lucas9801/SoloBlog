import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const node = process.execPath;

function runLint(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(node, [path.join(root, "scripts", "lint.js")], {
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

async function copyFixtureProject(target) {
  for (const dir of ["content", "src", "scripts", "public", "assets", "docs", "functions", "migrations"]) {
    await cp(path.join(root, dir), path.join(target, dir), { recursive: true });
  }
  for (const file of ["package.json", "wrangler.toml", ".node-version"]) {
    await cp(path.join(root, file), path.join(target, file));
  }
}

function localDateString(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "solus-lint-"));

try {
  await copyFixtureProject(tempRoot);

  let result = await runLint(tempRoot);
  assert.equal(result.code, 0, result.stderr || result.stdout);

  const postsDir = path.join(tempRoot, "content", "posts");
  const firstPost = (await readdir(postsDir)).find((file) => file.endsWith(".md"));
  assert.ok(firstPost, "fixture should include at least one post");

  const postPath = path.join(postsDir, firstPost);
  const tomorrow = localDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const brokenPost = (await readFile(postPath, "utf8"))
    .replace(/^date: .+$/m, `date: ${tomorrow}`)
    .replace(/^category: .+$/m, "category: 模板分类")
    .replace(/^tags: .+$/m, "tags: [Unity, Unity, #Profiler]")
    .replace(/\s*$/, "\n\n[bad](javascript:alert(1)) and [relative](notes/relative-path).\n");
  await writeFile(postPath, brokenPost, "utf8");

  result = await runLint(tempRoot);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /published date cannot be in the future/);
  assert.match(result.stderr, /category "模板分类" must be declared/);
  assert.match(result.stderr, /duplicates tag "Unity"/);
  assert.match(result.stderr, /tag "#Profiler" must not start with #/);
  assert.match(result.stderr, /markdown link uses unsupported URL scheme "javascript"/);
  assert.match(result.stderr, /markdown link uses a rootless relative URL/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Lint fixture tests passed.");
