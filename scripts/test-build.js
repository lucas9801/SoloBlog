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
  await cp(path.join(root, "assets", "hero"), path.join(target, "assets", "hero"), { recursive: true });
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
        tagline: "技术档案",
        description: "测试博客。",
        baseUrl: "https://blog.solus.games/",
        language: "zh-CN",
        homePostsPerPage: 1,
        postsPerPage: 9,
        archivePostsPerPage: 1,
        socialImage: "/assets/og/solus-og.png",
        heroCover: "/assets/hero/solus-hero.svg",
        views: { enabled: false },
        comments: { enabled: false },
        hero: {
          eyebrow: "技术档案",
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
          description: "通过 RSS 或 JSON Feed 跟踪最新文章。",
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
    `---\ntitle: "Markdown Edge Cases"\nslug: "markdown-edge-cases"\ndate: 2026-06-13\nupdated: 2026-06-14\ncategory: 图形渲染\ntags: [Markdown, 渲染]\nsummary: 覆盖 Markdown 表格、链接、图片和代码块的构建测试。\ncover: /assets/posts/inline.svg\nseries: Markdown Lab\nseriesOrder: 1\nfeatured: true\nstatus: published\n---\n\n## Repeat\n\nParagraph with **strong text**, *emphasis*, \`inline code\`, [external](https://example.com/path), [bad](javascript:alert(1)), and [relative](relative-page).\n\n### Nested Repeat\n\n![Inline Asset](/assets/posts/inline.svg)\n\n| Name | Value |\n| --- | --- |\n| Pipe | A \\| B |\n\n## Repeat\n\n> quoted text\n\n\`\`\`js\nconsole.log("ok");\n\`\`\`\n`,
    "utf8"
  );
  await writeFile(
    path.join(target, "content", "posts", "2026-06-14-markdown-followup.md"),
    `---\ntitle: "Markdown Followup"\nslug: "markdown-followup"\ndate: 2026-06-14\ncategory: 图形渲染\ntags: [Markdown, 工程]\nsummary: 第二篇同标签文章用于验证标签分页和 sitemap 输出。\ncover: /assets/posts/inline.svg\nseries: Markdown Lab\nseriesOrder: 2\nfeatured: true\nstatus: published\n---\n\n## Followup\n\nParagraph for the second Markdown article.\n`,
    "utf8"
  );
  await writeFile(
    path.join(target, "content", "posts", "2026-06-14-markdown-same-day.md"),
    `---\ntitle: "Markdown Same Day"\nslug: "markdown-same-day"\ndate: 2026-06-14\ncategory: Unity\ntags: [排序]\nsummary: 同日文章用于验证构建输出的稳定排序。\nseries: Unity Lab\nseriesOrder: 1\nfeatured: true\nstatus: published\n---\n\n## Same Day\n\nParagraph for deterministic ordering.\n`,
    "utf8"
  );
  await writeFile(
    path.join(target, "content", "posts", "2026-06-12-archive-latest.md"),
    `---\ntitle: "Archive Latest"\nslug: "archive-latest"\ndate: 2026-06-12\ncategory: 工具链\ntags: [归档]\nsummary: 非精选文章用于验证首页最新文章锚点。\nstatus: published\n---\n\n## Latest\n\nParagraph for the latest section.\n`,
    "utf8"
  );
  await writeFile(
    path.join(target, "content", "posts", "2026-06-11-archive-overflow.md"),
    `---\ntitle: "Archive Overflow"\nslug: "archive-overflow"\ndate: 2026-06-11\ncategory: 工具链\ntags: [归档]\nsummary: 第二篇非精选文章用于验证首页最新文章数量上限。\nstatus: published\n---\n\n## Overflow\n\nParagraph for the homepage latest cap.\n`,
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
  assert.match(result.stdout, /Built 5 posts into dist\//);

  const article = await readFile(path.join(tempRoot, "dist", "posts", "markdown-edge-cases", "index.html"), "utf8");
  assert.match(article, /<h2 id="repeat">Repeat <a class="heading-anchor" href="#repeat" aria-label="章节链接：Repeat">#<\/a><\/h2>/);
  assert.match(article, /<h2 id="repeat-2">Repeat <a class="heading-anchor" href="#repeat-2" aria-label="章节链接：Repeat">#<\/a><\/h2>/);
  assert.match(article, /<strong>strong text<\/strong>/);
  assert.match(article, /<em>emphasis<\/em>/);
  assert.match(article, /<code>inline code<\/code>/);
  assert.match(article, /<a href="https:\/\/example\.com\/path" target="_blank" rel="noopener noreferrer" aria-label="external（在新标签页打开）" data-external-link>external<\/a>/);
  assert.doesNotMatch(article, /javascript:alert/);
  assert.doesNotMatch(article, /href="relative-page"/);
  assert.match(article, /<img src="\/assets\/posts\/inline\.svg" alt="Inline Asset" loading="lazy" decoding="async" \/>/);
  assert.match(article, /<pre data-language="js" tabindex="0" aria-label="js 代码块，可横向滚动"><button class="code-copy-button" type="button" data-copy-code aria-label="复制代码">复制<\/button><span class="sr-only" aria-live="polite" data-copy-code-status><\/span><code>console\.log\(&quot;ok&quot;\);<\/code><\/pre>/);
  assert.match(article, /<time class="updated-date" datetime="2026-06-14">更新 2026\/06\/14<\/time>/);
  assert.match(article, /<meta property="og:image:alt" content="Markdown Edge Cases \| SOLUS Dev Notes" \/>/);
  assert.match(article, /<meta name="twitter:image:alt" content="Markdown Edge Cases \| SOLUS Dev Notes" \/>/);
  assert.match(article, /<a class="active" href="\/archive\/" aria-current="page">文章<\/a>/);
  assert.match(article, /data-copy-article-url="https:\/\/blog\.solus\.games\/posts\/markdown-edge-cases\/"/);
  assert.match(article, /data-copy-article-status/);
  assert.match(article, /<aside class="article-aside article-related-aside">[\s\S]*<section class="series-panel compact" aria-labelledby="series-sidebar-title">/);
  assert.match(article, /<nav class="sidebar-card toc" aria-labelledby="article-toc-title"><h2 id="article-toc-title">目录<\/h2>/);
  assert.doesNotMatch(article, /<footer class="article-footer">[\s\S]*class="series-panel"/);
  const articleJsonLd = jsonLdObjects(article);
  const techArticle = articleJsonLd.find((item) => item["@type"] === "TechArticle");
  const breadcrumb = articleJsonLd.find((item) => item["@type"] === "BreadcrumbList");
  assert.equal(techArticle.url, "https://blog.solus.games/posts/markdown-edge-cases/");
  assert.equal(techArticle.mainEntityOfPage, "https://blog.solus.games/posts/markdown-edge-cases/");
  assert.equal(techArticle.headline, "Markdown Edge Cases");
  assert.equal(breadcrumb.itemListElement.at(-1).item, "https://blog.solus.games/posts/markdown-edge-cases/");
  assert.match(article, /<td data-align="left">A \| B<\/td>/);
  assert.match(article, /aria-label="js 代码块，可横向滚动"/);
  assert.match(article, /<blockquote>quoted text<\/blockquote>/);
  await assert.rejects(access(path.join(tempRoot, "dist", "posts", "draft-only", "index.html")));

  const archive = await readFile(path.join(tempRoot, "dist", "archive", "index.html"), "utf8");
  assert.doesNotMatch(archive, /class="page-context"/);
  assert.doesNotMatch(archive, /class="page-title"/);
  assert.doesNotMatch(archive, /class="section-kicker"/);
  assert.doesNotMatch(archive, /class="archive-filter-form"/);
  assert.doesNotMatch(archive, /aria-label="文章联合筛选"/);
  assert.doesNotMatch(archive, /data-archive-year/);
  assert.doesNotMatch(archive, /data-category-slug/);
  assert.match(archive, /<div class="archive-filter-links" aria-label="文章筛选">/);
  assert.match(archive, /<div class="archive-status" aria-live="polite">[\s\S]*<strong>全部文章<\/strong>[\s\S]*<span>5 篇<\/span>[\s\S]*<span>第 1\/5 页<\/span>/);
  assert.doesNotMatch(archive, /<summary>快捷筛选<\/summary>/);
  assert.match(archive, /href="\/years\/2026\/"/);
  assert.match(archive, /href="\/categories\/图形渲染\/"/);
  assert.match(archive, />全部年份 <b>5<\/b><\/a>[\s\S]*>全部分类 <b>5<\/b><\/a>/);
  assert.match(archive, /class="post-index-list wide"/);
  assert.match(archive, /class="post-index-item"/);
  assert.doesNotMatch(archive, /class="article-index-grid"/);
  assert.doesNotMatch(archive, /class="archive-card-thumb/);
  assert.match(archive, /href="\/archive\/page\/2\/"/);
  const archiveCollection = jsonLdObjects(archive).find((item) => item["@type"] === "CollectionPage");
  assert.equal(archiveCollection.url, "https://blog.solus.games/archive/");
  assert.equal(archiveCollection.mainEntity["@type"], "ItemList");
  assert.equal(archiveCollection.mainEntity.itemListElement.length, 1);

  const home = await readFile(path.join(tempRoot, "dist", "index.html"), "utf8");
  assert.match(home, /<a class="button-link" href="#latest-posts">最新文章<\/a>/);
  assert.match(home, /<img class="hero-cover" src="\/assets\/hero\/solus-hero\.svg" alt="" width="1200" height="675" decoding="async" fetchpriority="high" \/>/);
  assert.match(home, /<section id="latest-posts" class="section-block">/);
  assert.match(home, /推荐阅读/);
  assert.match(home, /<div class="featured-post-grid count-3">/);
  assert.match(home, /<article class="archive-card featured-card is-primary">/);
  const latestSectionStart = home.indexOf('<section id="latest-posts"');
  const latestSectionEnd = home.indexOf("</section>", latestSectionStart);
  const latestSection = home.slice(latestSectionStart, latestSectionEnd);
  assert.match(latestSection, /Archive Latest/);
  assert.doesNotMatch(latestSection, /Archive Overflow/);
  assert.match(home, /class="sidebar-card sidebar-index-card"/);
  assert.match(home, /<h2>专题<\/h2>/);
  assert.match(home, /href="\/series\/markdown-lab\/"/);
  assert.match(home, /<h2 data-ranking-title>阅读排行<\/h2>/);
  assert.match(home, /data-ranking-posts=/);
  assert.match(home, /data-ranking-posts="[^"]*&quot;date&quot;[^"]*&quot;category&quot;/);
  assert.match(home, /<a class="button-link" href="\/rss\.xml">RSS<\/a>/);
  assert.match(home, /<a class="ghost-link" href="\/feed\.json">JSON Feed<\/a>/);
  assert.match(home, />复制 RSS<\/button>/);
  assert.match(home, /data-copy-rss-status/);
  assert.match(home, /站点地图/);
  assert.match(home, /<button type="submit" aria-label="搜索文章"><span class="sr-only">搜索文章<\/span><\/button>/);
  assert.doesNotMatch(home, /aria-label="搜索文章">搜索<\/button>|>⌕<\/button>/);
  assert.doesNotMatch(home, /Recommended|Latest Posts|Technical Archive/);
  assert.match(home, /<link rel="alternate" type="application\/rss\+xml" title="SOLUS Dev Notes" href="https:\/\/blog\.solus\.games\/rss\.xml" \/>/);
  assert.match(home, /<link rel="alternate" type="application\/feed\+json" title="SOLUS Dev Notes" href="https:\/\/blog\.solus\.games\/feed\.json" \/>/);
  assert.match(home, /<link rel="search" type="application\/opensearchdescription\+xml" title="SOLUS Dev Notes" href="\/opensearch\.xml" \/>/);
  assert.match(home, /<link rel="apple-touch-icon" href="\/icon-192\.png" \/>/);
  assert.match(home, /<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#f6f8fb" \/>/);
  assert.match(home, /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#090d12" \/>/);
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
  assert.match(yearPage, /href="\/archive\/2026\/图形渲染\/"/);
  assert.match(yearPage, /aria-current="page">2026 <b>5<\/b><\/a>/);
  assert.match(yearPage, /href="\/years\/2026\/page\/2\/"/);
  assert.match(yearPage, /href="\/years\/2026\/page\/2\/" aria-label="第 2 页">2<\/a>/);
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
  assert.doesNotMatch(combinedArchivePage, /class="page-title"/);
  assert.doesNotMatch(combinedArchivePage, /class="archive-filter-form"/);
  assert.match(combinedArchivePage, /<div class="archive-status" aria-live="polite">[\s\S]*<strong>2026 年 图形渲染<\/strong>[\s\S]*<span>2 篇<\/span>/);
  assert.match(combinedArchivePage, /href="\/posts\/markdown-followup\/"/);
  assert.match(combinedArchivePage, /href="\/categories\/图形渲染\/">全部年份 <b>2<\/b><\/a>/);
  assert.match(combinedArchivePage, /href="\/years\/2026\/">全部分类 <b>5<\/b><\/a>/);
  assert.match(combinedArchivePage, /href="\/categories\/图形渲染\/"/);
  assert.match(combinedArchivePage, /aria-current="page">图形渲染 <b>2<\/b><\/a>/);
  assert.match(combinedArchivePage, /aria-current="page">2026 <b>2<\/b><\/a>/);
  assert.equal(
    jsonLdObjects(combinedArchivePage).find((item) => item["@type"] === "CollectionPage").url,
    new URL("/archive/2026/图形渲染/", "https://blog.solus.games/").toString()
  );

  const tagPage = await readFile(path.join(tempRoot, "dist", "tags", "markdown", "index.html"), "utf8");
  assert.doesNotMatch(tagPage, /class="page-context"/);
  assert.doesNotMatch(tagPage, /class="section-kicker"/);
  assert.match(tagPage, /Markdown 标签/);
  assert.match(tagPage, /<div class="archive-status" aria-live="polite">[\s\S]*<strong>标签：Markdown<\/strong>[\s\S]*<span>2 篇<\/span>[\s\S]*<span>第 1\/2 页<\/span>/);
  assert.match(tagPage, /class="post-index-list"/);
  assert.match(tagPage, /class="post-index-item"/);
  assert.doesNotMatch(tagPage, /class="article-index-grid"/);
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
  assert.match(tagPage2, /aria-current="page" aria-label="第 2 页，当前页">2<\/span>/);

  const seriesPage = await readFile(path.join(tempRoot, "dist", "series", "markdown-lab", "index.html"), "utf8");
  assert.match(seriesPage, /<div class="archive-status" aria-live="polite">[\s\S]*<strong>专题：Markdown Lab<\/strong>[\s\S]*<span>2 篇<\/span>[\s\S]*<span>第 1\/2 页<\/span>/);
  assert.match(seriesPage, /href="\/posts\/markdown-edge-cases\/"/);
  assert.doesNotMatch(seriesPage, /href="\/posts\/markdown-followup\/"/);
  assert.match(seriesPage, /href="\/series\/markdown-lab\/page\/2\/"/);
  assert.match(seriesPage, /<link rel="next" href="https:\/\/blog\.solus\.games\/series\/markdown-lab\/page\/2\/" \/>/);
  assert.match(seriesPage, /class="series-detail-layout"/);
  assert.match(seriesPage, /<aside class="series-related" aria-label="其他专题">/);
  assert.match(seriesPage, /href="\/series\/unity-lab\/"/);
  assert.equal(
    jsonLdObjects(seriesPage).find((item) => item["@type"] === "CollectionPage").url,
    "https://blog.solus.games/series/markdown-lab/"
  );

  const seriesPage2 = await readFile(path.join(tempRoot, "dist", "series", "markdown-lab", "page", "2", "index.html"), "utf8");
  assert.match(seriesPage2, /href="\/posts\/markdown-followup\/"/);
  assert.match(seriesPage2, /<link rel="prev" href="https:\/\/blog\.solus\.games\/series\/markdown-lab\/" \/>/);

  const tagIndex = await readFile(path.join(tempRoot, "dist", "tags", "index.html"), "utf8");
  assert.doesNotMatch(tagIndex, /class="page-context"/);
  assert.doesNotMatch(tagIndex, /class="page-title"/);
  assert.doesNotMatch(tagIndex, /class="section-kicker"/);
  assert.doesNotMatch(tagIndex, /class="compact-post-index"/);
  assert.doesNotMatch(tagIndex, /最近更新/);
  assert.equal(jsonLdObjects(tagIndex).find((item) => item["@type"] === "CollectionPage").url, "https://blog.solus.games/tags/");

  const seriesIndex = await readFile(path.join(tempRoot, "dist", "series", "index.html"), "utf8");
  assert.doesNotMatch(seriesIndex, /class="page-context"/);
  assert.doesNotMatch(seriesIndex, /class="page-title"/);
  assert.doesNotMatch(seriesIndex, /class="section-kicker"/);
  assert.doesNotMatch(seriesIndex, /class="compact-post-index"/);
  assert.doesNotMatch(seriesIndex, />专题<\/span>/);
  assert.doesNotMatch(seriesIndex, /最近 \d{4}/);
  assert.match(seriesIndex, /class="series-index-layout"/);
  assert.match(seriesIndex, /<aside class="series-index-sidebar" aria-label="专题快速索引">/);
  assert.match(seriesIndex, /href="#series-markdown-lab"/);
  assert.match(seriesIndex, /id="series-markdown-lab"/);
  assert.match(seriesIndex, /class="series-card-head"/);
  assert.match(seriesIndex, /class="series-card-meta"/);
  assert.match(seriesIndex, /更新 2026\/06\/14/);
  assert.match(seriesIndex, /class="series-card-list"/);
  assert.match(seriesIndex, /Markdown Edge Cases/);
  assert.match(seriesIndex, /Markdown Followup/);
  assert.equal(
    jsonLdObjects(seriesIndex).find((item) => item["@type"] === "CollectionPage").url,
    "https://blog.solus.games/series/"
  );

  const about = await readFile(path.join(tempRoot, "dist", "about", "index.html"), "utf8");
  assert.equal(jsonLdObjects(about).find((item) => item["@type"] === "AboutPage").url, "https://blog.solus.games/about/");

  const search = await readFile(path.join(tempRoot, "dist", "search", "index.html"), "utf8");
  assert.doesNotMatch(search, /class="page-title"/);
  assert.doesNotMatch(search, /class="section-kicker"/);
  assert.match(search, /class="page-shell search-page"/);
  assert.doesNotMatch(search, /class="search-filter-selects"/);
  assert.match(search, /<noscript class="search-noscript">/);
  assert.match(search, /搜索功能需要启用 JavaScript/);
  assert.doesNotMatch(search, /id="searchYearFilter"/);
  assert.doesNotMatch(search, /id="searchCategoryFilter"/);
  assert.match(search, /placeholder="搜索标题、摘要、正文、年份、分类、专题或标签"/);
  assert.match(search, /id="searchInputPage"[^>]+aria-describedby="searchStatus"[^>]+aria-controls="searchResults searchFacets"/);
  assert.match(search, /id="searchActiveFilters" class="search-active-filters" aria-label="当前筛选" hidden/);
  assert.doesNotMatch(search, /autofocus/);
  assert.match(search, /data-search-clear[^>]+aria-controls="searchInputPage searchStatus searchResults searchFacets"/);
  assert.match(search, /id="searchStatus" class="search-status" role="status" aria-live="polite"/);
  assert.match(search, /id="searchResults" class="search-results" role="list"/);
  assert.match(search, /id="searchPagination" class="pagination search-pagination" aria-label="搜索结果分页" hidden/);
  assert.equal(
    jsonLdObjects(search).find((item) => item["@type"] === "SearchResultsPage").url,
    "https://blog.solus.games/search/"
  );

  const searchIndex = JSON.parse(await readFile(path.join(tempRoot, "dist", "search-index.json"), "utf8"));
  assert.equal(searchIndex.length, 5);
  assert.equal(searchIndex[0].slug, "markdown-followup");
  assert.equal(searchIndex[1].slug, "markdown-same-day");
  assert.equal(searchIndex.some((item) => item.slug === "draft-only"), false);
  assert.equal(searchIndex.some((item) => item.slug === "archive-overflow"), true);
  const markdownEdge = searchIndex.find((item) => item.slug === "markdown-edge-cases");
  assert.equal(markdownEdge.year, "2026");
  assert.equal(markdownEdge.cover, "/assets/posts/inline.svg");
  assert.match(markdownEdge.text, /Name Value Pipe A B/);
  assert.doesNotMatch(markdownEdge.text, /\|/);
  assert.doesNotMatch(markdownEdge.text, /---/);
  const markdownSameDay = searchIndex.find((item) => item.slug === "markdown-same-day");
  assert.equal(markdownSameDay.cover, "/assets/posts/markdown-same-day.svg");
  const generatedCover = await readFile(path.join(tempRoot, "assets", "posts", "markdown-same-day.svg"), "utf8");
  assert.match(generatedCover, /Markdown Same Day/);
  assert.match(generatedCover, /同日文章用于验证构建输出的稳定排序。/);
  assert.match(generatedCover, /SOLUS DEV NOTES/);

  const notFound = await readFile(path.join(tempRoot, "dist", "404.html"), "utf8");
  assert.match(notFound, /<meta name="robots" content="noindex,follow" \/>/);
  assert.match(notFound, /<h1>页面未找到<\/h1>/);
  assert.match(notFound, /class="compact-post-index"/);
  assert.match(notFound, /最近文章/);
  assert.match(notFound, /href="\/posts\/markdown-followup\/"/);

  const rss = await readFile(path.join(tempRoot, "dist", "rss.xml"), "utf8");
  assert.match(rss, /<content:encoded><!\[CDATA\[/);
  assert.match(rss, /src="https:\/\/blog\.solus\.games\/assets\/posts\/inline\.svg"/);
  assert.match(rss, /href="https:\/\/blog\.solus\.games\/posts\/markdown-edge-cases\/#repeat"/);
  assert.doesNotMatch(rss, /\s(?:href|src)="\//);
  assert.doesNotMatch(rss, /\shref="#/);
  assert.equal((rss.match(/<item>/g) || []).length, 5);
  assert.ok(rss.indexOf("https://blog.solus.games/posts/markdown-followup/") < rss.indexOf("https://blog.solus.games/posts/markdown-edge-cases/"));
  assert.doesNotMatch(rss, /draft-only|Draft Only/);

  const jsonFeed = JSON.parse(await readFile(path.join(tempRoot, "dist", "feed.json"), "utf8"));
  assert.equal(jsonFeed.version, "https://jsonfeed.org/version/1.1");
  assert.equal(jsonFeed.title, "SOLUS Dev Notes");
  assert.equal(jsonFeed.description, "测试博客。");
  assert.equal(jsonFeed.language, "zh-CN");
  assert.equal(jsonFeed.home_page_url, "https://blog.solus.games/");
  assert.equal(jsonFeed.feed_url, "https://blog.solus.games/feed.json");
  assert.equal(jsonFeed.favicon, "https://blog.solus.games/favicon.svg");
  assert.equal(jsonFeed.authors[0].name, "SOLUS");
  assert.equal(jsonFeed.items.length, 5);
  assert.equal(jsonFeed.items[0].url, "https://blog.solus.games/posts/markdown-followup/");
  assert.equal(jsonFeed.items[0].summary, "第二篇同标签文章用于验证标签分页和 sitemap 输出。");
  assert.equal(jsonFeed.items[0].tags.includes("图形渲染"), true);
  assert.equal(jsonFeed.items[0].authors[0].name, "SOLUS");
  assert.equal(jsonFeed.items[0].image, "https://blog.solus.games/assets/posts/inline.svg");
  assert.equal(jsonFeed.items.some((item) => item.url.includes("/draft-only/")), false);
  const feedMarkdownEdge = jsonFeed.items.find((item) => item.url === "https://blog.solus.games/posts/markdown-edge-cases/");
  assert.match(feedMarkdownEdge.content_html, /src="https:\/\/blog\.solus\.games\/assets\/posts\/inline\.svg"/);
  assert.match(feedMarkdownEdge.content_html, /href="https:\/\/blog\.solus\.games\/posts\/markdown-edge-cases\/#repeat"/);
  assert.doesNotMatch(feedMarkdownEdge.content_html, /\s(?:href|src)="\//);
  assert.doesNotMatch(feedMarkdownEdge.content_html, /\shref="#/);

  const openSearch = await readFile(path.join(tempRoot, "dist", "opensearch.xml"), "utf8");
  assert.match(openSearch, /<OpenSearchDescription xmlns="http:\/\/a9\.com\/-\/spec\/opensearch\/1\.1\/">/);
  assert.match(openSearch, /<ShortName>SOLUS<\/ShortName>/);
  assert.match(openSearch, /template="https:\/\/blog\.solus\.games\/search\/\?q=\{searchTerms\}"/);
  assert.match(openSearch, /https:\/\/blog\.solus\.games\/favicon\.svg/);

  const sitemap = await readFile(path.join(tempRoot, "dist", "sitemap.xml"), "utf8");
  assert.match(sitemap, /https:\/\/blog\.solus\.games\/posts\/markdown-edge-cases\//);
  assert.match(sitemap, /https:\/\/blog\.solus\.games\/years\/2026\//);
  assert.match(sitemap, /https:\/\/blog\.solus\.games\/about\//);
  assert.match(sitemap, new RegExp(new URL("/categories/图形渲染/", "https://blog.solus.games/").toString()));
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
