import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const dist = path.join(root, "dist");
const contentDir = path.join(root, "content");
const postsDir = path.join(contentDir, "posts");
const siteConfig = JSON.parse(await readFile(path.join(contentDir, "site.json"), "utf8"));
const site = {
  ...siteConfig,
  baseUrl: (process.env.SITE_URL || process.env.CF_PAGES_URL || siteConfig.baseUrl).replace(/\/+$/, "/")
};
const assetVersion = encodeURIComponent(
  (process.env.CF_PAGES_COMMIT_SHA || siteConfig.assetVersion || "local").slice(0, 12)
);

function assetUrl(pathname) {
  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}v=${assetVersion}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function slugify(value = "") {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  if (slug) return slug;
  return `post-${crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 8)}`;
}

function parseFrontMatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: source };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    data[key] = parseFrontMatterValue(raw);
  }

  return { data, body: match[2] };
}

function parseFrontMatterValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return value.replace(/^["']|["']$/g, "");
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(date));
}

function readingTime(text) {
  const latinWords = text.match(/[A-Za-z0-9_]+/g)?.length || 0;
  const cjkChars = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const minutes = Math.max(1, Math.ceil((latinWords + cjkChars / 2) / 220));
  return `${minutes} 分钟`;
}

function stripMarkdown(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textLines(value, maxChars, maxLines) {
  const chars = Array.from(String(value || "").trim());
  const lines = [];
  let line = "";

  for (const char of chars) {
    if (line.length >= maxChars && !/[，。；：、,.!?]/.test(char)) {
      lines.push(line);
      line = "";
      if (lines.length >= maxLines) break;
    }
    line += char;
  }

  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function hashColor(seed, palette) {
  const hash = crypto.createHash("sha1").update(String(seed)).digest();
  return palette[hash[0] % palette.length];
}

function coverPalette(post) {
  const palettes = {
    Unity: ["#4257dd", "#46d7bf", "#eaf0ff", "#17243a"],
    工具链: ["#17243a", "#46d7bf", "#ffaf61", "#eef6ff"],
    图形渲染: ["#3650d8", "#8aa0ff", "#46d7bf", "#f4f8ff"],
    随笔: ["#ffaf61", "#6577ff", "#46d7bf", "#fff8e8"]
  };
  return palettes[post.category] || [
    hashColor(post.slug, ["#4257dd", "#0f766e", "#b45309", "#7c3aed"]),
    hashColor(`${post.slug}-b`, ["#46d7bf", "#8aa0ff", "#ffaf61", "#38bdf8"]),
    "#f4f8ff",
    "#17243a"
  ];
}

function coverMotif(post, colors) {
  const text = normalizeForSearch([post.title, post.summary, post.category, post.tags.join(" "), post.text].join(" "));
  if (/shader|渲染|draw call|overdraw|纹理|图形/.test(text)) {
    return `<circle cx="742" cy="282" r="112" fill="url(#sphere)" opacity=".96"/>
      <circle cx="896" cy="402" r="72" fill="${colors[1]}" opacity=".82"/>
      <path d="M620 500h360" stroke="#fff" stroke-width="18" stroke-linecap="round" opacity=".72"/>
      <path d="M640 232l210 122M730 150l60 250" stroke="#fff" stroke-width="4" opacity=".54"/>`;
  }
  if (/工具链|自动化|工程效率|pipeline|构建|脚本/.test(text)) {
    return `<circle cx="690" cy="300" r="92" fill="${colors[0]}" opacity=".92"/>
      <circle cx="895" cy="372" r="112" fill="${colors[1]}" opacity=".86"/>
      <path d="M760 300h105M840 260l82 72-82 72" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M570 462l128-128M940 190l92 92" stroke="${colors[2]}" stroke-width="24" stroke-linecap="round"/>`;
  }
  if (/性能|profiler|cpu|gpu|内存|io|优化/.test(text)) {
    return `<path d="M612 438a210 210 0 1 1 420 0" fill="none" stroke="#ffffff" stroke-width="44" stroke-linecap="round" opacity=".72"/>
      <path d="M612 438a210 210 0 0 1 312-184" fill="none" stroke="${colors[1]}" stroke-width="44" stroke-linecap="round"/>
      <path d="M820 430l154-138" stroke="${colors[3]}" stroke-width="18" stroke-linecap="round"/>
      <circle cx="820" cy="430" r="34" fill="${colors[3]}"/>`;
  }
  return `<path d="M720 158l158 78-158 78-158-78z" fill="${colors[1]}" opacity=".88"/>
    <path d="M562 236l158 78v158l-158-78z" fill="${colors[0]}" opacity=".9"/>
    <path d="M878 236l-158 78v158l158-78z" fill="${colors[2]}" opacity=".9"/>
    <rect x="880" y="394" width="128" height="92" rx="20" fill="#fff" opacity=".58"/>
    <circle cx="610" cy="500" r="46" fill="${colors[2]}" opacity=".76"/>`;
}

function normalizeForSearch(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function generatedPostCover(post) {
  const dir = path.join(root, "assets", "posts");
  await mkdir(dir, { recursive: true });

  const target = path.join(dir, `${post.slug}.svg`);
  const url = `/assets/posts/${post.slug}.svg`;
  const colors = coverPalette(post);
  const keywords = [post.category, ...post.tags].filter(Boolean).slice(0, 4);
  const titleLines = textLines(post.title, 14, 2);
  const summaryLines = textLines(post.summary, 24, 2);
  const seed = crypto
    .createHash("sha1")
    .update([post.title, post.summary, post.category, post.tags.join(","), post.text].join("\n"))
    .digest("hex")
    .slice(0, 12);
  const motif = coverMotif(post, colors);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img" aria-label="${escapeAttr(post.title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${colors[2]}"/>
      <stop offset=".52" stop-color="#f8fbff"/>
      <stop offset="1" stop-color="${colors[1]}" stop-opacity=".62"/>
    </linearGradient>
    <radialGradient id="sphere" cx=".34" cy=".25" r=".74">
      <stop offset="0" stop-color="#fff"/>
      <stop offset=".38" stop-color="${colors[1]}"/>
      <stop offset="1" stop-color="${colors[0]}"/>
    </radialGradient>
    <pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse">
      <path d="M54 0H0v54" fill="none" stroke="${colors[0]}" stroke-opacity=".12"/>
    </pattern>
    <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="20" stdDeviation="18" flood-color="${colors[0]}" flood-opacity=".18"/>
    </filter>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect width="1200" height="675" fill="url(#grid)"/>
  <circle cx="214" cy="496" r="168" fill="#fff" opacity=".44"/>
  <g filter="url(#shadow)">${motif}</g>
  <g>
    <rect x="78" y="82" width="${Math.max(92, keywords[0]?.length * 18 || 92)}" height="36" rx="18" fill="${colors[0]}" opacity=".12"/>
    <text x="100" y="106" fill="${colors[0]}" font-size="18" font-weight="800" font-family="Microsoft YaHei, PingFang SC, Arial">${escapeHtml(keywords[0] || "文章")}</text>
    ${titleLines
      .map(
        (line, index) =>
          `<text x="78" y="${190 + index * 70}" fill="${colors[3]}" font-size="58" font-weight="900" font-family="Microsoft YaHei, PingFang SC, Arial">${escapeHtml(line)}</text>`
      )
      .join("")}
    ${summaryLines
      .map(
        (line, index) =>
          `<text x="82" y="${365 + index * 34}" fill="#52647e" font-size="24" font-weight="650" font-family="Microsoft YaHei, PingFang SC, Arial">${escapeHtml(line)}</text>`
      )
      .join("")}
    ${keywords
      .slice(1)
      .map((tag, index) => {
        const x = 82 + index * 116;
        return `<rect x="${x}" y="500" width="94" height="34" rx="17" fill="#fff" opacity=".72"/>
    <text x="${x + 17}" y="523" fill="${colors[0]}" font-size="16" font-weight="800" font-family="Microsoft YaHei, PingFang SC, Arial">${escapeHtml(tag)}</text>`;
      })
      .join("")}
  </g>
  <text x="1080" y="612" text-anchor="end" fill="${colors[0]}" font-size="13" font-weight="800" opacity=".34" font-family="Arial">SOLUS ${seed}</text>
</svg>`;

  await writeFile(target, svg, "utf8");
  return url;
}

function inlineMarkdown(text) {
  let html = escapeHtml(text);
  const codeTokens = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE${codeTokens.length}@@`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });
  html = html.replace(/!\[([^\]]*)]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
  html = html.replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  codeTokens.forEach((code, index) => {
    html = html.replace(`@@CODE${index}@@`, code);
  });
  return html;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  const headings = [];
  let paragraph = [];
  let listType = null;
  let codeBlock = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function closeList() {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (codeBlock) {
        html.push(
          `<pre><code>${escapeHtml(codeBlock.lines.join("\n"))}</code></pre>`
        );
        codeBlock = null;
      } else {
        flushParagraph();
        closeList();
        codeBlock = { lines: [] };
      }
      continue;
    }

    if (codeBlock) {
      codeBlock.lines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text);
      headings.push({ level, text, id });
      html.push(`<h${level} id="${id}">${inlineMarkdown(text)}</h${level}>`);
      continue;
    }

    if (/^>\s+/.test(trimmed)) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${inlineMarkdown(trimmed.replace(/^>\s+/, ""))}</blockquote>`);
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = unordered ? "ul" : "ol";
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        html.push(`<${listType}>`);
      }
      html.push(`<li>${inlineMarkdown((unordered || ordered)[1])}</li>`);
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushParagraph();
      closeList();
      html.push("<hr />");
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();
  return { html: html.join("\n"), headings };
}

async function copyDirectory(from, to) {
  await mkdir(to, { recursive: true });
  const entries = await readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(source, target);
    } else if (entry.isFile()) {
      await copyFile(source, target);
    }
  }
}

async function writePage(route, html) {
  const target = path.join(dist, route, "index.html");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html, "utf8");
}

function absoluteUrl(pathname) {
  return new URL(pathname, site.baseUrl).toString();
}

function categoryCover(category) {
  return site.categoryCovers?.[category] || site.heroCover || "/assets/hero-game-tech.png";
}

function resolvePostCover(cover, category) {
  if (!cover || cover === "/assets/hero-game-tech.png") return categoryCover(category);
  return cover;
}

function pageLayout({ title, description, current = "", body, canonical = "/" }) {
  const fullTitle = title === site.title ? title : `${title} | ${site.title}`;
  const nav = site.navigation
    .map((item) => {
      const active = current === item.href ? " active" : "";
      return `<a class="${active}" href="${item.href}">${escapeHtml(item.label)}</a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="${escapeAttr(site.language || "zh-CN")}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeAttr(description || site.description)}" />
    <link rel="canonical" href="${escapeAttr(absoluteUrl(canonical))}" />
    <link rel="alternate" type="application/rss+xml" title="${escapeAttr(site.title)}" href="/rss.xml" />
    <script>
      (() => {
        try {
          const stored = localStorage.getItem("solus-theme");
          const theme = stored || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
          document.documentElement.dataset.theme = theme;
        } catch {
          document.documentElement.dataset.theme = "light";
        }
      })();
    </script>
    <link rel="stylesheet" href="${assetUrl("/src/styles.css")}" />
    <title>${escapeHtml(fullTitle)}</title>
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="/" aria-label="${escapeAttr(site.title)}">
        <span class="brand-mark" aria-hidden="true"><span></span></span>
        <span><strong>${escapeHtml(site.brand)}</strong><small>${escapeHtml(site.title)}</small></span>
      </a>
      <nav class="nav-links" aria-label="主导航">${nav}</nav>
      <form class="site-search" action="/search/" method="get">
        <label>
          <span class="sr-only">搜索文章</span>
          <input name="q" type="search" placeholder="搜索文章、标签" />
        </label>
        <button type="submit" aria-label="搜索">⌕</button>
      </form>
      <button class="theme-toggle" type="button" aria-label="切换深色模式" aria-pressed="false" data-theme-toggle>
        <span aria-hidden="true"></span>
      </button>
    </header>
    ${body}
    <footer class="site-footer">
      <p>© ${new Date().getFullYear()} ${escapeHtml(site.title)} · <a href="/rss.xml">RSS</a> · <a href="/sitemap.xml">Sitemap</a></p>
    </footer>
    <script type="module" src="${assetUrl("/src/site.js")}"></script>
    ${site.views?.enabled === false ? "" : `<script type="module" src="${assetUrl("/src/views.js")}"></script>`}
  </body>
</html>`;
}

function viewCountMeta(post) {
  if (site.views?.enabled === false) return "";
  return `<span class="view-count" data-view-slug="${escapeAttr(post.slug)}" hidden>阅读 --</span>`;
}

function giscusComments() {
  const comments = site.comments || {};
  const ready =
    comments.enabled === true &&
    comments.provider === "giscus" &&
    comments.repo &&
    comments.repoId &&
    comments.category &&
    comments.categoryId;

  if (!ready) return "";

  return `<section class="comments-section" id="comments" aria-labelledby="comments-title">
    <h2 id="comments-title">评论</h2>
    <script
      src="https://giscus.app/client.js"
      data-repo="${escapeAttr(comments.repo)}"
      data-repo-id="${escapeAttr(comments.repoId)}"
      data-category="${escapeAttr(comments.category)}"
      data-category-id="${escapeAttr(comments.categoryId)}"
      data-mapping="${escapeAttr(comments.mapping || "pathname")}"
      data-strict="${escapeAttr(comments.strict || "0")}"
      data-reactions-enabled="${escapeAttr(comments.reactionsEnabled || "1")}"
      data-emit-metadata="${escapeAttr(comments.emitMetadata || "0")}"
      data-input-position="${escapeAttr(comments.inputPosition || "bottom")}"
      data-theme="${escapeAttr(comments.theme || "preferred_color_scheme")}"
      data-lang="${escapeAttr(comments.language || site.language || "zh-CN")}"
      data-loading="lazy"
      crossorigin="anonymous"
      async>
    </script>
  </section>`;
}

function postCard(post, variant = "") {
  return `<article class="post-card ${variant}">
    <a class="thumb ${post.categorySlug}" href="${post.url}" style="--cover-image: url('${escapeAttr(post.cover)}')" aria-hidden="true">
      <span>${escapeHtml(post.category)}</span>
      <i></i>
    </a>
    <div class="post-card-body">
      <div class="post-meta">
        <time datetime="${escapeAttr(post.date)}">${formatDate(post.date)}</time>
        <span>${escapeHtml(post.readingTime)}</span>
        ${viewCountMeta(post)}
      </div>
      <h3><a href="${post.url}">${escapeHtml(post.title)}</a></h3>
      <p>${escapeHtml(post.summary)}</p>
      <div class="tag-row">${post.tags
        .slice(0, 4)
        .map((tag) => `<a href="/tags/${slugify(tag)}/">${escapeHtml(tag)}</a>`)
        .join("")}</div>
    </div>
  </article>`;
}

function archivePostCard(post) {
  return `<article class="archive-card">
    <a class="archive-card-thumb ${post.categorySlug}" href="${post.url}" style="--cover-image: url('${escapeAttr(post.cover)}')" aria-hidden="true">
      <span>${escapeHtml(post.category)}</span>
    </a>
    <div class="archive-card-body">
      <div class="post-meta">
        <time datetime="${escapeAttr(post.date)}">${formatDate(post.date)}</time>
        <span>${escapeHtml(post.readingTime)}</span>
        ${viewCountMeta(post)}
      </div>
      <h2><a href="${post.url}">${escapeHtml(post.title)}</a></h2>
      <p>${escapeHtml(post.summary)}</p>
      <div class="tag-row">${post.tags
        .slice(0, 4)
        .map((tag) => `<a href="/tags/${slugify(tag)}/">${escapeHtml(tag)}</a>`)
        .join("")}</div>
    </div>
  </article>`;
}

function sidebar(posts, categories, tags) {
  const rankFallback = posts.slice(0, 5);
  const postIndex = escapeAttr(
    JSON.stringify(
      posts.map((post) => ({
        slug: post.slug,
        title: post.title,
        url: post.url
      }))
    )
  );

  return `<aside class="blog-sidebar">
    <section class="sidebar-card">
      <h2>分类</h2>
      <div class="category-list">${categories
        .map(
          ([category, list]) =>
            `<a href="/categories/${slugify(category)}/"><span>${escapeHtml(category)}</span><b>${list.length}</b></a>`
        )
        .join("")}</div>
    </section>
    <section class="sidebar-card">
      <h2>热门标签</h2>
      <div class="tag-cloud">${tags
        .slice(0, 18)
        .map(([tag]) => `<a href="/tags/${slugify(tag)}/">${escapeHtml(tag)}</a>`)
        .join("")}</div>
    </section>
    <section class="sidebar-card">
      <h2>阅读排行</h2>
      <div class="reading-ranking-list" data-ranking-posts="${postIndex}">
        ${rankFallback
          .map(
            (post, index) =>
              `<a class="ranking-link" href="${post.url}" data-ranking-slug="${escapeAttr(post.slug)}"><b>${index + 1}</b><span>${escapeHtml(post.title)}</span><small>${escapeHtml(post.readingTime)}</small></a>`
          )
          .join("")}
      </div>
    </section>
    <section class="sidebar-card subscribe-card">
      <h2>${escapeHtml(site.subscribe.title)}</h2>
      <p>${escapeHtml(site.subscribe.description)}</p>
      <div class="subscribe-actions">
        <a class="button-link" href="${site.subscribe.rss}">打开 RSS</a>
        <button class="secondary-button" type="button" data-copy-rss="${escapeAttr(absoluteUrl(site.subscribe.rss))}">复制链接</button>
      </div>
    </section>
  </aside>`;
}

function groupBy(posts, keyGetter) {
  const map = new Map();
  for (const post of posts) {
    const keys = Array.isArray(keyGetter(post)) ? keyGetter(post) : [keyGetter(post)];
    for (const key of keys) {
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(post);
    }
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-CN"));
}

function archivePostsPerPage() {
  const configured = Number.parseInt(site.archivePostsPerPage || site.postsPerPage || 9, 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 9;
}

function pageHref(basePath, page) {
  const cleanBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return page === 1 ? cleanBase : `${cleanBase}page/${page}/`;
}

function pageRoute(baseRoute, page) {
  return page === 1 ? baseRoute : path.join(baseRoute, "page", String(page));
}

function paginate(list, page, perPage) {
  const totalPages = Math.max(1, Math.ceil(list.length / perPage));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * perPage;
  return {
    currentPage,
    totalPages,
    items: list.slice(start, start + perPage)
  };
}

function paginationUrls(basePath, list) {
  const totalPages = Math.max(1, Math.ceil(list.length / archivePostsPerPage()));
  return Array.from({ length: totalPages }, (_, index) => pageHref(basePath, index + 1));
}

function archiveFilters(categories, activeCategory, totalCount) {
  const allActive = !activeCategory;
  return `<div class="archive-filter-bar">
    <nav class="archive-filters" aria-label="文章分类筛选">
      <a class="${allActive ? "active" : ""}" href="/archive/">全部 <b>${totalCount}</b></a>
      ${categories
        .map(([category, list]) => {
          const active = category === activeCategory ? " active" : "";
          return `<a class="${active}" href="/categories/${slugify(category)}/">${escapeHtml(category)} <b>${list.length}</b></a>`;
        })
        .join("")}
    </nav>
  </div>`;
}

function paginationNav(basePath, currentPage, totalPages) {
  if (totalPages <= 1) return "";
  const previous =
    currentPage > 1
      ? `<a class="pagination-control" href="${pageHref(basePath, currentPage - 1)}">上一页</a>`
      : `<span class="pagination-control disabled" aria-disabled="true">上一页</span>`;
  const next =
    currentPage < totalPages
      ? `<a class="pagination-control" href="${pageHref(basePath, currentPage + 1)}">下一页</a>`
      : `<span class="pagination-control disabled" aria-disabled="true">下一页</span>`;

  const pages = Array.from(
    { length: totalPages },
    (_, index) => {
      const page = index + 1;
      return page === currentPage
        ? `<span class="active" aria-current="page">${page}</span>`
        : `<a href="${pageHref(basePath, page)}">${page}</a>`;
    }
  ).join("");

  return `<nav class="pagination" aria-label="文章分页">${previous}${pages}${next}</nav>`;
}

async function loadPosts() {
  const files = (await readdir(postsDir)).filter((file) => file.endsWith(".md"));
  const posts = [];

  for (const file of files) {
    const raw = await readFile(path.join(postsDir, file), "utf8");
    const { data, body } = parseFrontMatter(raw);
    if (data.status === "draft") continue;

    const title = data.title || path.basename(file, ".md");
    const slug = data.slug || slugify(title);
    const summary = data.summary || stripMarkdown(body).slice(0, 120);
    const category = data.category || "未分类";
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const rendered = markdownToHtml(body);
    const text = stripMarkdown(body);

    const post = {
      title,
      slug,
      url: `/posts/${slug}/`,
      date: data.date || "1970-01-01",
      updated: data.updated || data.date || "1970-01-01",
      category,
      categorySlug: slugify(category),
      tags,
      summary,
      featured: Boolean(data.featured),
      readingTime: readingTime(body),
      html: rendered.html,
      headings: rendered.headings,
      source: file,
      text
    };

    post.cover =
      data.cover && data.cover !== "/assets/hero-game-tech.png"
        ? resolvePostCover(data.cover, category)
        : await generatedPostCover(post);

    posts.push(post);
  }

  return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function homePage(posts, categories, tags) {
  const featuredPosts = posts.filter((post) => post.featured);
  const latest = posts.filter((post) => !post.featured).slice(0, site.postsPerPage || 9);
  const hero = site.hero;

  const body = `<main>
    <section class="hero-section">
      <div class="hero-inner" style="--hero-cover: url('${escapeAttr(site.heroCover || "/assets/hero-game-tech.png")}')">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(hero.eyebrow)}</p>
          <h1>${escapeHtml(hero.title)}</h1>
          <p>${escapeHtml(hero.subtitle)}</p>
          <div class="hero-actions">
            <a class="button-link" href="#latest-posts">${escapeHtml(hero.primaryAction)}</a>
            <a class="ghost-link" href="/archive/">${escapeHtml(hero.secondaryAction)}</a>
          </div>
        </div>
      </div>
    </section>
    <section class="content-shell">
      <div class="content-main">
        ${featuredPosts.length ? `<section class="section-block featured-section">
          <div class="section-head">
            <div>
              <span class="section-kicker">Featured</span>
              <h2>精选文章</h2>
            </div>
          </div>
          <div class="post-grid">${featuredPosts.map((post) => archivePostCard(post)).join("")}</div>
        </section>` : ""}
        ${latest.length ? `<section id="latest-posts" class="section-block">
          <div class="section-head">
            <div>
              <span class="section-kicker">Latest Posts</span>
              <h2>最新文章</h2>
            </div>
            <a href="/archive/">全部文章 →</a>
          </div>
          <div class="post-grid">${latest.map((post) => archivePostCard(post)).join("")}</div>
        </section>` : ""}
      </div>
      ${sidebar(posts, categories, tags)}
    </section>
  </main>`;

  return pageLayout({ title: site.title, description: site.description, current: "/", body, canonical: "/" });
}

function archivePage({ posts, categories, activeCategory = "", basePath = "/archive/", page = 1, totalCount }) {
  const perPage = archivePostsPerPage();
  const { items, currentPage, totalPages } = paginate(posts, page, perPage);
  const body = `<main class="page-shell article-index-page">
    <h1 class="sr-only">${activeCategory ? `${activeCategory} 分类文章` : "全部文章"}</h1>
    ${archiveFilters(categories, activeCategory, totalCount)}
    <div class="article-index-grid">${items.map((post) => archivePostCard(post)).join("")}</div>
    ${paginationNav(basePath, currentPage, totalPages)}
  </main>`;
  return pageLayout({
    title: activeCategory ? `分类：${activeCategory}` : "全部文章",
    description: activeCategory ? `${activeCategory} 分类下的全部文章。` : "按时间浏览全部文章。",
    current: "/archive/",
    body,
    canonical: pageHref(basePath, currentPage)
  });
}

async function writeArchivePages({ posts, categories, baseRoute, basePath, activeCategory = "", totalCount }) {
  const totalPages = Math.max(1, Math.ceil(posts.length / archivePostsPerPage()));
  for (let page = 1; page <= totalPages; page += 1) {
    await writePage(
      pageRoute(baseRoute, page),
      archivePage({
        posts,
        categories,
        activeCategory,
        basePath,
        page,
        totalCount
      })
    );
  }
}

function taxonomyIndexPage(title, description, entries, basePath, current) {
  const body = `<main class="page-shell narrow">
    <header class="page-title">
      <span class="section-kicker">${escapeHtml(title)}</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
    </header>
    <div class="taxonomy-grid">${entries
      .map(
        ([name, list]) => `<a class="taxonomy-card" href="${basePath}${slugify(name)}/">
          <span>${escapeHtml(name)}</span>
          <b>${list.length} 篇</b>
        </a>`
      )
      .join("")}</div>
  </main>`;
  return pageLayout({ title, description, current, body, canonical: current });
}

function tagIndexPage(entries, posts) {
  const body = `<main class="page-shell article-index-page">
    <section class="tag-cloud-page">
      <header class="tag-cloud-head">
        <span class="section-kicker">Tags</span>
        <h1>标签云</h1>
        <p>选择一个标签查看对应文章。标签越大，说明相关文章越多。</p>
      </header>
      ${tagCloud(entries)}
    </section>
    <div class="article-index-grid">${posts.map((post) => archivePostCard(post)).join("")}</div>
  </main>`;
  return pageLayout({ title: "标签", description: "按标签浏览文章。", current: "/tags/", body, canonical: "/tags/" });
}

function tagWeightClass(count, maxCount) {
  if (maxCount <= 1) return "size-2";
  const weight = Math.ceil((count / maxCount) * 5);
  return `size-${Math.min(Math.max(weight, 1), 5)}`;
}

function tagCloud(entries, activeTag = "") {
  const maxCount = Math.max(...entries.map(([, list]) => list.length), 1);
  return `<nav class="tag-cloud-board" aria-label="标签云">
    <a class="tag-cloud-item all-tags ${activeTag ? "" : "active"}" href="/tags/">全部文章 <b>${entries.length}</b></a>
    ${entries
      .map(([tag, list]) => {
        const active = tag === activeTag ? " active" : "";
        return `<a class="tag-cloud-item ${tagWeightClass(list.length, maxCount)}${active}" href="/tags/${slugify(tag)}/"><span>${escapeHtml(tag)}</span><b>${list.length}</b></a>`;
      })
      .join("")}
  </nav>`;
}

function tagListPage({ tag, posts, tags }) {
  const body = `<main class="page-shell article-index-page">
    <section class="tag-cloud-page">
      <header class="tag-cloud-head">
        <span class="section-kicker">Tag</span>
        <h1>${escapeHtml(tag)}</h1>
        <p>共 ${posts.length} 篇文章使用这个标签。</p>
      </header>
      ${tagCloud(tags, tag)}
    </section>
    <div class="article-index-grid">${posts.map((post) => archivePostCard(post)).join("")}</div>
  </main>`;
  return pageLayout({
    title: `标签：${tag}`,
    description: `带有 ${tag} 标签的全部文章。`,
    current: "/tags/",
    body,
    canonical: `/tags/${slugify(tag)}/`
  });
}

function listPage({ title, description, posts, current, canonical }) {
  const body = `<main class="page-shell">
    <header class="page-title">
      <span class="section-kicker">Collection</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
    </header>
    <div class="post-grid">${posts.map((post) => postCard(post)).join("")}</div>
  </main>`;
  return pageLayout({ title, description, current, body, canonical });
}

function postPage(post, posts) {
  const related = posts
    .filter((item) => item.slug !== post.slug)
    .map((item) => ({
      item,
      score: (item.category === post.category ? 3 : 0) + item.tags.filter((tag) => post.tags.includes(tag)).length
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.item.date) - new Date(a.item.date))
    .map(({ item }) => item)
    .slice(0, 12);
  const fallbackRelated = related.length ? related : posts.filter((item) => item.slug !== post.slug).slice(0, 8);
  const toc = post.headings
    .filter((heading) => heading.level === 2 || heading.level === 3)
    .map((heading) => `<a class="level-${heading.level}" href="#${heading.id}">${escapeHtml(heading.text)}</a>`)
    .join("");

  const body = `<main class="article-shell">
    <aside class="article-aside article-related-aside">
      ${fallbackRelated.length ? `<section class="sidebar-card related-card"><h2>相关文章</h2>${fallbackRelated.map((item) => `<a class="related-link" href="${item.url}"><span>${escapeHtml(item.title)}</span><small>${formatDate(item.date)} · ${escapeHtml(item.category)}</small></a>`).join("")}</section>` : ""}
    </aside>
    <article class="article-page" data-post-slug="${escapeAttr(post.slug)}">
      <header class="article-hero" style="--article-cover: url('${escapeAttr(post.cover)}')">
        <a class="category-pill" href="/categories/${post.categorySlug}/">${escapeHtml(post.category)}</a>
        <h1>${escapeHtml(post.title)}</h1>
        <p>${escapeHtml(post.summary)}</p>
        <div class="post-meta">
          <time datetime="${post.date}">${formatDate(post.date)}</time>
          <span>${post.readingTime}</span>
          ${viewCountMeta(post)}
        </div>
      </header>
      <div class="article-content">${post.html}</div>
      <footer class="article-footer">
        <div class="tag-row">${post.tags.map((tag) => `<a href="/tags/${slugify(tag)}/">${escapeHtml(tag)}</a>`).join("")}</div>
      </footer>
      ${giscusComments()}
    </article>
    <aside class="article-aside article-toc-aside">
      ${toc ? `<section class="sidebar-card toc"><h2>目录</h2>${toc}</section>` : ""}
    </aside>
  </main>
  <div class="reading-pill" data-post-slug="${escapeAttr(post.slug)}" data-reading-minutes="${Number.parseInt(post.readingTime, 10) || 1}" aria-label="阅读进度"><span id="readingPercent">0%</span><span id="readingRemaining">剩余 ≈ ${escapeHtml(post.readingTime)}</span></div>
  <script type="module" src="${assetUrl("/src/article.js")}"></script>`;

  return pageLayout({ title: post.title, description: post.summary, body, canonical: post.url });
}

async function aboutPage() {
  const raw = await readFile(path.join(contentDir, "about.md"), "utf8");
  const { data, body } = parseFrontMatter(raw);
  const rendered = markdownToHtml(body);
  const pageBody = `<main class="page-shell narrow">
    <article class="article-page simple-page">
      <header class="page-title">
        <span class="section-kicker">About</span>
        <h1>${escapeHtml(data.title || "关于")}</h1>
        <p>${escapeHtml(data.summary || "")}</p>
      </header>
      <div class="article-content">${rendered.html}</div>
    </article>
  </main>`;
  return pageLayout({ title: data.title || "关于", description: data.summary || site.description, current: "/about/", body: pageBody, canonical: "/about/" });
}

function searchPage() {
  const body = `<main class="page-shell narrow">
    <header class="page-title">
      <span class="section-kicker">Search</span>
      <h1>搜索文章</h1>
      <p>输入关键词，按标题、摘要、正文、分类和标签搜索。</p>
    </header>
    <section class="search-page-card">
      <label>
        <span class="sr-only">搜索关键词</span>
        <input id="searchInputPage" type="search" placeholder="例如 Unity、渲染、工具链" autofocus />
      </label>
      <div id="searchResults" class="search-results"></div>
    </section>
  </main>
  <script type="module" src="${assetUrl("/src/search.js")}"></script>`;
  return pageLayout({ title: "搜索文章", description: "搜索博客文章。", current: "/search/", body, canonical: "/search/" });
}

function rss(posts) {
  const items = posts
    .slice(0, 20)
    .map(
      (post) => `<item>
  <title>${escapeHtml(post.title)}</title>
  <link>${absoluteUrl(post.url)}</link>
  <guid>${absoluteUrl(post.url)}</guid>
  <pubDate>${new Date(post.date).toUTCString()}</pubDate>
  <description>${escapeHtml(post.summary)}</description>
</item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>${escapeHtml(site.title)}</title>
  <link>${absoluteUrl("/")}</link>
  <description>${escapeHtml(site.description)}</description>
  <language>${escapeHtml(site.language || "zh-CN")}</language>
  ${items}
</channel>
</rss>`;
}

function sitemap(posts, categories, tags) {
  const archiveUrls = paginationUrls("/archive/", posts);
  const categoryUrls = categories.flatMap(([category, list]) =>
    paginationUrls(`/categories/${slugify(category)}/`, list)
  );
  const urls = [
    "/",
    ...archiveUrls,
    "/tags/",
    "/search/",
    "/about/",
    ...posts.map((post) => post.url),
    ...categoryUrls,
    ...tags.map(([tag]) => `/tags/${slugify(tag)}/`)
  ];
  return `<?xml version="1.0" encoding="UTF-8" ?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${absoluteUrl(url)}</loc></url>`).join("\n")}
</urlset>`;
}

const posts = await loadPosts();
const categories = groupBy(posts, (post) => post.category);
const tags = groupBy(posts, (post) => post.tags);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyDirectory(path.join(root, "assets"), path.join(dist, "assets"));
await copyDirectory(path.join(root, "src"), path.join(dist, "src"));
await copyDirectory(path.join(root, "public"), dist).catch((error) => {
  if (error.code !== "ENOENT") throw error;
});

await writePage(".", homePage(posts, categories, tags));
await writeArchivePages({
  posts,
  categories,
  baseRoute: "archive",
  basePath: "/archive/",
  totalCount: posts.length
});
await writePage("tags", tagIndexPage(tags, posts));
await writePage("search", searchPage());
await writePage("about", await aboutPage());

for (const post of posts) {
  await writePage(path.join("posts", post.slug), postPage(post, posts));
}

for (const [category, list] of categories) {
  const categorySlug = slugify(category);
  await writeArchivePages({
    posts: list,
    categories,
    activeCategory: category,
    baseRoute: path.join("categories", categorySlug),
    basePath: `/categories/${categorySlug}/`,
    totalCount: posts.length
  });
}

for (const [tag, list] of tags) {
  await writePage(
    path.join("tags", slugify(tag)),
    tagListPage({
      tag,
      posts: list,
      tags
    })
  );
}

await writeFile(path.join(dist, "search-index.json"), JSON.stringify(posts.map((post) => ({
  title: post.title,
  slug: post.slug,
  url: post.url,
  date: post.date,
  category: post.category,
  tags: post.tags,
  cover: post.cover,
  readingTime: post.readingTime,
  summary: post.summary,
  text: post.text
})), null, 2), "utf8");
await writeFile(path.join(dist, "rss.xml"), rss(posts), "utf8");
await writeFile(path.join(dist, "sitemap.xml"), sitemap(posts, categories, tags), "utf8");
await writeFile(
  path.join(dist, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl("/sitemap.xml")}\n`,
  "utf8"
);

console.log(`Built ${posts.length} posts into dist/`);
