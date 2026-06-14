import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function jsonLdObjects(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
    JSON.parse(match[1])
  );
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
        archivePostsPerPage: 1,
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
    `---\ntitle: "Markdown Edge Cases"\nslug: "markdown-edge-cases"\ndate: 2026-06-13\ncategory: 图形渲染\ntags: [Markdown, 渲染]\nsummary: 覆盖 Markdown 表格、链接、图片和代码块的构建测试。\ncover: /assets/posts/inline.svg\nseries: Markdown Lab\nseriesOrder: 1\nstatus: published\n---\n\n## Repeat\n\nParagraph with **strong text**, *emphasis*, \`inline code\`, [external](https://example.com/path), [bad](javascript:alert(1)), and [relative](relative-page).\n\n![Inline Asset](/assets/posts/inline.svg)\n\n| Name | Value |\n| --- | --- |\n| Pipe | A \\| B |\n\n## Repeat\n\n> quoted text\n\n\`\`\`js\nconsole.log("ok");\n\`\`\`\n`,
    "utf8"
  );
  await writeFile(
    path.join(target, "content", "posts", "2026-06-14-markdown-followup.md"),
    `---\ntitle: "Markdown Followup"\nslug: "markdown-followup"\ndate: 2026-06-14\ncategory: 图形渲染\ntags: [Markdown, 工程]\nsummary: 第二篇同标签文章用于验证标签分页和 sitemap 输出。\ncover: /assets/posts/inline.svg\nseries: Markdown Lab\nseriesOrder: 2\nstatus: published\n---\n\n## Followup\n\nParagraph for the second Markdown article.\n`,
    "utf8"
  );
  await writeFile(
    path.join(target, "content", "posts", "2026-06-14-markdown-same-day.md"),
    `---\ntitle: "Markdown Same Day"\nslug: "markdown-same-day"\ndate: 2026-06-14\ncategory: Unity\ntags: [排序]\nsummary: 同日文章用于验证构建输出的稳定排序。\ncover: /assets/posts/inline.svg\nstatus: published\n---\n\n## Same Day\n\nParagraph for deterministic ordering.\n`,
    "utf8"
  );
  await writeFile(
    path.join(target, "content", "posts", "2026-06-15-draft-only.md"),
    `---\ntitle: "Draft Only"\nslug: "draft-only"\ndate: 2026-06-15\ncategory: Unity\ntags: [草稿]\nsummary: 这篇草稿用于验证未发布内容不会进入公开输出。\ncover: /assets/posts/inline.svg\nstatus: draft\n---\n\n## Draft\n\nThis draft must never be published by the build.\n`,
    "utf8"
  );
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "solus-build-"));

try {
  await writeFixtureProject(tempRoot);
  const result = await runBuild(tempRoot);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Built 3 posts into dist\//);

  const article = await readFile(path.join(tempRoot, "dist", "posts", "markdown-edge-cases", "index.html"), "utf8");
  assert.match(article, /<h2 id="repeat">Repeat<\/h2>/);
  assert.match(article, /<h2 id="repeat-2">Repeat<\/h2>/);
  assert.match(article, /<strong>strong text<\/strong>/);
  assert.match(article, /<em>emphasis<\/em>/);
  assert.match(article, /<code>inline code<\/code>/);
  assert.match(article, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(article, /javascript:alert/);
  assert.doesNotMatch(article, /href="relative-page"/);
  assert.match(article, /<img src="\/assets\/posts\/inline\.svg" alt="Inline Asset" loading="lazy" decoding="async" \/>/);
  assert.match(article, /<meta property="og:image:alt" content="Markdown Edge Cases \| SOLUS Dev Notes" \/>/);
  assert.match(article, /<meta name="twitter:image:alt" content="Markdown Edge Cases \| SOLUS Dev Notes" \/>/);
  const articleJsonLd = jsonLdObjects(article);
  const techArticle = articleJsonLd.find((item) => item["@type"] === "TechArticle");
  const breadcrumb = articleJsonLd.find((item) => item["@type"] === "BreadcrumbList");
  assert.equal(techArticle.url, "https://blog.solus.games/posts/markdown-edge-cases/");
  assert.equal(techArticle.mainEntityOfPage, "https://blog.solus.games/posts/markdown-edge-cases/");
  assert.equal(techArticle.headline, "Markdown Edge Cases");
  assert.equal(breadcrumb.itemListElement.at(-1).item, "https://blog.solus.games/posts/markdown-edge-cases/");
  assert.match(article, /<td data-align="left">A \| B<\/td>/);
  assert.match(article, /<pre data-language="js"><button class="code-copy-button"/);
  assert.match(article, /<blockquote>quoted text<\/blockquote>/);
  await assert.rejects(access(path.join(tempRoot, "dist", "posts", "draft-only", "index.html")));

  const archive = await readFile(path.join(tempRoot, "dist", "archive", "index.html"), "utf8");
  assert.doesNotMatch(archive, /class="page-context"/);
  assert.match(archive, /href="\/years\/2026\/"/);
  assert.match(archive, /<img src="\/assets\/posts\/inline\.svg" alt="" width="1200" height="675" loading="lazy" decoding="async" \/>/);
  assert.match(archive, /href="\/archive\/page\/2\/"/);
  const archiveCollection = jsonLdObjects(archive).find((item) => item["@type"] === "CollectionPage");
  assert.equal(archiveCollection.url, "https://blog.solus.games/archive/");
  assert.equal(archiveCollection.mainEntity["@type"], "ItemList");
  assert.equal(archiveCollection.mainEntity.itemListElement.length, 1);

  const home = await readFile(path.join(tempRoot, "dist", "index.html"), "utf8");
  assert.match(home, /<img class="hero-cover" src="\/assets\/posts\/inline\.svg" alt="" width="1200" height="675" decoding="async" fetchpriority="high" \/>/);
  assert.match(home, /<link rel="alternate" type="application\/feed\+json" title="SOLUS Dev Notes" href="https:\/\/blog\.solus\.games\/feed\.json" \/>/);
  assert.match(home, /<link rel="search" type="application\/opensearchdescription\+xml" title="SOLUS Dev Notes" href="\/opensearch\.xml" \/>/);
  assert.match(home, /\/src\/styles\.css\?v=[0-9a-f]{12}/);
  assert.doesNotMatch(home, /[?&]v=local/);
  assert.doesNotMatch(home, /draft-only|Draft Only/);
  const website = jsonLdObjects(home).find((item) => item["@type"] === "WebSite");
  assert.equal(website.url, "https://blog.solus.games/");
  assert.equal(website.potentialAction["@type"], "SearchAction");
  assert.equal(website.potentialAction.target, "https://blog.solus.games/search/?q={search_term_string}");

  const yearPage = await readFile(path.join(tempRoot, "dist", "years", "2026", "index.html"), "utf8");
  assert.match(yearPage, /2026 年文章/);
  assert.match(yearPage, /href="\/posts\/markdown-followup\/"/);
  assert.match(yearPage, /aria-current="page">2026 <b>3<\/b><\/a>/);
  assert.match(yearPage, /href="\/years\/2026\/page\/2\/"/);
  assert.equal(
    jsonLdObjects(yearPage).find((item) => item["@type"] === "CollectionPage").url,
    "https://blog.solus.games/years/2026/"
  );

  const categoryPage = await readFile(path.join(tempRoot, "dist", "categories", "图形渲染", "index.html"), "utf8");
  assert.doesNotMatch(categoryPage, /class="page-context"/);
  assert.match(categoryPage, /href="\/archive\/2026\/图形渲染\/"/);

  const combinedArchivePage = await readFile(
    path.join(tempRoot, "dist", "archive", "2026", "图形渲染", "index.html"),
    "utf8"
  );
  assert.match(combinedArchivePage, /href="\/posts\/markdown-followup\/"/);
  assert.match(combinedArchivePage, /href="\/categories\/图形渲染\/"/);
  assert.equal(
    jsonLdObjects(combinedArchivePage).find((item) => item["@type"] === "CollectionPage").url,
    new URL("/archive/2026/图形渲染/", "https://blog.solus.games/").toString()
  );

  const tagPage = await readFile(path.join(tempRoot, "dist", "tags", "markdown", "index.html"), "utf8");
  assert.doesNotMatch(tagPage, /class="page-context"/);
  assert.match(tagPage, /Markdown 标签/);
  assert.match(tagPage, /href="\/posts\/markdown-followup\/"/);
  assert.match(tagPage, /href="\/tags\/markdown\/page\/2\/"/);
  assert.match(tagPage, /<link rel="next" href="https:\/\/blog\.solus\.games\/tags\/markdown\/page\/2\/" \/>/);
  assert.equal(
    jsonLdObjects(tagPage).find((item) => item["@type"] === "CollectionPage").url,
    "https://blog.solus.games/tags/markdown/"
  );

  const tagPage2 = await readFile(path.join(tempRoot, "dist", "tags", "markdown", "page", "2", "index.html"), "utf8");
  assert.match(tagPage2, /href="\/posts\/markdown-edge-cases\/"/);
  assert.match(tagPage2, /<link rel="prev" href="https:\/\/blog\.solus\.games\/tags\/markdown\/" \/>/);

  const seriesPage = await readFile(path.join(tempRoot, "dist", "series", "markdown-lab", "index.html"), "utf8");
  assert.match(seriesPage, /href="\/posts\/markdown-edge-cases\/"/);
  assert.doesNotMatch(seriesPage, /href="\/posts\/markdown-followup\/"/);
  assert.match(seriesPage, /href="\/series\/markdown-lab\/page\/2\/"/);
  assert.match(seriesPage, /<link rel="next" href="https:\/\/blog\.solus\.games\/series\/markdown-lab\/page\/2\/" \/>/);
  assert.equal(
    jsonLdObjects(seriesPage).find((item) => item["@type"] === "CollectionPage").url,
    "https://blog.solus.games/series/markdown-lab/"
  );

  const seriesPage2 = await readFile(path.join(tempRoot, "dist", "series", "markdown-lab", "page", "2", "index.html"), "utf8");
  assert.match(seriesPage2, /href="\/posts\/markdown-followup\/"/);
  assert.match(seriesPage2, /<link rel="prev" href="https:\/\/blog\.solus\.games\/series\/markdown-lab\/" \/>/);

  const tagIndex = await readFile(path.join(tempRoot, "dist", "tags", "index.html"), "utf8");
  assert.doesNotMatch(tagIndex, /class="page-context"/);
  assert.equal(jsonLdObjects(tagIndex).find((item) => item["@type"] === "CollectionPage").url, "https://blog.solus.games/tags/");

  const seriesIndex = await readFile(path.join(tempRoot, "dist", "series", "index.html"), "utf8");
  assert.doesNotMatch(seriesIndex, /class="page-context"/);
  assert.equal(
    jsonLdObjects(seriesIndex).find((item) => item["@type"] === "CollectionPage").url,
    "https://blog.solus.games/series/"
  );

  const about = await readFile(path.join(tempRoot, "dist", "about", "index.html"), "utf8");
  assert.equal(jsonLdObjects(about).find((item) => item["@type"] === "AboutPage").url, "https://blog.solus.games/about/");

  const search = await readFile(path.join(tempRoot, "dist", "search", "index.html"), "utf8");
  assert.equal(
    jsonLdObjects(search).find((item) => item["@type"] === "SearchResultsPage").url,
    "https://blog.solus.games/search/"
  );

  const searchIndex = JSON.parse(await readFile(path.join(tempRoot, "dist", "search-index.json"), "utf8"));
  assert.equal(searchIndex.length, 3);
  assert.equal(searchIndex[0].slug, "markdown-followup");
  assert.equal(searchIndex[1].slug, "markdown-same-day");
  assert.equal(searchIndex.some((item) => item.slug === "draft-only"), false);
  const markdownEdge = searchIndex.find((item) => item.slug === "markdown-edge-cases");
  assert.equal(markdownEdge.year, "2026");
  assert.equal(markdownEdge.cover, "/assets/posts/inline.svg");

  const rss = await readFile(path.join(tempRoot, "dist", "rss.xml"), "utf8");
  assert.match(rss, /<content:encoded><!\[CDATA\[/);
  assert.match(rss, /src="https:\/\/blog\.solus\.games\/assets\/posts\/inline\.svg"/);
  assert.doesNotMatch(rss, /\s(?:href|src)="\//);
  assert.equal((rss.match(/<item>/g) || []).length, 3);
  assert.ok(rss.indexOf("https://blog.solus.games/posts/markdown-followup/") < rss.indexOf("https://blog.solus.games/posts/markdown-edge-cases/"));
  assert.doesNotMatch(rss, /draft-only|Draft Only/);

  const jsonFeed = JSON.parse(await readFile(path.join(tempRoot, "dist", "feed.json"), "utf8"));
  assert.equal(jsonFeed.version, "https://jsonfeed.org/version/1.1");
  assert.equal(jsonFeed.home_page_url, "https://blog.solus.games/");
  assert.equal(jsonFeed.feed_url, "https://blog.solus.games/feed.json");
  assert.equal(jsonFeed.items.length, 3);
  assert.equal(jsonFeed.items[0].url, "https://blog.solus.games/posts/markdown-followup/");
  assert.equal(jsonFeed.items.some((item) => item.url.includes("/draft-only/")), false);
  const feedMarkdownEdge = jsonFeed.items.find((item) => item.url === "https://blog.solus.games/posts/markdown-edge-cases/");
  assert.match(feedMarkdownEdge.content_html, /src="https:\/\/blog\.solus\.games\/assets\/posts\/inline\.svg"/);
  assert.doesNotMatch(feedMarkdownEdge.content_html, /\s(?:href|src)="\//);

  const openSearch = await readFile(path.join(tempRoot, "dist", "opensearch.xml"), "utf8");
  assert.match(openSearch, /<OpenSearchDescription xmlns="http:\/\/a9\.com\/-\/spec\/opensearch\/1\.1\/">/);
  assert.match(openSearch, /<ShortName>SOLUS<\/ShortName>/);
  assert.match(openSearch, /template="https:\/\/blog\.solus\.games\/search\/\?q=\{searchTerms\}"/);
  assert.match(openSearch, /https:\/\/blog\.solus\.games\/favicon\.svg/);

  const sitemap = await readFile(path.join(tempRoot, "dist", "sitemap.xml"), "utf8");
  assert.match(sitemap, /https:\/\/blog\.solus\.games\/posts\/markdown-edge-cases\//);
  assert.match(sitemap, /https:\/\/blog\.solus\.games\/years\/2026\//);
  assert.match(sitemap, new RegExp(new URL("/archive/2026/图形渲染/", "https://blog.solus.games/").toString()));
  assert.match(sitemap, /https:\/\/blog\.solus\.games\/tags\/markdown\/page\/2\//);
  assert.match(sitemap, /https:\/\/blog\.solus\.games\/series\/markdown-lab\/page\/2\//);
  assert.doesNotMatch(sitemap, /draft-only/);

  const robots = await readFile(path.join(tempRoot, "dist", "robots.txt"), "utf8");
  assert.match(robots, /Sitemap: https:\/\/blog\.solus\.games\/sitemap\.xml/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Build fixture tests passed.");
