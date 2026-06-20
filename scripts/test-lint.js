import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
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
  for (const dir of ["content", "src", "scripts", "public", "assets", "docs", "functions", "migrations", ".github"]) {
    await cp(path.join(root, dir), path.join(target, dir), { recursive: true });
  }
  for (const file of ["package.json", "wrangler.toml", ".node-version", "README.md", "index.html"]) {
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

  const siteConfigPath = path.join(tempRoot, "content", "site.json");
  const siteConfig = JSON.parse(await readFile(siteConfigPath, "utf8"));
  await writeFile(
    siteConfigPath,
    JSON.stringify(
      {
        ...siteConfig,
        navigation: [
          ...siteConfig.navigation.slice(0, 2),
          { label: "专题", href: "/series/" },
          ...siteConfig.navigation.slice(2)
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  result = await runLint(tempRoot);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Series pages should stay available through sidebars/);
  await writeFile(siteConfigPath, JSON.stringify(siteConfig, null, 2), "utf8");

  const rootIndexPath = path.join(tempRoot, "index.html");
  const rootIndex = await readFile(rootIndexPath, "utf8");
  await writeFile(rootIndexPath, rootIndex.replace("SOLUS Dev Notes", "My Game Dev Blog"), "utf8");
  result = await runLint(tempRoot);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /initial template naming/);
  await writeFile(rootIndexPath, rootIndex, "utf8");

  const blogOperationsPath = path.join(tempRoot, "docs", "blog-operations.md");
  const blogOperations = await readFile(blogOperationsPath, "utf8");
  await writeFile(
    blogOperationsPath,
    `${blogOperations}

\`\`\`powershell
npm run new:post -- "中文文章标题"
\`\`\`

\`\`\`yaml
slug: unity-性能优化记录
\`\`\`
`,
    "utf8"
  );
  result = await runLint(tempRoot);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Chinese-title new:post commands must include an English --slug/);
  assert.match(result.stderr, /documented slug examples must use canonical English slugs/);
  await writeFile(blogOperationsPath, blogOperations, "utf8");

  const coversDir = path.join(tempRoot, "assets", "posts");
  const firstCover = (await readdir(coversDir)).find((file) => file.endsWith(".svg"));
  assert.ok(firstCover, "fixture should include at least one post cover");
  const coverPath = path.join(coversDir, firstCover);
  const cover = await readFile(coverPath, "utf8");
  await writeFile(coverPath, cover.replace("SOLUS DEV NOTES", "SOLUS ARCHIVE"), "utf8");
  result = await runLint(tempRoot);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /current SOLUS wording/);
  await writeFile(coverPath, cover, "utf8");

  const categoryCoversDir = path.join(tempRoot, "assets", "categories");
  const firstCategoryCover = (await readdir(categoryCoversDir)).find((file) => file.endsWith(".svg"));
  assert.ok(firstCategoryCover, "fixture should include at least one category cover");
  const categoryCoverPath = path.join(categoryCoversDir, firstCategoryCover);
  const categoryCover = await readFile(categoryCoverPath, "utf8");
  await writeFile(categoryCoverPath, categoryCover.replace("</defs>", '<linearGradient id="old"></linearGradient></defs>'), "utf8");
  result = await runLint(tempRoot);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Category covers must use the restrained SOLUS technical channel system/);
  await writeFile(categoryCoverPath, categoryCover, "utf8");

  const postsDir = path.join(tempRoot, "content", "posts");
  const firstPost = (await readdir(postsDir)).find((file) => file.endsWith(".md"));
  assert.ok(firstPost, "fixture should include at least one post");

  const postPath = path.join(postsDir, firstPost);
  const wrongPostPath = path.join(postsDir, `wrong-name-${firstPost}`);
  await rename(postPath, wrongPostPath);
  result = await runLint(tempRoot);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /filename must match its date and slug/);
  await rename(wrongPostPath, postPath);

  const tomorrow = localDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const brokenPost = (await readFile(postPath, "utf8"))
    .replace(/^date: .+$/m, `date: ${tomorrow}`)
    .replace(/^slug: .+$/m, "slug: Bad Slug")
    .replace(/^category: .+$/m, "category: 模板分类")
    .replace(/^tags: .+$/m, "tags: [Unity, Unity, #Profiler]")
    .replace(/\s*$/, "\n\n[bad](javascript:alert(1)) and [relative](notes/relative-path).\n\n![](/assets/og/solus-og.png)\n");
  await writeFile(postPath, brokenPost, "utf8");

  result = await runLint(tempRoot);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /published date cannot be in the future/);
  assert.match(result.stderr, /slug must use lowercase English letters/);
  assert.match(result.stderr, /category "模板分类" must be declared/);
  assert.match(result.stderr, /duplicates tag "Unity"/);
  assert.match(result.stderr, /tag "#Profiler" must not start with #/);
  assert.match(result.stderr, /markdown link uses unsupported URL scheme "javascript"/);
  assert.match(result.stderr, /markdown link uses a rootless relative URL/);
  assert.match(result.stderr, /markdown image needs descriptive alt text/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Lint fixture tests passed.");
