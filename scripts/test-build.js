import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const node = process.execPath;

function runBuild(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(node, [path.join(root, "scripts", "build.js")], {
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

async function writeFixtureProject(target) {
  await cp(path.join(root, "src"), path.join(target, "src"), { recursive: true });
  await cp(path.join(root, "public"), path.join(target, "public"), { recursive: true });
  await cp(path.join(root, "assets", "og"), path.join(target, "assets", "og"), { recursive: true });
  await mkdir(path.join(target, "assets", "posts"), { recursive: true });
  await mkdir(path.join(target, "content", "posts"), { recursive: true });

  await writeFile(
    path.join(target, "assets", "posts", "inline.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
    "utf8"
  );
  await writeFile(
    path.join(target, "content", "about.md"),
    `---\ntitle: 关于\nsummary: 测试关于页。\n---\n\n这是关于页。\n`,
    "utf8"
  );
  await writeFile(
    path.join(target, "content", "site.json"),
    JSON.stringify(
      {
        title: "SOLUS Dev Notes",
        brand: "SOLUS",
        tagline: "Game Development Archive",
        description: "测试博客。",
        baseUrl: "https://blog.solus.games/",
        language: "zh-CN",
        postsPerPage: 9,
        archivePostsPerPage: 9,
        socialImage: "/assets/og/solus-og.png",
        heroCover: "/assets/posts/inline.svg",
        views: { enabled: false },
        comments: { enabled: false },
        hero: {
          eyebrow: "Technical Archive",
          title: "Game Engine, Rendering, Tools",
          subtitle: "测试构建输出。",
          primaryAction: "最新文章",
          secondaryAction: "全部文章"
        },
        navigation: [
          { label: "首页", href: "/" },
          { label: "文章", href: "/archive/" },
          { label: "专题", href: "/series/" },
          { label: "标签", href: "/tags/" },
          { label: "关于", href: "/about/" }
        ],
        subscribe: {
          title: "订阅更新",
          description: "通过 RSS 跟踪最新文章。",
          rss: "/rss.xml"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(target, "content", "posts", "2026-06-13-markdown-edge.md"),
    `---\ntitle: "Markdown Edge Cases"\nslug: "markdown-edge-cases"\ndate: 2026-06-13\ncategory: 图形渲染\ntags: [Markdown, 渲染]\nsummary: 覆盖 Markdown 表格、链接、图片和代码块的构建测试。\ncover: /assets/posts/inline.svg\nstatus: published\n---\n\n## Repeat\n\nParagraph with **strong text**, *emphasis*, \`inline code\`, [external](https://example.com/path), and [bad](javascript:alert(1)).\n\n![Inline Asset](/assets/posts/inline.svg)\n\n| Name | Value |\n| --- | --- |\n| Pipe | A \\| B |\n\n## Repeat\n\n> quoted text\n\n\`\`\`js\nconsole.log("ok");\n\`\`\`\n`,
    "utf8"
  );
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "solus-build-"));

try {
  await writeFixtureProject(tempRoot);
  const result = await runBuild(tempRoot);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Built 1 posts into dist\//);

  const article = await readFile(path.join(tempRoot, "dist", "posts", "markdown-edge-cases", "index.html"), "utf8");
  assert.match(article, /<h2 id="repeat">Repeat<\/h2>/);
  assert.match(article, /<h2 id="repeat-2">Repeat<\/h2>/);
  assert.match(article, /<strong>strong text<\/strong>/);
  assert.match(article, /<em>emphasis<\/em>/);
  assert.match(article, /<code>inline code<\/code>/);
  assert.match(article, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(article, /javascript:alert/);
  assert.match(article, /<img src="\/assets\/posts\/inline\.svg" alt="Inline Asset" loading="lazy" decoding="async" \/>/);
  assert.match(article, /<meta property="og:image:alt" content="Markdown Edge Cases \| SOLUS Dev Notes" \/>/);
  assert.match(article, /<meta name="twitter:image:alt" content="Markdown Edge Cases \| SOLUS Dev Notes" \/>/);
  assert.match(article, /<td data-align="left">A \| B<\/td>/);
  assert.match(article, /<pre data-language="js"><button class="code-copy-button"/);
  assert.match(article, /<blockquote>quoted text<\/blockquote>/);

  const archive = await readFile(path.join(tempRoot, "dist", "archive", "index.html"), "utf8");
  assert.match(archive, /href="\/years\/2026\/"/);
  assert.match(archive, /<img src="\/assets\/posts\/inline\.svg" alt="" width="1200" height="675" loading="lazy" decoding="async" \/>/);

  const home = await readFile(path.join(tempRoot, "dist", "index.html"), "utf8");
  assert.match(home, /<img class="hero-cover" src="\/assets\/posts\/inline\.svg" alt="" width="1200" height="675" decoding="async" fetchpriority="high" \/>/);
  assert.match(home, /<link rel="search" type="application\/opensearchdescription\+xml" title="SOLUS Dev Notes" href="\/opensearch\.xml" \/>/);

  const yearPage = await readFile(path.join(tempRoot, "dist", "years", "2026", "index.html"), "utf8");
  assert.match(yearPage, /2026 年文章/);
  assert.match(yearPage, /href="\/posts\/markdown-edge-cases\/"/);
  assert.match(yearPage, /aria-current="page">2026 <b>1<\/b><\/a>/);

  const searchIndex = JSON.parse(await readFile(path.join(tempRoot, "dist", "search-index.json"), "utf8"));
  assert.equal(searchIndex.length, 1);
  assert.equal(searchIndex[0].slug, "markdown-edge-cases");
  assert.equal(searchIndex[0].year, "2026");
  assert.equal(searchIndex[0].cover, "/assets/posts/inline.svg");

  const rss = await readFile(path.join(tempRoot, "dist", "rss.xml"), "utf8");
  assert.match(rss, /<content:encoded><!\[CDATA\[/);
  assert.match(rss, /src="https:\/\/blog\.solus\.games\/assets\/posts\/inline\.svg"/);
  assert.doesNotMatch(rss, /\s(?:href|src)="\//);

  const openSearch = await readFile(path.join(tempRoot, "dist", "opensearch.xml"), "utf8");
  assert.match(openSearch, /<OpenSearchDescription xmlns="http:\/\/a9\.com\/-\/spec\/opensearch\/1\.1\/">/);
  assert.match(openSearch, /<ShortName>SOLUS<\/ShortName>/);
  assert.match(openSearch, /template="https:\/\/blog\.solus\.games\/search\/\?q=\{searchTerms\}"/);
  assert.match(openSearch, /https:\/\/blog\.solus\.games\/favicon\.svg/);

  const sitemap = await readFile(path.join(tempRoot, "dist", "sitemap.xml"), "utf8");
  assert.match(sitemap, /https:\/\/blog\.solus\.games\/posts\/markdown-edge-cases\//);
  assert.match(sitemap, /https:\/\/blog\.solus\.games\/years\/2026\//);

  const robots = await readFile(path.join(tempRoot, "dist", "robots.txt"), "utf8");
  assert.match(robots, /Sitemap: https:\/\/blog\.solus\.games\/sitemap\.xml/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Build fixture tests passed.");
