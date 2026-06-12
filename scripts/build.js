import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const dist = path.join(root, "dist");
const contentDir = path.join(root, "content");
const postsDir = path.join(contentDir, "posts");
const siteConfig = JSON.parse(await readFile(path.join(contentDir, "site.json"), "utf8"));
const site = {
  ...siteConfig,
  baseUrl: (process.env.SITE_URL || siteConfig.baseUrl).replace(/\/+$/, "/")
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

function hashColor(seed, palette) {
  const hash = crypto.createHash("sha1").update(String(seed)).digest();
  return palette[hash[0] % palette.length];
}

function coverPalette(post) {
  const palettes = {
    Unity: ["#0b1020", "#60a5fa", "#8b5cf6", "#151827", "#eef4ff"],
    工具链: ["#09131a", "#2dd4bf", "#38bdf8", "#13202b", "#eefcff"],
    图形渲染: ["#07111f", "#22d3ee", "#60a5fa", "#111d2d", "#f8fafc"],
    性能优化: ["#0d1020", "#f59e0b", "#38bdf8", "#171b2a", "#fff7ed"],
    架构设计: ["#0b1220", "#93c5fd", "#14b8a6", "#172033", "#f1f5f9"],
    随笔: ["#10151d", "#94a3b8", "#14b8a6", "#1a2430", "#f8fafc"]
  };
  return palettes[post.category] || [
    hashColor(post.slug, ["#0b1020", "#0f172a", "#111827", "#10151d"]),
    hashColor(`${post.slug}-a`, ["#38bdf8", "#5eead4", "#60a5fa", "#22d3ee"]),
    hashColor(`${post.slug}-b`, ["#8b5cf6", "#93c5fd", "#14b8a6", "#64748b"]),
    "#151f2d",
    "#edf2f8"
  ];
}

function coverMotif(post, colors) {
  const text = normalizeForSearch([post.title, post.summary, post.category, post.tags.join(" "), post.text].join(" "));
  const hasSpecificCoverCategory = ["工具链", "Unity", "图形渲染", "性能优化", "随笔"].includes(post.category);
  if (post.category === "工具链" || (!hasSpecificCoverCategory && /工具链|自动化|工程效率|pipeline|构建|脚本/.test(text))) {
    return `<path d="M170 338h860" stroke="${colors[1]}" stroke-width="8" stroke-linecap="round" opacity=".5"/>
      <path d="M278 338c74-74 146-74 220 0s148 74 224 0 150-74 226 0" fill="none" stroke="${colors[2]}" stroke-width="4" opacity=".68"/>
      ${[178, 360, 542, 724, 906]
        .map(
          (x, index) => `<g>
            <rect x="${x}" y="${index % 2 ? 208 : 248}" width="126" height="126" rx="16" fill="${colors[3]}" stroke="${index % 2 ? colors[2] : colors[1]}" stroke-opacity=".56"/>
            <rect x="${x + 36}" y="${index % 2 ? 248 : 288}" width="54" height="44" rx="8" fill="${index % 2 ? colors[2] : colors[1]}" opacity=".82"/>
            <path d="M${x + 32} ${index % 2 ? 318 : 358}h62" stroke="#fff" stroke-opacity=".32" stroke-width="5" stroke-linecap="round"/>
          </g>`
        )
        .join("")}
      <rect x="348" y="486" width="504" height="48" rx="8" fill="${colors[3]}" stroke="${colors[1]}" stroke-opacity=".3"/>
      <path d="M390 510h84M528 510h130M706 510h104" stroke="${colors[1]}" stroke-width="6" stroke-linecap="round" opacity=".55"/>`;
  }
  if (post.category === "Unity" || (!hasSpecificCoverCategory && /unity|profiler|组件|scene|game view|inspector/.test(text))) {
    return `<rect x="146" y="116" width="410" height="438" rx="14" fill="${colors[3]}" stroke="${colors[1]}" stroke-opacity=".38"/>
      <rect x="146" y="116" width="410" height="48" rx="14" fill="#020617" opacity=".38"/>
      <circle cx="184" cy="140" r="8" fill="${colors[1]}" opacity=".8"/>
      <circle cx="212" cy="140" r="8" fill="${colors[2]}" opacity=".72"/>
      <path d="M190 210h286M190 260h232M190 310h286M190 360h174M190 410h262" stroke="#9fb7d1" stroke-opacity=".18" stroke-width="10" stroke-linecap="round"/>
      <rect x="610" y="132" width="402" height="206" rx="14" fill="${colors[3]}" stroke="${colors[2]}" stroke-opacity=".38"/>
      <path d="M652 292c44-82 96 18 142-36 38-46 70-110 112-36 24 42 48 46 72 22" fill="none" stroke="${colors[1]}" stroke-width="6" stroke-linecap="round"/>
      <path d="M652 258h318M652 214h318M652 170h318" stroke="#9fb7d1" stroke-opacity=".12"/>
      <rect x="610" y="380" width="178" height="118" rx="14" fill="${colors[3]}" stroke="${colors[1]}" stroke-opacity=".32"/>
      <rect x="830" y="380" width="182" height="118" rx="14" fill="${colors[3]}" stroke="${colors[2]}" stroke-opacity=".32"/>
      <path d="M654 440h90M874 440h94" stroke="${colors[4]}" stroke-opacity=".22" stroke-width="8" stroke-linecap="round"/>`;
  }
  if (post.category === "图形渲染" || (!hasSpecificCoverCategory && /shader|渲染|draw call|overdraw|纹理|图形/.test(text))) {
    return `<rect x="146" y="120" width="568" height="394" rx="16" fill="${colors[3]}" stroke="${colors[1]}" stroke-opacity=".52"/>
      <path d="M188 426L306 292l126 82 142-168 98 126" fill="none" stroke="${colors[1]}" stroke-width="5" opacity=".86"/>
      <path d="M188 456h484M188 386h484M188 316h484M188 246h484M266 164v320M392 164v320M518 164v320M644 164v320" stroke="#8fb8d7" stroke-opacity=".16"/>
      <rect x="778" y="144" width="256" height="62" rx="10" fill="${colors[3]}" stroke="${colors[2]}" stroke-opacity=".4"/>
      <rect x="778" y="242" width="256" height="62" rx="10" fill="${colors[3]}" stroke="${colors[1]}" stroke-opacity=".4"/>
      <rect x="778" y="340" width="256" height="62" rx="10" fill="${colors[3]}" stroke="${colors[2]}" stroke-opacity=".4"/>
      <path d="M906 206v36M906 304v36M778 371h-64M778 273h-64M778 175h-64" stroke="${colors[1]}" stroke-opacity=".38" stroke-width="4"/>
      <circle cx="864" cy="522" r="42" fill="url(#sphere)"/>
      <circle cx="974" cy="522" r="42" fill="${colors[2]}" opacity=".72"/>`;
  }
  if (post.category === "性能优化" || (!hasSpecificCoverCategory && /性能|profiler|cpu|gpu|内存|io|优化/.test(text))) {
    return `<rect x="132" y="130" width="392" height="286" rx="16" fill="${colors[3]}" stroke="${colors[1]}" stroke-opacity=".42"/>
      <path d="M174 340c42-110 84 42 130-12 38-46 54-146 102-40 30 66 66 44 84 20" fill="none" stroke="${colors[1]}" stroke-width="6" stroke-linecap="round"/>
      <path d="M174 376h300M174 298h300M174 220h300" stroke="#8fb8d7" stroke-opacity=".14"/>
      <rect x="584" y="130" width="442" height="286" rx="16" fill="${colors[3]}" stroke="${colors[2]}" stroke-opacity=".38"/>
      ${[634, 704, 774, 844, 914].map((x, index) => `<rect x="${x}" y="${346 - index * 34}" width="34" height="${68 + index * 34}" rx="8" fill="${index % 2 ? colors[2] : colors[1]}" opacity=".78"/>`).join("")}
      <rect x="260" y="472" width="110" height="72" rx="12" fill="${colors[3]}" stroke="${colors[1]}" stroke-opacity=".32"/>
      <rect x="430" y="472" width="110" height="72" rx="12" fill="${colors[3]}" stroke="${colors[2]}" stroke-opacity=".32"/>
      <rect x="600" y="472" width="110" height="72" rx="12" fill="${colors[3]}" stroke="${colors[1]}" stroke-opacity=".32"/>
      <rect x="770" y="472" width="110" height="72" rx="12" fill="${colors[3]}" stroke="${colors[2]}" stroke-opacity=".32"/>`;
  }
  if (post.category === "随笔" || (!hasSpecificCoverCategory && /随笔|复盘|知识库|博客|笔记/.test(text))) {
    return `<path d="M286 130h390c42 0 76 34 76 76v350H362c-42 0-76-34-76-76z" fill="${colors[3]}" stroke="${colors[1]}" stroke-opacity=".32"/>
      <path d="M362 178h390v378H362c-42 0-76-34-76-76V254c0-42 34-76 76-76z" fill="#fff" opacity=".05"/>
      <path d="M386 250h246M386 306h290M386 362h214M386 418h262" stroke="${colors[1]}" stroke-width="9" stroke-linecap="round" opacity=".28"/>
      <path d="M824 170v372" stroke="${colors[2]}" stroke-width="4" stroke-linecap="round" opacity=".36"/>
      <circle cx="824" cy="228" r="28" fill="${colors[2]}" opacity=".66"/>
      <circle cx="824" cy="348" r="28" fill="${colors[1]}" opacity=".62"/>
      <circle cx="824" cy="468" r="28" fill="${colors[2]}" opacity=".46"/>
      <path d="M864 228h150M864 348h112M864 468h134" stroke="${colors[4]}" stroke-opacity=".2" stroke-width="8" stroke-linecap="round"/>
      <path d="M196 470l82-82 82 82-82 82z" fill="${colors[1]}" opacity=".42"/>`;
  }
  return `<path d="M384 186h332c44 0 80 36 80 80v248H464c-44 0-80-36-80-80z" fill="${colors[3]}" stroke="${colors[1]}" stroke-opacity=".32"/>
    <path d="M464 226h332v288H464c-44 0-80-36-80-80V306c0-44 36-80 80-80z" fill="#fff" opacity=".05"/>
    <path d="M484 276h210M484 330h258M484 384h176" stroke="${colors[1]}" stroke-width="10" stroke-linecap="round" opacity=".34"/>
    <rect x="810" y="194" width="154" height="112" rx="24" fill="${colors[3]}" stroke="${colors[2]}" stroke-opacity=".38"/>
    <rect x="820" y="344" width="186" height="132" rx="26" fill="${colors[3]}" stroke="${colors[1]}" stroke-opacity=".34"/>
    <path d="M216 470l88-88 88 88-88 88z" fill="${colors[1]}" opacity=".54"/>
    <circle cx="274" cy="214" r="54" fill="${colors[2]}" opacity=".42"/>`;
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
  const seed = crypto
    .createHash("sha1")
    .update([post.title, post.summary, post.category, post.tags.join(","), post.text].join("\n"))
    .digest("hex")
    .slice(0, 12);
  const glowX = 180 + Number.parseInt(seed.slice(0, 2), 16) * 2.5;
  const glowY = 90 + Number.parseInt(seed.slice(2, 4), 16) * 1.2;
  const motif = coverMotif(post, colors);
  const dateLabel = post.date.replaceAll("-", ".");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img" aria-label="${escapeAttr(post.title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${colors[0]}"/>
      <stop offset=".56" stop-color="#111827"/>
      <stop offset="1" stop-color="#05070d"/>
    </linearGradient>
    <radialGradient id="sphere" cx=".34" cy=".25" r=".74">
      <stop offset="0" stop-color="${colors[4]}"/>
      <stop offset=".38" stop-color="${colors[1]}"/>
      <stop offset="1" stop-color="${colors[2]}"/>
    </radialGradient>
    <pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse">
      <path d="M54 0H0v54" fill="none" stroke="${colors[4]}" stroke-opacity=".06"/>
    </pattern>
    <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="26" stdDeviation="22" flood-color="#000" flood-opacity=".42"/>
    </filter>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect width="1200" height="675" fill="url(#grid)"/>
  <circle cx="${glowX}" cy="${glowY}" r="260" fill="${colors[1]}" opacity=".12"/>
  <circle cx="982" cy="188" r="210" fill="${colors[2]}" opacity=".12"/>
  <circle cx="990" cy="548" r="168" fill="${colors[1]}" opacity=".08"/>
  <path d="M84 566C236 438 354 628 506 484s280-112 416-20 182 20 238-42" fill="none" stroke="${colors[1]}" stroke-opacity=".16" stroke-width="3"/>
  <g filter="url(#shadow)">${motif}</g>
  <g>
    <rect x="64" y="54" width="${Math.max(118, Array.from(post.category).length * 18 + 52)}" height="38" rx="6" fill="#0f172a" stroke="${colors[1]}" stroke-opacity=".52"/>
    <text x="84" y="79" fill="${colors[4]}" font-size="15" font-weight="700" font-family="Inter, Microsoft YaHei, Arial">${escapeHtml(post.category)}</text>
    <text x="64" y="618" fill="${colors[4]}" font-size="12" font-weight="700" opacity=".58" font-family="Inter, Arial">SOLUS ARCHIVE</text>
    <text x="1136" y="618" text-anchor="end" fill="${colors[4]}" font-size="12" font-weight="700" opacity=".58" font-family="Inter, Arial">${escapeHtml(dateLabel)}</text>
  </g>
</svg>`;

  await writeFile(target, svg, "utf8");
  return url;
}

async function existingGeneratedCover(slug, preferredExtensions = ["webp", "png", "jpg", "jpeg", "svg"]) {
  for (const extension of preferredExtensions) {
    const target = path.join(root, "assets", "posts", `${slug}.${extension}`);
    try {
      await access(target);
      return `/assets/posts/${slug}.${extension}`;
    } catch {
      // Try the next supported image format.
    }
  }
  return "";
}

function inlineMarkdown(text) {
  let html = escapeHtml(text);
  const codeTokens = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE${codeTokens.length}@@`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });
  html = html.replace(
    /!\[([^\]]*)]\(([^)]+)\)/g,
    (_, alt, src) => `<img src="${src}" alt="${alt}" loading="lazy" decoding="async" />`
  );
  html = html.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_, label, href) => {
    const external = /^https?:\/\//i.test(href) && !href.startsWith(site.baseUrl);
    const externalAttrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${href}"${externalAttrs}>${label}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  codeTokens.forEach((code, index) => {
    html = html.replace(`@@CODE${index}@@`, code);
  });
  return html;
}

function splitTableRow(line) {
  let value = line.trim();
  if (!value.includes("|")) return [];
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  return value.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function tableAlign(separator) {
  const value = separator.replace(/\s+/g, "");
  if (value.startsWith(":") && value.endsWith(":")) return "center";
  if (value.endsWith(":")) return "right";
  return "left";
}

function normalizeTableCells(cells, length) {
  return Array.from({ length }, (_, index) => cells[index] || "");
}

function renderTable(headers, separators, rows) {
  const aligns = normalizeTableCells(separators, headers.length).map(tableAlign);
  const head = normalizeTableCells(headers, headers.length)
    .map((cell, index) => `<th data-align="${aligns[index]}">${inlineMarkdown(cell)}</th>`)
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${normalizeTableCells(row, headers.length)
          .map((cell, index) => `<td data-align="${aligns[index]}">${inlineMarkdown(cell)}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
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

  function renderCodeBlock(block) {
    const languageAttr = block.language ? ` data-language="${escapeAttr(block.language)}"` : "";
    return `<pre${languageAttr}><button class="code-copy-button" type="button" data-copy-code>复制</button><code>${escapeHtml(block.lines.join("\n"))}</code></pre>`;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (codeBlock) {
        html.push(renderCodeBlock(codeBlock));
        codeBlock = null;
      } else {
        flushParagraph();
        closeList();
        codeBlock = { language: trimmed.slice(3).trim().split(/\s+/)[0] || "", lines: [] };
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

    const tableHeader = splitTableRow(line);
    const tableSeparator = splitTableRow(lines[index + 1] || "");
    if (tableHeader.length > 1 && isTableSeparator(lines[index + 1] || "")) {
      flushParagraph();
      closeList();
      const rows = [];
      index += 2;
      while (index < lines.length) {
        const row = splitTableRow(lines[index]);
        if (row.length === 0) {
          index -= 1;
          break;
        }
        rows.push(row);
        index += 1;
      }
      html.push(renderTable(tableHeader, tableSeparator, rows));
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
  if (codeBlock) {
    html.push(renderCodeBlock(codeBlock));
  }
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

function jsonLd(data) {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}

function siteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.title,
    alternateName: site.brand,
    url: absoluteUrl("/"),
    description: site.description,
    inLanguage: site.language || "zh-CN",
    potentialAction: {
      "@type": "SearchAction",
      target: `${absoluteUrl("/search/")}?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };
}

function articleSchema(post) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: post.title,
    description: post.summary,
    url: absoluteUrl(post.url),
    mainEntityOfPage: absoluteUrl(post.url),
    image: absoluteUrl(post.cover),
    datePublished: post.date,
    dateModified: post.updated || post.date,
    inLanguage: site.language || "zh-CN",
    articleSection: post.category,
    keywords: post.tags.join(", "),
    author: {
      "@type": "Organization",
      name: site.brand || site.title,
      url: absoluteUrl("/")
    },
    publisher: {
      "@type": "Organization",
      name: site.title,
      url: absoluteUrl("/")
    }
  };

  if (post.series) {
    schema.isPartOf = {
      "@type": "CreativeWorkSeries",
      name: post.series,
      url: absoluteUrl(`/series/${slugify(post.series)}/`)
    };
    if (post.seriesOrder > 0) schema.position = post.seriesOrder;
  }

  return schema;
}

function categoryCover(category) {
  return site.categoryCovers?.[category] || site.heroCover || "/assets/hero-game-tech.png";
}

function resolvePostCover(cover, category) {
  if (!cover || cover === "/assets/hero-game-tech.png") return categoryCover(category);
  return cover;
}

function pageLayout({
  title,
  description,
  current = "",
  body,
  canonical = "/",
  image = site.heroCover || "/assets/hero-game-tech.png",
  type = "website",
  structuredData = null
}) {
  const fullTitle = title === site.title ? title : `${title} | ${site.title}`;
  const pageDescription = description || site.description;
  const canonicalUrl = absoluteUrl(canonical);
  const socialImage = absoluteUrl(image || site.heroCover || "/assets/hero-game-tech.png");
  const bodyWithContentTarget = body.includes('id="content"')
    ? body
    : body.replace("<main", '<main id="content" tabindex="-1"');
  const nav = site.navigation
    .map((item) => {
      const active = current === item.href;
      const activeClass = active ? "active" : "";
      const ariaCurrent = active ? ` aria-current="page"` : "";
      return `<a class="${activeClass}" href="${item.href}"${ariaCurrent}>${escapeHtml(item.label)}</a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="${escapeAttr(site.language || "zh-CN")}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeAttr(pageDescription)}" />
    <meta name="application-name" content="${escapeAttr(site.title)}" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f6f8fb" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#090d12" />
    <meta property="og:type" content="${escapeAttr(type)}" />
    <meta property="og:title" content="${escapeAttr(fullTitle)}" />
    <meta property="og:description" content="${escapeAttr(pageDescription)}" />
    <meta property="og:url" content="${escapeAttr(canonicalUrl)}" />
    <meta property="og:site_name" content="${escapeAttr(site.title)}" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:image" content="${escapeAttr(socialImage)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(fullTitle)}" />
    <meta name="twitter:description" content="${escapeAttr(pageDescription)}" />
    <meta name="twitter:image" content="${escapeAttr(socialImage)}" />
    <link rel="canonical" href="${escapeAttr(canonicalUrl)}" />
    <link rel="alternate" type="application/rss+xml" title="${escapeAttr(site.title)}" href="${escapeAttr(absoluteUrl(site.subscribe?.rss || "/rss.xml"))}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="manifest" href="/site.webmanifest" />
    ${structuredData ? `<script type="application/ld+json">${jsonLd(structuredData)}</script>` : ""}
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
    <a class="skip-link" href="#content">跳到正文</a>
    <header class="site-header">
      <a class="brand" href="/" aria-label="${escapeAttr(site.title)}">
        <span class="brand-mark" aria-hidden="true"><span></span></span>
        <span><strong>${escapeHtml(site.brand)}</strong><small>${escapeHtml(site.tagline || site.title)}</small></span>
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
    ${bodyWithContentTarget}
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

function postMeta(post) {
  const updated =
    post.updated && post.updated !== post.date
      ? `<span class="updated-date">更新 ${formatDate(post.updated)}</span>`
      : "";
  return `<div class="post-meta">
    <time datetime="${escapeAttr(post.date)}">${formatDate(post.date)}</time>
    ${updated}
    <span>${escapeHtml(post.readingTime)}</span>
    ${viewCountMeta(post)}
  </div>`;
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

  return `<section
    class="comments-section"
    id="comments"
    aria-labelledby="comments-title"
    data-giscus-comments
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
    data-lang="${escapeAttr(comments.language || site.language || "zh-CN")}">
    <h2 id="comments-title">评论</h2>
    <div class="comments-loader" data-comments-loader>
      <p>评论会在靠近此处时加载。</p>
      <button class="secondary-button" type="button" data-load-comments>加载评论</button>
    </div>
    <div class="comments-frame" data-comments-frame></div>
  </section>`;
}

function postCard(post, variant = "") {
  return `<article class="post-card ${variant}">
    <a class="thumb ${post.categorySlug}" href="${post.url}" style="--cover-image: url('${escapeAttr(post.cover)}')" aria-label="${escapeAttr(post.title)}">
      <span>${escapeHtml(post.category)}</span>
      <i></i>
    </a>
    <div class="post-card-body">
      ${postMeta(post)}
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
    <a class="archive-card-thumb ${post.categorySlug}" href="${post.url}" style="--cover-image: url('${escapeAttr(post.cover)}')" aria-label="${escapeAttr(post.title)}">
      <span>${escapeHtml(post.category)}</span>
    </a>
    <div class="archive-card-body">
      ${postMeta(post)}
      <h2><a href="${post.url}">${escapeHtml(post.title)}</a></h2>
      <p>${escapeHtml(post.summary)}</p>
      <div class="tag-row">${post.tags
        .slice(0, 4)
        .map((tag) => `<a href="/tags/${slugify(tag)}/">${escapeHtml(tag)}</a>`)
        .join("")}</div>
    </div>
  </article>`;
}

function rankingPayload(posts) {
  return escapeAttr(
    JSON.stringify(
      posts.map((post) => ({
        slug: post.slug,
        title: post.title,
        url: post.url
      }))
    )
  );
}

function sidebar(posts, categories, tags) {
  const fallbackRanking = posts.slice(0, 5);
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
      <h2>标签索引</h2>
      <div class="tag-cloud">${tags
        .slice(0, 18)
        .map(([tag, list]) => `<a href="/tags/${slugify(tag)}/"><span>${escapeHtml(tag)}</span><b>${list.length}</b></a>`)
        .join("")}</div>
    </section>
    <section class="sidebar-card ranking-card">
      <h2>阅读排行</h2>
      <div class="ranking-list" data-ranking-posts="${rankingPayload(posts)}">${fallbackRanking
        .map(
          (post, index) =>
            `<a class="ranking-link" href="${post.url}"><b>${index + 1}</b><span>${escapeHtml(post.title)}</span><small>${formatDate(post.date)} · ${escapeHtml(post.category)}</small></a>`
        )
        .join("")}</div>
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

function archiveFilters(categories, activeCategory, totalCount) {
  const allActive = !activeCategory;
  return `<div class="archive-filter-bar">
    <nav class="archive-filters" aria-label="文章分类筛选">
      <a class="${allActive ? "active" : ""}" href="/archive/"${allActive ? ` aria-current="page"` : ""}>全部 <b>${totalCount}</b></a>
      ${categories
        .map(([category, list]) => {
          const active = category === activeCategory;
          const activeClass = active ? "active" : "";
          const ariaCurrent = active ? ` aria-current="page"` : "";
          return `<a class="${activeClass}" href="/categories/${slugify(category)}/"${ariaCurrent}>${escapeHtml(category)} <b>${list.length}</b></a>`;
        })
        .join("")}
    </nav>
  </div>`;
}

function pageContext({ eyebrow = "", title, meta = "", description = "" }) {
  return `<header class="page-context">
    ${eyebrow ? `<span class="page-context-kicker">${escapeHtml(eyebrow)}</span>` : ""}
    <div class="page-context-copy">
      <h1>${escapeHtml(title)}</h1>
      ${description ? `<p>${escapeHtml(description)}</p>` : ""}
    </div>
    ${meta ? `<b>${escapeHtml(meta)}</b>` : ""}
  </header>`;
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
    const series = data.series || "";
    const seriesOrder = Number.parseInt(data.seriesOrder || "0", 10) || 0;
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
      series,
      seriesSlug: series ? slugify(series) : "",
      seriesOrder,
      summary,
      featured: Boolean(data.featured),
      readingTime: readingTime(body),
      html: rendered.html,
      headings: rendered.headings,
      source: file,
      text
    };

    const generatedCover = await existingGeneratedCover(slug, ["svg"]);
    post.cover =
      data.cover && data.cover !== "/assets/hero-game-tech.png"
        ? resolvePostCover(data.cover, category)
        : generatedCover || (await generatedPostCover(post));

    posts.push(post);
  }

  return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function homePage(posts, categories, tags) {
  const featuredPosts = posts.filter((post) => post.featured);
  const latest = posts.filter((post) => !post.featured).slice(0, site.postsPerPage || 9);
  const hero = site.hero;
  const recommended = featuredPosts.slice(0, 3);

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
        ${recommended.length ? `<section class="section-block recommended-section">
          <div class="section-head">
            <div>
              <span class="section-kicker">Recommended</span>
              <h2>推荐阅读</h2>
            </div>
          </div>
          <div class="home-post-grid">
            ${recommended.map((post) => archivePostCard(post)).join("")}
          </div>
        </section>` : ""}
        ${latest.length ? `<section id="latest-posts" class="section-block">
          <div class="section-head">
            <div>
              <span class="section-kicker">Latest Posts</span>
              <h2>最新文章</h2>
            </div>
            <a href="/archive/">全部文章 →</a>
          </div>
          <div class="home-post-grid">${latest.map((post) => archivePostCard(post)).join("")}</div>
        </section>` : ""}
      </div>
      ${sidebar(posts, categories, tags)}
    </section>
  </main>`;

  return pageLayout({
    title: site.title,
    description: site.description,
    current: "/",
    body,
    canonical: "/",
    structuredData: siteSchema()
  });
}

function archivePage({ posts, categories, activeCategory = "", basePath = "/archive/", page = 1, totalCount }) {
  const perPage = archivePostsPerPage();
  const { items, currentPage, totalPages } = paginate(posts, page, perPage);
  const body = `<main class="page-shell article-index-page">
    ${pageContext({
      title: activeCategory ? `${activeCategory} 分类` : "全部文章",
      description: activeCategory
        ? `筛选 ${activeCategory} 分类下的技术笔记。`
        : "按时间、分类和主题浏览所有技术笔记。",
      meta: `${posts.length} 篇`
    })}
    ${archiveFilters(categories, activeCategory, totalCount)}
    <div class="article-index-grid">${items.map((post) => archivePostCard(post)).join("")}</div>
    ${paginationNav(basePath, currentPage, totalPages)}
  </main>`;
  return pageLayout({
    title: activeCategory ? `分类：${activeCategory}` : "全部文章",
    description: activeCategory
      ? `筛选 ${activeCategory} 分类下的技术笔记。`
      : "按时间、分类和主题浏览所有技术笔记。",
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
  const body = `<main class="page-shell tags-page">
    ${pageContext({
      title: "标签索引",
      description: "按技术主题、工具和问题类型浏览文章。",
      meta: `${entries.length} 个`
    })}
    <section class="tag-matrix-page">
      ${tagCloud(entries)}
    </section>
  </main>`;
  return pageLayout({ title: "标签", description: "按标签浏览文章。", current: "/tags/", body, canonical: "/tags/" });
}

function tagWeightClass(count, maxCount) {
  if (maxCount <= 1) return "size-2";
  const weight = Math.ceil((count / maxCount) * 3);
  return `size-${Math.min(Math.max(weight, 1), 3)}`;
}

function tagCloud(entries, activeTag = "") {
  const maxCount = Math.max(...entries.map(([, list]) => list.length), 1);
  return `<nav class="tag-matrix" aria-label="标签索引">
    ${entries
      .map(([tag, list]) => {
        const active = tag === activeTag;
        const activeClass = active ? " active" : "";
        const ariaCurrent = active ? ` aria-current="page"` : "";
        return `<a class="tag-index-item ${tagWeightClass(list.length, maxCount)}${activeClass}" href="/tags/${slugify(tag)}/"${ariaCurrent}><span>${escapeHtml(tag)}</span><b>${list.length}</b></a>`;
      })
      .join("")}
  </nav>`;
}

function tagListPage({ tag, posts, tags }) {
  const body = `<main class="page-shell tags-page">
    ${pageContext({
      title: `${tag} 标签`,
      description: `当前标签下的全部技术笔记。`,
      meta: `${posts.length} 篇`
    })}
    <section class="tag-matrix-page">
      ${tagCloud(tags, tag)}
    </section>
    <section class="tag-results">
      <header class="tag-results-head">
        <span class="section-kicker">Articles</span>
        <h2>${escapeHtml(tag)} 相关文章</h2>
      </header>
      <div class="article-index-grid">${posts.map((post) => archivePostCard(post)).join("")}</div>
    </section>
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

function sortSeriesPosts(posts) {
  return [...posts].sort(
    (a, b) =>
      (a.seriesOrder || 9999) - (b.seriesOrder || 9999) ||
      new Date(a.date) - new Date(b.date) ||
      a.title.localeCompare(b.title, "zh-CN")
  );
}

function seriesIndexPage(entries) {
  const body = `<main class="page-shell series-page">
    ${pageContext({
      title: "专题索引",
      description: "按长期主题浏览成组沉淀的技术笔记。",
      meta: `${entries.length} 个`
    })}
    <section class="series-grid">
      ${entries
        .map(([name, list]) => {
          const sorted = sortSeriesPosts(list);
          const latest = sorted[sorted.length - 1];
          return `<a class="series-card" href="/series/${slugify(name)}/">
            <span>专题</span>
            <h2>${escapeHtml(name)}</h2>
            <p>${escapeHtml(latest?.summary || `${list.length} 篇技术笔记`)}</p>
            <small>${list.length} 篇 · 最近 ${formatDate(latest?.date || latestPostDate(list))}</small>
          </a>`;
        })
        .join("")}
    </section>
  </main>`;
  return pageLayout({ title: "专题", description: "按专题浏览技术笔记。", current: "/series/", body, canonical: "/series/" });
}

function seriesPage({ name, posts, seriesEntries }) {
  const sorted = sortSeriesPosts(posts);
  const body = `<main class="page-shell series-page">
    ${pageContext({
      title: name,
      description: "围绕同一长期主题连续阅读相关技术笔记。",
      meta: `${sorted.length} 篇`
    })}
    <section class="series-timeline" aria-label="${escapeAttr(name)} 专题文章">
      ${sorted
        .map(
          (post, index) => `<article class="series-timeline-item">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <div>
              <div class="post-meta">
                <time datetime="${escapeAttr(post.date)}">${formatDate(post.date)}</time>
                <span>${escapeHtml(post.category)}</span>
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
          </article>`
        )
        .join("")}
    </section>
    ${
      seriesEntries.length > 1
        ? `<section class="series-related">
          <h2>其他专题</h2>
          <div class="tag-cloud">${seriesEntries
            .filter(([seriesName]) => seriesName !== name)
            .slice(0, 8)
            .map(([seriesName, list]) => `<a href="/series/${slugify(seriesName)}/"><span>${escapeHtml(seriesName)}</span><b>${list.length}</b></a>`)
            .join("")}</div>
        </section>`
        : ""
    }
  </main>`;
  return pageLayout({
    title: `专题：${name}`,
    description: `${name} 专题下的全部技术笔记。`,
    current: "/series/",
    body,
    canonical: `/series/${slugify(name)}/`
  });
}

function seriesPanel(post, posts) {
  if (!post.series) return "";
  const items = sortSeriesPosts(posts.filter((item) => item.series === post.series));
  if (items.length < 2) return "";

  return `<section class="series-panel" aria-labelledby="series-panel-title">
    <div class="series-panel-head">
      <span>专题</span>
      <h2 id="series-panel-title">${escapeHtml(post.series)}</h2>
      <a href="/series/${post.seriesSlug}/">查看专题</a>
    </div>
    <ol>
      ${items
        .map((item, index) => {
          const current = item.slug === post.slug;
          return `<li${current ? ` class="active"` : ""}>
            <a href="${item.url}"${current ? ` aria-current="page"` : ""}>
              <span>${String(index + 1).padStart(2, "0")}</span>
              <strong>${escapeHtml(item.title)}</strong>
            </a>
          </li>`;
        })
        .join("")}
    </ol>
  </section>`;
}

function postNavigation(post, posts) {
  const index = posts.findIndex((item) => item.slug === post.slug);
  if (index === -1) return "";

  const previous = posts[index - 1] || null;
  const next = posts[index + 1] || null;
  if (!previous && !next) return "";

  const link = (item, label) =>
    item
      ? `<a href="${item.url}">
        <span>${label}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${formatDate(item.date)} · ${escapeHtml(item.category)}</small>
      </a>`
      : `<span class="post-nav-empty" aria-hidden="true"></span>`;

  return `<nav id="post-navigation" class="post-navigation" aria-label="文章前后导航">
    ${link(previous, "上一篇")}
    ${link(next, "下一篇")}
  </nav>`;
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
  const tocHeadings = post.headings.filter((heading) => heading.level === 2 || heading.level === 3);
  const toc = tocHeadings
    .filter((heading) => heading.level === 2 || heading.level === 3)
    .map((heading) => `<a class="level-${heading.level}" href="#${heading.id}" data-toc-target="${escapeAttr(heading.id)}">${escapeHtml(heading.text)}</a>`)
    .join("");
  const showRelated = fallbackRelated.length >= 3;
  const showToc = tocHeadings.length >= 3;
  const articleShellClass = [
    "article-shell",
    showRelated ? "" : "no-related",
    showToc ? "" : "no-toc"
  ]
    .filter(Boolean)
    .join(" ");

  const body = `<main class="${articleShellClass}">
    ${showRelated ? `<aside class="article-aside article-related-aside">
      <section class="sidebar-card related-card"><h2>相关文章</h2>${fallbackRelated.map((item) => `<a class="related-link" href="${item.url}"><span>${escapeHtml(item.title)}</span><small>${formatDate(item.date)} · ${escapeHtml(item.category)}</small></a>`).join("")}</section>
    </aside>` : ""}
    <article class="article-page" data-post-slug="${escapeAttr(post.slug)}">
      <header class="article-hero" style="--article-cover: url('${escapeAttr(post.cover)}')">
        <a class="category-pill" href="/categories/${post.categorySlug}/">${escapeHtml(post.category)}</a>
        <h1>${escapeHtml(post.title)}</h1>
        <p>${escapeHtml(post.summary)}</p>
        ${postMeta(post)}
      </header>
      <div class="article-content">${post.html}</div>
      <footer class="article-footer">
        <div class="tag-row">${post.tags.map((tag) => `<a href="/tags/${slugify(tag)}/">${escapeHtml(tag)}</a>`).join("")}</div>
        ${seriesPanel(post, posts)}
        ${postNavigation(post, posts)}
      </footer>
      ${giscusComments()}
    </article>
    ${showToc ? `<aside class="article-aside article-toc-aside">
      <section class="sidebar-card toc"><h2>目录</h2>${toc}</section>
    </aside>` : ""}
  </main>
  <div class="reading-pill" data-post-slug="${escapeAttr(post.slug)}" data-reading-minutes="${Number.parseInt(post.readingTime, 10) || 1}" aria-label="阅读进度"><span id="readingPercent">0%</span><span id="readingRemaining">剩余 ≈ ${escapeHtml(post.readingTime)}</span></div>
  <script type="module" src="${assetUrl("/src/article.js")}"></script>`;

  return pageLayout({
    title: post.title,
    description: post.summary,
    body,
    canonical: post.url,
    image: post.cover,
    type: "article",
    structuredData: articleSchema(post)
  });
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
  const latestDate = posts.reduce(
    (latest, post) => (new Date(post.updated || post.date) > new Date(latest) ? post.updated || post.date : latest),
    posts[0]?.updated || posts[0]?.date || new Date().toISOString()
  );
  const items = posts
    .slice(0, 20)
    .map(
      (post) => {
        const categories = Array.from(new Set([post.category, post.series, ...post.tags].filter(Boolean)));
        return `<item>
  <title>${escapeHtml(post.title)}</title>
  <link>${absoluteUrl(post.url)}</link>
  <guid isPermaLink="true">${absoluteUrl(post.url)}</guid>
  <pubDate>${new Date(post.date).toUTCString()}</pubDate>
  ${categories.map((category) => `<category>${escapeHtml(category)}</category>`).join("\n  ")}
  <description>${escapeHtml(post.summary)}</description>
</item>`;
      }
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeHtml(site.title)}</title>
  <link>${absoluteUrl("/")}</link>
  <atom:link href="${absoluteUrl("/rss.xml")}" rel="self" type="application/rss+xml" />
  <description>${escapeHtml(site.description)}</description>
  <language>${escapeHtml(site.language || "zh-CN")}</language>
  <lastBuildDate>${new Date(latestDate).toUTCString()}</lastBuildDate>
  ${items}
</channel>
</rss>`;
}

function latestPostDate(list) {
  return (list || [])
    .map((post) => post.updated || post.date)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];
}

function sitemapEntry(loc, lastmod, priority = "0.7") {
  const lastmodXml = lastmod ? `\n    <lastmod>${escapeHtml(lastmod)}</lastmod>` : "";
  return `  <url>
    <loc>${escapeHtml(absoluteUrl(loc))}</loc>${lastmodXml}
    <priority>${priority}</priority>
  </url>`;
}

function paginatedSitemapEntries(basePath, list, priority) {
  const totalPages = Math.max(1, Math.ceil(list.length / archivePostsPerPage()));
  const lastmod = latestPostDate(list);
  return Array.from({ length: totalPages }, (_, index) => sitemapEntry(pageHref(basePath, index + 1), lastmod, priority));
}

function sitemap(posts, categories, tags, seriesEntries) {
  const latest = latestPostDate(posts);
  const archiveUrls = paginatedSitemapEntries("/archive/", posts, "0.8");
  const categoryUrls = categories.flatMap(([category, list]) =>
    paginatedSitemapEntries(`/categories/${slugify(category)}/`, list, "0.7")
  );
  const tagUrls = tags.map(([tag, list]) => sitemapEntry(`/tags/${slugify(tag)}/`, latestPostDate(list), "0.6"));
  const seriesUrls = seriesEntries.map(([seriesName, list]) =>
    sitemapEntry(`/series/${slugify(seriesName)}/`, latestPostDate(list), "0.7")
  );
  const urls = [
    sitemapEntry("/", latest, "1.0"),
    ...archiveUrls,
    sitemapEntry("/series/", latest, "0.7"),
    sitemapEntry("/tags/", latest, "0.7"),
    sitemapEntry("/search/", latest, "0.5"),
    sitemapEntry("/about/", latest, "0.5"),
    ...posts.map((post) => sitemapEntry(post.url, post.updated || post.date, "0.9")),
    ...categoryUrls,
    ...seriesUrls,
    ...tagUrls
  ];
  return `<?xml version="1.0" encoding="UTF-8" ?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
}

const posts = await loadPosts();
const categories = groupBy(posts, (post) => post.category);
const tags = groupBy(posts, (post) => post.tags);
const seriesEntries = groupBy(
  posts.filter((post) => post.series),
  (post) => post.series
);

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
await writePage("series", seriesIndexPage(seriesEntries));
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

for (const [seriesName, list] of seriesEntries) {
  await writePage(
    path.join("series", slugify(seriesName)),
    seriesPage({
      name: seriesName,
      posts: list,
      seriesEntries
    })
  );
}

await writeFile(path.join(dist, "search-index.json"), JSON.stringify(posts.map((post) => ({
  title: post.title,
  slug: post.slug,
  url: post.url,
  date: post.date,
  category: post.category,
  series: post.series,
  tags: post.tags,
  cover: post.cover,
  readingTime: post.readingTime,
  summary: post.summary,
  text: post.text
})), null, 2), "utf8");
await writeFile(path.join(dist, "rss.xml"), rss(posts), "utf8");
await writeFile(path.join(dist, "sitemap.xml"), sitemap(posts, categories, tags, seriesEntries), "utf8");
await writeFile(
  path.join(dist, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl("/sitemap.xml")}\n`,
  "utf8"
);

console.log(`Built ${posts.length} posts into dist/`);
