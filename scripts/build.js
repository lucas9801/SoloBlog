import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const dist = path.join(root, "dist");
const contentDir = path.join(root, "content");
const postsDir = path.join(contentDir, "posts");
const siteConfig = JSON.parse(await readFile(path.join(contentDir, "site.json"), "utf8"));

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

const site = {
  ...siteConfig,
  baseUrl: normalizeBaseUrl(process.env.SITE_URL || siteConfig.baseUrl)
};

async function hashDirectory(dir) {
  const hash = crypto.createHash("sha1");
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      hash.update(`dir:${entry.name}\n`);
      hash.update(await hashDirectory(target));
    } else if (entry.isFile()) {
      hash.update(`file:${entry.name}\n`);
      hash.update(await readFile(target));
      hash.update("\n");
    }
  }
  return hash.digest("hex");
}

async function resolveAssetVersion() {
  const explicit = process.env.CF_PAGES_COMMIT_SHA || siteConfig.assetVersion;
  if (explicit) return String(explicit).slice(0, 12);
  const hash = crypto.createHash("sha1");
  hash.update(await hashDirectory(path.join(root, "src")));
  hash.update(await hashDirectory(path.join(root, "assets")));
  return hash.digest("hex").slice(0, 12);
}

const assetVersion = encodeURIComponent(await resolveAssetVersion());

function assetUrl(pathname) {
  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}v=${assetVersion}`;
}

function absoluteAssetUrl(pathname) {
  return absoluteUrl(pathname.startsWith("/assets/") ? assetUrl(pathname) : pathname);
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
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, " ")
    .replace(/^\s*\|(.+)\|\s*$/gm, (_, row) =>
      row
        .replace(/\\\|/g, " ")
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(" ")
    )
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchText(markdown, maxLength = 5000) {
  return Array.from(stripMarkdown(markdown)).slice(0, maxLength).join("");
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
      <circle cx="864" cy="522" r="34" fill="${colors[1]}" opacity=".72"/>
      <circle cx="974" cy="522" r="34" fill="${colors[2]}" opacity=".58"/>`;
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

function coverTextWidth(value) {
  return Array.from(String(value || "")).reduce((width, char) => {
    if (/\s/u.test(char)) return width + 0.32;
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char)) return width + 1;
    if (/[A-Z0-9]/.test(char)) return width + 0.68;
    if (/[.,:;!?/\\()[\]{}'"`|_-]/.test(char)) return width + 0.36;
    return width + 0.56;
  }, 0);
}

function cleanCoverLine(value) {
  return String(value || "")
    .replace(/\s+([。，、；：！？,.!?;:])/gu, "$1")
    .replace(/([（([{])\s+/gu, "$1")
    .replace(/\s+([）)\]}])/gu, "$1")
    .trim();
}

function coverTextLines(value, maxWidth, maxLines) {
  const lines = [];
  let current = "";

  for (const char of Array.from(String(value || "").replace(/\s+/g, " ").trim())) {
    const candidate = `${current}${char}`;
    if (current && coverTextWidth(candidate) > maxWidth) {
      const breakAt = current.lastIndexOf(" ");
      if (breakAt > 0) {
        lines.push(cleanCoverLine(current.slice(0, breakAt)));
        current = `${current.slice(breakAt + 1)}${char}`.trimStart();
      } else {
        lines.push(cleanCoverLine(current));
        current = char.trim() ? char : "";
      }
    } else {
      current = candidate;
    }

    while (coverTextWidth(current) > maxWidth) {
      const chars = Array.from(current);
      let slice = "";
      while (chars.length && coverTextWidth(`${slice}${chars[0]}`) <= maxWidth) {
        slice += chars.shift();
      }
      lines.push(cleanCoverLine(slice));
      current = chars.join("");
    }

    if (lines.length === maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(cleanCoverLine(current));
  if (lines.length === maxLines && coverTextWidth(lines.at(-1)) > maxWidth - 1.2) {
    const chars = Array.from(lines.at(-1));
    while (chars.length && coverTextWidth(`${chars.join("")}…`) > maxWidth) chars.pop();
    lines[lines.length - 1] = `${chars.join("")}…`;
  }

  return lines.length ? lines.map(cleanCoverLine) : [""];
}

function svgTextBlock(lines, { x, y, lineHeight }) {
  return lines
    .map((line, index) => `<tspan x="${x}" y="${y + index * lineHeight}">${escapeHtml(line)}</tspan>`)
    .join("");
}

function coverVisualSeed(post) {
  return crypto
    .createHash("sha1")
    .update([post.slug, post.category, post.date].join("\n"))
    .digest("hex")
    .slice(0, 12);
}

async function generatedPostCover(post) {
  const dir = path.join(root, "assets", "posts");
  await mkdir(dir, { recursive: true });

  const target = path.join(dir, `${post.slug}.svg`);
  const url = `/assets/posts/${post.slug}.svg`;
  const colors = coverPalette(post);
  const seed = coverVisualSeed(post);
  const verticalRuleX = 180 + Number.parseInt(seed.slice(0, 2), 16) * 2.5;
  const horizontalRuleY = 108 + Number.parseInt(seed.slice(2, 4), 16) * 1.15;
  const motif = coverMotif(post, colors);
  const dateLabel = post.date.replaceAll("-", ".");
  const issueLabel = seed.slice(0, 4).toUpperCase();
  const titleLines = coverTextLines(post.title, 17.2, 2);
  const summaryLines = coverTextLines(post.summary, 38, 2);
  const summaryY = 420 + titleLines.length * 54 + 28;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img" aria-label="${escapeAttr(post.title)}">
  <defs>
    <pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse">
      <path d="M54 0H0v54" fill="none" stroke="${colors[4]}" stroke-opacity=".06"/>
    </pattern>
  </defs>
  <rect width="1200" height="675" fill="${colors[0]}"/>
  <rect width="1200" height="675" fill="url(#grid)"/>
  <path d="M64 102H1136M64 574H1136" stroke="${colors[4]}" stroke-opacity=".08"/>
  <path d="M924 96v480" stroke="${colors[4]}" stroke-opacity=".08"/>
  <path d="M64 ${horizontalRuleY}H1136" stroke="${colors[1]}" stroke-opacity=".16"/>
  <path d="M${verticalRuleX} 96v480" stroke="${colors[2]}" stroke-opacity=".13"/>
  <path d="M84 566C236 438 354 628 506 484s280-112 416-20 182 20 238-42" fill="none" stroke="${colors[1]}" stroke-opacity=".12" stroke-width="2"/>
  <g opacity=".94">${motif}</g>
  <g>
    <rect x="64" y="348" width="860" height="226" rx="8" fill="#05070d" opacity=".86" stroke="${colors[1]}" stroke-opacity=".34"/>
    <text fill="${colors[4]}" font-size="48" font-weight="800" font-family="Inter, Microsoft YaHei, Arial" letter-spacing="0">${svgTextBlock(titleLines, { x: 96, y: 420, lineHeight: 54 })}</text>
    <text fill="${colors[4]}" font-size="22" font-weight="500" opacity=".72" font-family="Inter, Microsoft YaHei, Arial" letter-spacing="0">${svgTextBlock(summaryLines, { x: 96, y: summaryY, lineHeight: 32 })}</text>
  </g>
  <g>
    <rect x="64" y="54" width="${Math.max(118, Array.from(post.category).length * 18 + 52)}" height="38" rx="6" fill="#0f172a" stroke="${colors[1]}" stroke-opacity=".52"/>
    <text x="84" y="79" fill="${colors[4]}" font-size="15" font-weight="700" font-family="Inter, Microsoft YaHei, Arial">${escapeHtml(post.category)}</text>
    <text x="1012" y="79" text-anchor="end" fill="${colors[4]}" font-size="12" font-weight="700" opacity=".56" font-family="Inter, Arial">NO. ${escapeHtml(issueLabel)}</text>
    <text x="64" y="618" fill="${colors[4]}" font-size="12" font-weight="700" opacity=".58" font-family="Inter, Arial">SOLUS DEV NOTES</text>
    <text x="1136" y="618" text-anchor="end" fill="${colors[4]}" font-size="12" font-weight="700" opacity=".58" font-family="Inter, Arial">${escapeHtml(dateLabel)}</text>
  </g>
</svg>`;

  await writeFile(target, svg, "utf8");
  return url;
}

function safeMarkdownUrl(value, { allowMailto = false } = {}) {
  const url = String(value || "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "");
  if (!url || url.startsWith("//")) return "";
  if (url.startsWith("#")) return url;

  const scheme = url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (!scheme) return url.startsWith("/") ? url : "";
  if (scheme === "http" || scheme === "https") return url;
  if (scheme === "mailto" && allowMailto) return url;
  return "";
}

function inlineToken(tokens, html) {
  const token = `@@INLINE_HTML_${tokens.length}@@`;
  tokens.push(html);
  return token;
}

function inlineMarkdown(text) {
  const tokens = [];
  let html = String(text || "");

  html = html.replace(/`([^`]+)`/g, (_, code) => inlineToken(tokens, `<code>${escapeHtml(code)}</code>`));
  html = html.replace(/!\[([^\]]*)]\(([^)]+)\)/g, (_, alt, src) => {
    const safeSrc = safeMarkdownUrl(src);
    if (!safeSrc) return alt;
    const imageSrc = safeSrc.startsWith("/assets/") ? assetUrl(safeSrc) : safeSrc;
    return inlineToken(
      tokens,
      `<img src="${escapeAttr(imageSrc)}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async" />`
    );
  });
  html = html.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_, label, href) => {
    const safeHref = safeMarkdownUrl(href, { allowMailto: true });
    if (!safeHref) return label;
    const external = /^https?:\/\//i.test(safeHref) && !safeHref.startsWith(site.baseUrl);
    const externalAttrs = external
      ? ` target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(`${label}（在新标签页打开）`)}" data-external-link`
      : "";
    return inlineToken(tokens, `<a href="${escapeAttr(safeHref)}"${externalAttrs}>${escapeHtml(label)}</a>`);
  });

  html = escapeHtml(html);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  tokens.forEach((tokenHtml, index) => {
    html = html.replace(`@@INLINE_HTML_${index}@@`, tokenHtml);
  });
  return html;
}

function splitTableRow(line) {
  const value = line.trim();
  if (!value.includes("|")) return [];

  const cells = [];
  let cell = "";
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      cell += char === "|" ? "|" : `\\${char}`;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "|") {
      cells.push(cell.trim());
      cell = "";
      continue;
    }

    cell += char;
  }

  if (escaped) cell += "\\";
  cells.push(cell.trim());
  if (value.startsWith("|")) cells.shift();
  if (value.endsWith("|") && !isEscapedAt(value, value.length - 1)) cells.pop();
  return cells;
}

function isEscapedAt(value, index) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
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
  return `<div class="table-scroll" tabindex="0" aria-label="可横向滚动的数据表"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  const headings = [];
  const headingIds = new Map();
  let paragraph = [];
  let listType = null;
  let codeBlock = null;

  function uniqueHeadingId(text) {
    const baseId = slugify(text);
    const count = headingIds.get(baseId) || 0;
    headingIds.set(baseId, count + 1);
    return count === 0 ? baseId : `${baseId}-${count + 1}`;
  }

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
    const copyLanguageAttr = block.language ? ` data-code-language="${escapeAttr(block.language)}"` : "";
    const copyLabel = block.language ? `复制 ${block.language} 代码` : "复制代码";
    const scrollLabel = block.language ? `${block.language} 代码块，可横向滚动` : "代码块，可横向滚动";
    return `<pre${languageAttr} tabindex="0" aria-label="${escapeAttr(scrollLabel)}"><button class="code-copy-button" type="button" data-copy-code${copyLanguageAttr} aria-label="${escapeAttr(copyLabel)}">复制</button><span class="sr-only" aria-live="polite" data-copy-code-status></span><code>${escapeHtml(block.lines.join("\n"))}</code></pre>`;
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
      const id = uniqueHeadingId(text);
      const anchorLabel = `章节链接：${text}`;
      headings.push({ level, text, id });
      html.push(
        `<h${level} id="${escapeAttr(id)}">${inlineMarkdown(text)} <a class="heading-anchor" href="#${escapeAttr(id)}" aria-label="${escapeAttr(anchorLabel)}">#</a></h${level}>`
      );
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

function jsonLdScripts(structuredData) {
  if (!structuredData) return "";
  const items = Array.isArray(structuredData) ? structuredData : [structuredData];
  return items.map((item) => `<script type="application/ld+json">${jsonLd(item)}</script>`).join("\n    ");
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

function pageSchema({ type = "WebPage", name, description, url, items = [] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": type,
    name,
    description,
    url: absoluteUrl(url),
    inLanguage: site.language || "zh-CN",
    isPartOf: {
      "@type": "WebSite",
      name: site.title,
      url: absoluteUrl("/")
    }
  };

  if (items.length > 0) {
    schema.mainEntity = {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        url: absoluteUrl(item.url)
      }))
    };
  }

  return schema;
}

function postListItems(posts) {
  return posts.map((post) => ({
    name: post.title,
    url: post.url
  }));
}

function taxonomyListItems(entries, basePath) {
  return entries.map(([name]) => ({
    name,
    url: `${basePath}${slugify(name)}/`
  }));
}

function breadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url)
    }))
  };
}

function socialImageForPost(post) {
  return /\.(png|jpe?g|webp)$/i.test(post.cover) ? post.cover : site.socialImage || post.cover;
}

function articleSchema(post, image = post.cover) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: post.title,
    description: post.summary,
    url: absoluteUrl(post.url),
    mainEntityOfPage: absoluteUrl(post.url),
    image: absoluteAssetUrl(image),
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

function articleStructuredData(post, image) {
  return [
    articleSchema(post, image),
    breadcrumbSchema([
      { name: site.brand || site.title, url: "/" },
      { name: "文章", url: "/archive/" },
      { name: post.category, url: `/categories/${post.categorySlug}/` },
      { name: post.title, url: post.url }
    ])
  ];
}

function coverImage(src, { className = "", alt = "", loading = "lazy", fetchPriority = "" } = {}) {
  const classAttr = className ? ` class="${escapeAttr(className)}"` : "";
  const loadingAttr = loading ? ` loading="${escapeAttr(loading)}"` : "";
  const fetchPriorityAttr = fetchPriority ? ` fetchpriority="${escapeAttr(fetchPriority)}"` : "";
  const imageSrc = src.startsWith("/assets/") ? assetUrl(src) : src;
  return `<img${classAttr} src="${escapeAttr(imageSrc)}" alt="${escapeAttr(alt)}" width="1200" height="675"${loadingAttr} decoding="async"${fetchPriorityAttr} />`;
}

function pageLayout({
  title,
  description,
  current = "",
  body,
  canonical = "/",
  image = site.socialImage || site.heroCover || "/assets/posts/start-here.svg",
  type = "website",
  structuredData = null,
  extraHead = "",
  viewsScript = "auto",
  robots = "index,follow,max-image-preview:large"
}) {
  const fullTitle = title === site.title ? title : `${title} | ${site.title}`;
  const pageDescription = description || site.description;
  const canonicalUrl = absoluteUrl(canonical);
  const socialImage = absoluteAssetUrl(image || site.socialImage || site.heroCover || "/assets/posts/start-here.svg");
  const bodyWithContentTarget = body.includes('id="content"')
    ? body
    : body.replace("<main", '<main id="content" tabindex="-1"');
  const includeViewsScript =
    site.views?.enabled !== false &&
    (viewsScript === true ||
      (viewsScript === "auto" && (body.includes("data-view-slug") || body.includes("data-ranking-posts"))));
  const nav = site.navigation
    .map((item) => {
      const active = current === item.href;
      const activeClass = active ? "active" : "";
      const ariaCurrent = active ? ` aria-current="page"` : "";
      return `<a class="${activeClass}" href="${item.href}"${ariaCurrent}>${escapeHtml(item.label)}</a>`;
    })
    .join("");
  const quickComments = body.includes('id="comments"')
    ? `<a class="quick-action quick-action-comments" href="#comments" aria-label="跳到评论"><span class="sr-only">跳到评论</span></a>`
    : "";

  return `<!doctype html>
<html lang="${escapeAttr(site.language || "zh-CN")}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeAttr(pageDescription)}" />
    <meta name="robots" content="${escapeAttr(robots)}" />
    <meta name="color-scheme" content="light dark" />
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
    <meta property="og:image:secure_url" content="${escapeAttr(socialImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeAttr(fullTitle)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(fullTitle)}" />
    <meta name="twitter:description" content="${escapeAttr(pageDescription)}" />
    <meta name="twitter:image" content="${escapeAttr(socialImage)}" />
    <meta name="twitter:image:alt" content="${escapeAttr(fullTitle)}" />
    <link rel="canonical" href="${escapeAttr(canonicalUrl)}" />
    <link rel="alternate" type="application/rss+xml" title="${escapeAttr(site.title)}" href="${escapeAttr(absoluteUrl(site.subscribe?.rss || "/rss.xml"))}" />
    <link rel="alternate" type="application/feed+json" title="${escapeAttr(site.title)}" href="${escapeAttr(absoluteUrl("/feed.json"))}" />
    <link rel="search" type="application/opensearchdescription+xml" title="${escapeAttr(site.title)}" href="/opensearch.xml" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
    <link rel="manifest" href="/site.webmanifest" />
    ${extraHead}
    ${jsonLdScripts(structuredData)}
    <script src="${assetUrl("/src/theme-init.js")}"></script>
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
          <input name="q" type="search" placeholder="搜索文章、年份、分类、专题、标签" />
        </label>
        <button type="submit" aria-label="搜索文章"><span class="sr-only">搜索文章</span></button>
      </form>
      <button class="theme-toggle" type="button" aria-label="切换深色模式" aria-pressed="false" data-theme-toggle>
        <span aria-hidden="true"></span>
      </button>
    </header>
    ${bodyWithContentTarget}
    <div class="quick-actions" aria-label="快捷操作">
      ${quickComments}
      <button class="quick-action quick-action-top" type="button" data-scroll-top aria-label="返回顶部"><span class="sr-only">返回顶部</span></button>
    </div>
    <footer class="site-footer">
      <p>© ${new Date().getFullYear()} ${escapeHtml(site.title)} · <a href="/rss.xml">RSS</a> · <a href="/sitemap.xml">站点地图</a></p>
    </footer>
    <script type="module" src="${assetUrl("/src/site.js")}"></script>
    ${includeViewsScript ? `<script type="module" src="${assetUrl("/src/views.js")}"></script>` : ""}
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
      ? `<time class="updated-date" datetime="${escapeAttr(post.updated)}">更新 ${formatDate(post.updated)}</time>`
      : "";
  return `<div class="post-meta">
    <time datetime="${escapeAttr(post.date)}">${formatDate(post.date)}</time>
    ${updated}
    <span>${escapeHtml(post.readingTime)}</span>
    ${viewCountMeta(post)}
  </div>`;
}

function isoDate(date) {
  const value = new Date(date);
  return Number.isNaN(value.getTime()) ? "" : value.toISOString();
}

function articleHeadMeta(post) {
  const updated = isoDate(post.updated || post.date);
  const published = isoDate(post.date);
  return [
    published ? `<meta property="article:published_time" content="${escapeAttr(published)}" />` : "",
    updated ? `<meta property="article:modified_time" content="${escapeAttr(updated)}" />` : "",
    `<meta property="article:section" content="${escapeAttr(post.category)}" />`,
    ...post.tags.map((tag) => `<meta property="article:tag" content="${escapeAttr(tag)}" />`)
  ]
    .filter(Boolean)
    .join("\n    ");
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

function archivePostCard(post) {
  return `<article class="archive-card">
    <a class="archive-card-thumb ${post.categorySlug}" href="${post.url}" aria-label="阅读文章：${escapeAttr(post.title)}">
      ${coverImage(post.cover, { alt: `${post.title} 封面` })}
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

function featuredPostGrid(posts) {
  if (!posts.length) return "";
  return `<div class="featured-post-grid count-${posts.length}">
    ${posts
      .map((post) =>
        archivePostCard(post).replace('<article class="archive-card">', '<article class="archive-card featured-card">')
      )
      .join("")}
  </div>`;
}

function compactPostIndex(posts, title = "最近文章") {
  const items = posts.slice(0, 6);
  if (!items.length) return "";

  return `<section class="compact-post-index" aria-labelledby="compact-post-index-title">
    <div class="compact-post-index-head">
      <h2 id="compact-post-index-title">${escapeHtml(title)}</h2>
      <a href="/archive/">全部文章</a>
    </div>
    <div class="compact-post-list">
      ${items
        .map(
          (post) => `<a class="compact-post-link" href="${post.url}">
            <span>${escapeHtml(post.title)}</span>
            <small>${formatDate(post.date)} · ${escapeHtml(post.category)}</small>
          </a>`
        )
        .join("")}
    </div>
  </section>`;
}

function siteOverviewCard(posts, categories, tags, seriesEntries = []) {
  const latest = latestPostDate(posts);
  const stats = [
    { label: "文章", value: posts.length, href: "/archive/" },
    { label: "分类", value: categories.length, href: "/archive/" },
    { label: "标签", value: tags.length, href: "/tags/" },
    ...(seriesEntries.length ? [{ label: "专题", value: seriesEntries.length, href: "/series/" }] : [])
  ];

  return `<section class="sidebar-card site-overview-card" aria-labelledby="site-overview-title">
    <h2 id="site-overview-title">站点索引</h2>
    <div class="site-overview-grid">
      ${stats
        .map(
          (item) => `<a href="${item.href}">
            <b>${item.value}</b>
            <span>${escapeHtml(item.label)}</span>
          </a>`
        )
        .join("")}
    </div>
    <p class="site-overview-update"><span>最近更新</span><time datetime="${escapeAttr(latest)}">${formatDate(latest)}</time></p>
  </section>`;
}

function yearArchiveCard(posts) {
  const years = groupByYear(posts).slice(0, 6);
  if (!years.length) return "";

  return `<section class="sidebar-card sidebar-index-card archive-years-card">
    <h2>年度归档</h2>
    <div class="category-list archive-year-list">
      ${years
        .map(([year, list]) => `<a href="/years/${slugify(year)}/"><span>${escapeHtml(year)}</span><b>${list.length}</b></a>`)
        .join("")}
    </div>
  </section>`;
}

function rankingPayload(posts) {
  return escapeAttr(
    JSON.stringify(
      posts.map((post) => ({
        slug: post.slug,
        title: post.title,
        url: post.url,
        date: post.date,
        category: post.category
      }))
    )
  );
}

function sidebar(posts, categories, tags, seriesEntries = []) {
  const fallbackRanking = posts.slice(0, 5);
  return `<aside class="blog-sidebar">
    ${siteOverviewCard(posts, categories, tags, seriesEntries)}
    <section class="sidebar-card sidebar-index-card">
      <h2>分类</h2>
      <div class="category-list">${categories
        .map(
          ([category, list]) =>
            `<a href="/categories/${slugify(category)}/"><span>${escapeHtml(category)}</span><b>${list.length}</b></a>`
        )
        .join("")}</div>
    </section>
    ${
      seriesEntries.length
        ? `<section class="sidebar-card sidebar-index-card">
          <h2>专题</h2>
          <div class="category-list series-link-list">${seriesEntries
            .slice(0, 6)
            .map(([name, list]) => `<a href="/series/${slugify(name)}/"><span>${escapeHtml(name)}</span><b>${list.length}</b></a>`)
            .join("")}</div>
        </section>`
        : ""
    }
    <section class="sidebar-card sidebar-index-card">
      <h2>标签索引</h2>
      <div class="tag-cloud">${tags
        .slice(0, 18)
        .map(([tag, list]) => `<a href="/tags/${slugify(tag)}/"><span>${escapeHtml(tag)}</span><b>${list.length}</b></a>`)
        .join("")}</div>
    </section>
    ${yearArchiveCard(posts)}
    <section class="sidebar-card subscribe-card">
      <h2>${escapeHtml(site.subscribe.title)}</h2>
      <p>${escapeHtml(site.subscribe.description)}</p>
      <div class="subscribe-actions">
        <a class="button-link" href="${site.subscribe.rss}">RSS</a>
        <a class="ghost-link" href="/feed.json">JSON Feed</a>
        <button class="secondary-button" type="button" data-copy-rss="${escapeAttr(absoluteUrl(site.subscribe.rss))}">复制 RSS</button>
        <span class="sr-only" aria-live="polite" data-copy-rss-status></span>
      </div>
    </section>
    <section class="sidebar-card ranking-card">
      <h2 data-ranking-title>阅读排行</h2>
      <div class="ranking-list" data-ranking-posts="${rankingPayload(posts)}">${fallbackRanking
        .map(
          (post, index) =>
            `<a class="ranking-link" href="${post.url}"><b>${index + 1}</b><span>${escapeHtml(post.title)}</span><small>${formatDate(post.date)} · ${escapeHtml(post.category)}</small></a>`
        )
        .join("")}</div>
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

function postYear(post) {
  return String(post.date || "").match(/^(\d{4})/)?.[1] || "未归档";
}

function groupByYear(posts) {
  const entries = groupBy(posts, postYear);
  return entries.sort((a, b) => Number.parseInt(b[0], 10) - Number.parseInt(a[0], 10) || b[0].localeCompare(a[0], "zh-CN"));
}

function archivePostsPerPage() {
  const configured = Number.parseInt(site.archivePostsPerPage || site.postsPerPage || 9, 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 9;
}

function homePostsPerPage() {
  const configured = Number.parseInt(site.homePostsPerPage || 6, 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 6;
}

function pageHref(basePath, page) {
  const cleanBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return page === 1 ? cleanBase : `${cleanBase}page/${page}/`;
}

function pageRoute(baseRoute, page) {
  return page === 1 ? baseRoute : path.join(baseRoute, "page", String(page));
}

function archiveSelectionPath({ category = "", year = "" } = {}) {
  if (category && year) return `/archive/${slugify(year)}/${slugify(category)}/`;
  if (category) return `/categories/${slugify(category)}/`;
  if (year) return `/years/${slugify(year)}/`;
  return "/archive/";
}

function archiveSelectionRoute({ category = "", year = "" } = {}) {
  if (category && year) return path.join("archive", slugify(year), slugify(category));
  if (category) return path.join("categories", slugify(category));
  if (year) return path.join("years", slugify(year));
  return "archive";
}

function filterArchivePosts(posts, { category = "", year = "" } = {}) {
  return posts.filter((post) => (!category || post.category === category) && (!year || postYear(post) === year));
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

function paginationItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  if (currentPage <= 4) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
    pages.add(5);
  }
  if (currentPage >= totalPages - 3) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
    pages.add(totalPages - 4);
  }

  const sorted = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  return sorted.flatMap((page, index) => {
    const previous = sorted[index - 1];
    return previous && page - previous > 1 ? ["gap", page] : [page];
  });
}

function archiveFilterRow(label, ariaLabel, links) {
  return `<div class="archive-filter-row">
    <span>${escapeHtml(label)}</span>
    <nav class="archive-filters" aria-label="${escapeAttr(ariaLabel)}">${links.join("")}</nav>
  </div>`;
}

function archiveFilters(
  categories,
  years,
  { activeCategory = "", activeYear = "", totalCount, categoryTotalCount = totalCount, yearTotalCount = totalCount }
) {
  const yearLinks = [
    `<a class="${!activeYear ? "active" : ""}" href="${archiveSelectionPath({ category: activeCategory })}"${!activeYear ? ` aria-current="page"` : ""}>全部年份 <b>${yearTotalCount}</b></a>`,
    ...years.map(([year, list]) => {
      const active = year === activeYear;
      const activeClass = active ? "active" : "";
      const ariaCurrent = active ? ` aria-current="page"` : "";
      return `<a class="${activeClass}" href="${archiveSelectionPath({ category: activeCategory, year })}"${ariaCurrent}>${escapeHtml(year)} <b>${list.length}</b></a>`;
    })
  ];
  const categoryLinks = [
    `<a class="${!activeCategory ? "active" : ""}" href="${archiveSelectionPath({ year: activeYear })}"${!activeCategory ? ` aria-current="page"` : ""}>全部分类 <b>${categoryTotalCount}</b></a>`,
    ...categories.map(([category, list]) => {
      const active = category === activeCategory;
      const activeClass = active ? "active" : "";
      const ariaCurrent = active ? ` aria-current="page"` : "";
      return `<a class="${activeClass}" href="${archiveSelectionPath({ category, year: activeYear })}"${ariaCurrent}>${escapeHtml(category)} <b>${list.length}</b></a>`;
    })
  ];

  return `<div class="archive-filter-stack">
    <div class="archive-filter-links" aria-label="文章筛选">
      <div class="archive-filter-link-panel">
        ${archiveFilterRow("年份", "文章年份筛选", yearLinks)}
        ${archiveFilterRow("分类", "文章分类筛选", categoryLinks)}
      </div>
    </div>
  </div>`;
}

function archiveStatus({ title, count, currentPage, totalPages }) {
  const pageText = totalPages > 1 ? `第 ${currentPage}/${totalPages} 页` : "单页";
  return `<div class="archive-status" aria-live="polite">
    <strong>${escapeHtml(title)}</strong>
    <span>${count} 篇</span>
    <span>${pageText}</span>
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
    paginationItems(currentPage, totalPages),
    (page) => {
      if (page === "gap") return `<span class="pagination-ellipsis" aria-hidden="true">...</span>`;
      return page === currentPage
        ? `<span class="active" aria-current="page" aria-label="第 ${page} 页，当前页">${page}</span>`
        : `<a href="${pageHref(basePath, page)}" aria-label="第 ${page} 页">${page}</a>`;
    }
  ).join("");

  return `<nav class="pagination" aria-label="文章分页">${previous}${pages}${next}</nav>`;
}

function paginationHead(basePath, currentPage, totalPages) {
  if (totalPages <= 1) return "";
  return [
    currentPage > 1 ? `<link rel="prev" href="${escapeAttr(absoluteUrl(pageHref(basePath, currentPage - 1)))}" />` : "",
    currentPage < totalPages ? `<link rel="next" href="${escapeAttr(absoluteUrl(pageHref(basePath, currentPage + 1)))}" />` : ""
  ]
    .filter(Boolean)
    .join("\n    ");
}

function dateValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function comparePostsNewestFirst(a, b) {
  return (
    dateValue(b.date) - dateValue(a.date) ||
    dateValue(b.updated) - dateValue(a.updated) ||
    a.title.localeCompare(b.title, "zh-CN") ||
    a.slug.localeCompare(b.slug, "zh-CN")
  );
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
    const text = searchText(body);

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

    post.cover = data.cover || (await generatedPostCover(post));

    posts.push(post);
  }

  return posts.sort(comparePostsNewestFirst);
}

function homePage(posts, categories, tags, seriesEntries = []) {
  const featuredPosts = posts.filter((post) => post.featured);
  const hero = site.hero;
  const recommended = featuredPosts.slice(0, 3);
  const recommendedSlugs = new Set(recommended.map((post) => post.slug));
  const latest = posts.filter((post) => !recommendedSlugs.has(post.slug)).slice(0, homePostsPerPage());
  const primaryActionHref = latest.length ? "#latest-posts" : "/archive/";

  const body = `<main>
    <section class="hero-section">
      <div class="hero-inner">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(hero.eyebrow)}</p>
          <h1>${escapeHtml(hero.title)}</h1>
          <p>${escapeHtml(hero.subtitle)}</p>
          <div class="hero-actions">
            <a class="button-link" href="${primaryActionHref}">${escapeHtml(hero.primaryAction)}</a>
            <a class="ghost-link" href="/archive/">${escapeHtml(hero.secondaryAction)}</a>
          </div>
        </div>
        <figure class="hero-visual" aria-hidden="true">
          ${coverImage(site.heroCover || "/assets/posts/start-here.svg", { className: "hero-cover", loading: "", fetchPriority: "high" })}
        </figure>
      </div>
    </section>
    <section class="content-shell">
      <div class="content-main">
        ${recommended.length ? `<section class="section-block recommended-section">
          <div class="section-head">
            <div>
              <h2>推荐阅读</h2>
            </div>
          </div>
          ${featuredPostGrid(recommended)}
        </section>` : ""}
        ${latest.length ? `<section id="latest-posts" class="section-block">
          <div class="section-head">
            <div>
              <h2>最新文章</h2>
            </div>
            <a href="/archive/">全部文章 →</a>
          </div>
          <div class="home-post-grid">${latest.map((post) => archivePostCard(post)).join("")}</div>
        </section>` : ""}
      </div>
      ${sidebar(posts, categories, tags, seriesEntries)}
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

function archivePage({
  posts,
  allPosts = posts,
  categories,
  years,
  activeCategory = "",
  activeYear = "",
  basePath = "/archive/",
  page = 1,
  totalCount
}) {
  const perPage = archivePostsPerPage();
  const { items, currentPage, totalPages } = paginate(posts, page, perPage);
  const title =
    activeCategory && activeYear
      ? `${activeYear} 年 ${activeCategory}`
      : activeCategory
        ? `${activeCategory} 分类`
        : activeYear
          ? `${activeYear} 年文章`
          : "全部文章";
  const description =
    activeCategory && activeYear
      ? `筛选 ${activeYear} 年 ${activeCategory} 分类下的技术笔记。`
      : activeCategory
        ? `筛选 ${activeCategory} 分类下的技术笔记。`
        : activeYear
          ? `浏览 ${activeYear} 年发布的技术笔记。`
          : "按时间、分类和主题浏览所有技术笔记。";
  const categoryScopePosts = activeYear ? filterArchivePosts(allPosts, { year: activeYear }) : allPosts;
  const yearScopePosts = activeCategory ? filterArchivePosts(allPosts, { category: activeCategory }) : allPosts;
  const categoryEntries = activeYear ? groupBy(categoryScopePosts, (post) => post.category) : categories;
  const yearEntries = activeCategory ? groupByYear(yearScopePosts) : years;
  const body = `<main class="page-shell article-index-page">
    <h1 class="sr-only">${escapeHtml(title)}</h1>
    ${archiveFilters(categoryEntries, yearEntries, {
      activeCategory,
      activeYear,
      totalCount,
      categoryTotalCount: categoryScopePosts.length,
      yearTotalCount: yearScopePosts.length
    })}
    ${archiveStatus({ title, count: posts.length, currentPage, totalPages })}
      ${postIndexList(items, currentPage, perPage, "wide")}
    ${paginationNav(basePath, currentPage, totalPages)}
  </main>`;
  return pageLayout({
    title: activeCategory && activeYear ? `${activeYear} 年 ${activeCategory}` : activeCategory ? `分类：${activeCategory}` : activeYear ? `${activeYear} 年文章` : "全部文章",
    description,
    current: "/archive/",
    body,
    canonical: pageHref(basePath, currentPage),
    extraHead: paginationHead(basePath, currentPage, totalPages),
    structuredData: pageSchema({
      type: "CollectionPage",
      name: title,
      description,
      url: pageHref(basePath, currentPage),
      items: postListItems(items)
    })
  });
}

async function writeArchivePages({
  posts,
  allPosts = posts,
  categories,
  years,
  baseRoute,
  basePath,
  activeCategory = "",
  activeYear = "",
  totalCount
}) {
  const totalPages = Math.max(1, Math.ceil(posts.length / archivePostsPerPage()));
  for (let page = 1; page <= totalPages; page += 1) {
    await writePage(
      pageRoute(baseRoute, page),
      archivePage({
        posts,
        allPosts,
        categories,
        years,
        activeCategory,
        activeYear,
        basePath,
        page,
        totalCount
      })
    );
  }
}

function tagIndexPage(entries, posts) {
  const body = `<main class="page-shell tags-page">
    <h1 class="sr-only">标签索引</h1>
    <section class="tag-matrix-page">
      ${tagCloud(entries)}
    </section>
  </main>`;
  return pageLayout({
    title: "标签",
    description: "按标签浏览文章。",
    current: "/tags/",
    body,
    canonical: "/tags/",
    structuredData: pageSchema({
      type: "CollectionPage",
      name: "标签索引",
      description: "按标签浏览文章。",
      url: "/tags/",
      items: taxonomyListItems(entries, "/tags/")
    })
  });
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

function postIndexList(posts, currentPage, perPage, className = "") {
  const extraClass = className ? ` ${className}` : "";
  return `<div class="post-index-list${extraClass}">
    ${posts
      .map(
        (post, index) => `<article class="post-index-item">
          <span>${String((currentPage - 1) * perPage + index + 1).padStart(2, "0")}</span>
          <div>
            <div class="post-meta">
              <time datetime="${escapeAttr(post.date)}">${formatDate(post.date)}</time>
              <span>${escapeHtml(post.category)}</span>
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
        </article>`
      )
      .join("")}
  </div>`;
}

function tagListPage({ tag, posts, tags, page = 1, basePath }) {
  const perPage = archivePostsPerPage();
  const { items, currentPage, totalPages } = paginate(posts, page, perPage);
  const title = `标签：${tag}`;
  const description = `带有 ${tag} 标签的全部文章。`;
  const body = `<main class="page-shell tags-page">
    <h1 class="sr-only">${escapeHtml(`${tag} 标签`)}</h1>
    <section class="tag-matrix-page">
      ${tagCloud(tags, tag)}
    </section>
    <section class="tag-results">
      <h2 class="sr-only">${escapeHtml(`${tag} 相关文章`)}</h2>
      ${archiveStatus({ title, count: posts.length, currentPage, totalPages })}
      ${postIndexList(items, currentPage, perPage)}
      ${paginationNav(basePath, currentPage, totalPages)}
    </section>
  </main>`;
  return pageLayout({
    title,
    description,
    current: "/tags/",
    body,
    canonical: pageHref(basePath, currentPage),
    extraHead: paginationHead(basePath, currentPage, totalPages),
    structuredData: pageSchema({
      type: "CollectionPage",
      name: title,
      description,
      url: pageHref(basePath, currentPage),
      items: postListItems(items)
    })
  });
}

async function writeTagPages({ tag, posts, tags }) {
  const tagSlug = slugify(tag);
  const baseRoute = path.join("tags", tagSlug);
  const basePath = `/tags/${tagSlug}/`;
  const totalPages = Math.max(1, Math.ceil(posts.length / archivePostsPerPage()));

  for (let page = 1; page <= totalPages; page += 1) {
    await writePage(
      pageRoute(baseRoute, page),
      tagListPage({
        tag,
        posts,
        tags,
        basePath,
        page
      })
    );
  }
}

function sortSeriesPosts(posts) {
  return [...posts].sort(
    (a, b) =>
      (a.seriesOrder || 9999) - (b.seriesOrder || 9999) ||
      new Date(a.date) - new Date(b.date) ||
      a.title.localeCompare(b.title, "zh-CN")
  );
}

function seriesIndexPage(entries, posts) {
  const showQuickIndex = entries.length > 1;
  const body = `<main class="page-shell series-page">
    <h1 class="sr-only">专题索引</h1>
    <div class="series-index-layout${showQuickIndex ? "" : " single-series"}">
      <section class="series-grid" aria-label="专题列表">
        ${entries
          .map(([name, list], entryIndex) => {
            const sorted = sortSeriesPosts(list);
            const latest = [...list].sort(comparePostsNewestFirst)[0];
            return `<article class="series-card" id="series-${slugify(name)}">
              <a class="series-card-head" href="/series/${slugify(name)}/">
                <b>${String(entryIndex + 1).padStart(2, "0")}</b>
                <strong class="series-card-title">${escapeHtml(name)}</strong>
                <span class="series-card-meta">
                  <span>${list.length} 篇</span>
                  <span>更新 ${formatDate(latest?.date || latestPostDate(list))}</span>
                </span>
              </a>
              <p>${escapeHtml(latest?.summary || `${list.length} 篇技术笔记`)}</p>
              <ol class="series-card-list">
                ${sorted
                  .slice(0, 4)
                  .map(
                    (post, index) => `<li>
                      <a href="${post.url}">
                        <b>${String(index + 1).padStart(2, "0")}</b>
                        <span>${escapeHtml(post.title)}</span>
                      </a>
                    </li>`
                  )
                  .join("")}
              </ol>
            </article>`;
          })
          .join("")}
      </section>
      ${
        showQuickIndex
          ? `<aside class="series-index-sidebar" aria-label="专题快速索引">
        <nav class="series-index-nav">
          ${entries
            .map(([name, list], index) => {
              const latest = [...list].sort(comparePostsNewestFirst)[0];
              return `<a href="#series-${slugify(name)}">
                <b>${String(index + 1).padStart(2, "0")}</b>
                <span>${escapeHtml(name)}</span>
                <small>${list.length} 篇 · ${formatDate(latest?.date || latestPostDate(list))}</small>
              </a>`;
            })
            .join("")}
        </nav>
      </aside>`
          : ""
      }
    </div>
  </main>`;
  return pageLayout({
    title: "专题",
    description: "按专题浏览技术笔记。",
    current: "/series/",
    body,
    canonical: "/series/",
    structuredData: pageSchema({
      type: "CollectionPage",
      name: "专题索引",
      description: "按专题浏览技术笔记。",
      url: "/series/",
      items: taxonomyListItems(entries, "/series/")
    })
  });
}

function seriesPage({ name, posts, seriesEntries, page = 1, basePath }) {
  const sorted = sortSeriesPosts(posts);
  const seriesBasePath = basePath || `/series/${slugify(name)}/`;
  const perPage = archivePostsPerPage();
  const { items, currentPage, totalPages } = paginate(sorted, page, perPage);
  const relatedSeries = seriesEntries.filter(([seriesName]) => seriesName !== name).slice(0, 8);
  const body = `<main class="page-shell series-page">
    <h1 class="sr-only">${escapeHtml(name)}</h1>
    <div class="series-detail-layout${relatedSeries.length ? "" : " no-related"}">
      <div class="series-detail-main">
        ${archiveStatus({ title: `专题：${name}`, count: sorted.length, currentPage, totalPages })}
        <section class="series-timeline" aria-label="${escapeAttr(name)} 专题文章">
          ${items
            .map(
              (post, index) => `<article class="series-timeline-item">
                <span>${String((currentPage - 1) * perPage + index + 1).padStart(2, "0")}</span>
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
        ${paginationNav(seriesBasePath, currentPage, totalPages)}
      </div>
      ${
        relatedSeries.length
          ? `<aside class="series-related" aria-label="其他专题">
            <h2>其他专题</h2>
            <div class="tag-cloud">${relatedSeries
              .map(([seriesName, list]) => `<a href="/series/${slugify(seriesName)}/"><span>${escapeHtml(seriesName)}</span><b>${list.length}</b></a>`)
              .join("")}</div>
          </aside>`
          : ""
      }
    </div>
  </main>`;
  return pageLayout({
    title: `专题：${name}`,
    description: `${name} 专题下的全部技术笔记。`,
    current: "/series/",
    body,
    canonical: pageHref(seriesBasePath, currentPage),
    extraHead: paginationHead(seriesBasePath, currentPage, totalPages),
    structuredData: pageSchema({
      type: "CollectionPage",
      name: `专题：${name}`,
      description: `${name} 专题下的全部技术笔记。`,
      url: pageHref(seriesBasePath, currentPage),
      items: postListItems(items)
    })
  });
}

async function writeSeriesPages({ name, posts, seriesEntries }) {
  const seriesSlug = slugify(name);
  const baseRoute = path.join("series", seriesSlug);
  const basePath = `/series/${seriesSlug}/`;
  const totalPages = Math.max(1, Math.ceil(posts.length / archivePostsPerPage()));

  for (let page = 1; page <= totalPages; page += 1) {
    await writePage(
      pageRoute(baseRoute, page),
      seriesPage({
        name,
        posts,
        seriesEntries,
        basePath,
        page
      })
    );
  }
}

function seriesPanel(post, posts, { compact = false } = {}) {
  if (!post.series) return "";
  const items = sortSeriesPosts(posts.filter((item) => item.series === post.series));
  if (items.length < 2) return "";
  const titleId = compact ? "series-sidebar-title" : "series-panel-title";
  const compactClass = compact ? " compact" : "";

  return `<section class="series-panel${compactClass}" aria-labelledby="${titleId}">
    <div class="series-panel-head">
      <span>专题</span>
      <h2 id="${titleId}">${escapeHtml(post.series)}</h2>
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
  const navigationPosts = post.series
    ? sortSeriesPosts(posts.filter((item) => item.series === post.series))
    : posts;
  const index = navigationPosts.findIndex((item) => item.slug === post.slug);
  if (index === -1) return "";

  const previous = navigationPosts[index - 1] || null;
  const next = navigationPosts[index + 1] || null;
  if (!previous && !next) return "";
  const context = post.series ? `${post.series} 专题` : "时间线";

  const link = (item, label) =>
    item
      ? `<a href="${item.url}">
        <span>${label}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${formatDate(item.date)} · ${escapeHtml(item.category)}</small>
      </a>`
      : `<span class="post-nav-empty" aria-hidden="true"></span>`;

  return `<nav id="post-navigation" class="post-navigation" aria-label="${escapeAttr(context)}文章前后导航">
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
  const seriesSidebar = seriesPanel(post, posts, { compact: true });
  const showLeftAside = Boolean(seriesSidebar || showRelated);
  const showToc = tocHeadings.length >= 3;
  const articleShellClass = [
    "article-shell",
    showLeftAside ? "" : "no-related",
    showToc ? "" : "no-toc"
  ]
    .filter(Boolean)
    .join(" ");

  const body = `<main class="${articleShellClass}">
    ${showLeftAside ? `<aside class="article-aside article-related-aside">
      ${seriesSidebar}
      ${showRelated ? `<section class="sidebar-card related-card"><h2>相关文章</h2>${fallbackRelated.map((item) => `<a class="related-link" href="${item.url}"><span>${escapeHtml(item.title)}</span><small>${formatDate(item.date)} · ${escapeHtml(item.category)}</small></a>`).join("")}</section>` : ""}
    </aside>` : ""}
    <article class="article-page" data-post-slug="${escapeAttr(post.slug)}">
      <header class="article-hero">
        <a class="category-pill" href="/categories/${post.categorySlug}/">${escapeHtml(post.category)}</a>
        <h1>${escapeHtml(post.title)}</h1>
        <p>${escapeHtml(post.summary)}</p>
        ${postMeta(post)}
      </header>
      <div class="article-content">${post.html}</div>
      <footer class="article-footer">
        <div class="article-footer-tools">
          <div class="tag-row">${post.tags.map((tag) => `<a href="/tags/${slugify(tag)}/">${escapeHtml(tag)}</a>`).join("")}</div>
          <button class="secondary-button article-copy-link" type="button" data-copy-article-url="${escapeAttr(absoluteUrl(post.url))}" aria-label="复制本文链接">复制链接</button>
          <span class="sr-only" aria-live="polite" data-copy-article-status></span>
        </div>
        ${postNavigation(post, posts)}
      </footer>
      ${giscusComments()}
    </article>
    ${showToc ? `<aside class="article-aside article-toc-aside">
      <nav class="sidebar-card toc" aria-labelledby="article-toc-title"><h2 id="article-toc-title">目录</h2>${toc}</nav>
    </aside>` : ""}
  </main>
  <div class="reading-pill" data-post-slug="${escapeAttr(post.slug)}" data-reading-minutes="${Number.parseInt(post.readingTime, 10) || 1}" aria-label="阅读进度"><span id="readingPercent">0%</span><span id="readingRemaining">剩余 ≈ ${escapeHtml(post.readingTime)}</span></div>
  <script type="module" src="${assetUrl("/src/article.js")}"></script>`;

  const socialImage = socialImageForPost(post);

  return pageLayout({
    title: post.title,
    description: post.summary,
    current: "/archive/",
    body,
    canonical: post.url,
    image: socialImage,
    type: "article",
    structuredData: articleStructuredData(post, socialImage),
    extraHead: articleHeadMeta(post),
    viewsScript: false
  });
}

async function aboutPage() {
  const raw = await readFile(path.join(contentDir, "about.md"), "utf8");
  const { data, body } = parseFrontMatter(raw);
  const rendered = markdownToHtml(body);
  const title = data.title || "关于";
  const description = data.summary || site.description;
  const pageBody = `<main class="page-shell narrow about-page">
    <article class="about-profile">
      <header class="about-profile-head">
        <span>SOLUS</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(data.summary || "")}</p>
      </header>
      <div class="article-content about-content">${rendered.html}</div>
    </article>
  </main>`;
  return pageLayout({
    title,
    description,
    current: "/about/",
    body: pageBody,
    canonical: "/about/",
    structuredData: pageSchema({
      type: "AboutPage",
      name: title,
      description,
      url: "/about/"
    })
  });
}

function searchPage() {
  const title = "搜索文章";
  const description = "搜索博客文章。";
  const body = `<main class="page-shell search-page">
    <h1 class="sr-only">搜索文章</h1>
    <section class="search-page-card">
      <div class="search-controls">
        <label class="search-query-control">
          <span class="sr-only">搜索关键词</span>
          <input id="searchInputPage" type="search" placeholder="搜索文章、年份、分类、专题、标签" aria-describedby="searchStatus" aria-controls="searchResults searchFacets" />
        </label>
        <button class="secondary-button search-clear" type="button" data-search-clear aria-controls="searchInputPage searchStatus searchResults searchFacets" hidden>清空</button>
      </div>
      <div id="searchActiveFilters" class="search-active-filters" aria-label="当前筛选" hidden></div>
      <div class="search-layout">
        <aside class="search-filter-panel" aria-label="筛选条件">
          <div id="searchFacets" class="search-facets" aria-label="搜索筛选"></div>
        </aside>
        <section class="search-result-panel" aria-label="搜索结果">
          <noscript class="search-noscript">
            <p>搜索功能需要启用 JavaScript。可以先从全部文章继续浏览。</p>
            <a class="ghost-link" href="/archive/">全部文章</a>
          </noscript>
          <div id="searchStatus" class="search-status" role="status" aria-live="polite"></div>
          <div id="searchResults" class="search-results" role="list"></div>
          <nav id="searchPagination" class="pagination search-pagination" aria-label="搜索结果分页" hidden></nav>
        </section>
      </div>
    </section>
  </main>
  <script type="module" src="${assetUrl("/src/search.js")}"></script>`;
  return pageLayout({
    title,
    description,
    current: "/search/",
    body,
    canonical: "/search/",
    structuredData: pageSchema({
      type: "SearchResultsPage",
      name: title,
      description,
      url: "/search/"
    })
  });
}

function notFoundPage(posts) {
  const body = `<main class="page-shell narrow">
    <header class="not-found-panel">
      <span>404</span>
      <h1>页面未找到</h1>
      <p>这个地址没有对应的技术笔记。可以回到首页，或从全部文章继续查找内容。</p>
      <div class="hero-actions">
        <a class="button-link" href="/">返回首页</a>
        <a class="ghost-link" href="/archive/">全部文章</a>
        <a class="ghost-link" href="/search/">搜索文章</a>
      </div>
    </header>
    ${compactPostIndex(posts, "最近文章")}
  </main>`;
  return pageLayout({
    title: "页面未找到",
    description: "这个地址没有对应的技术笔记。",
    body,
    canonical: "/404.html",
    robots: "noindex,follow",
    viewsScript: false
  });
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
  <content:encoded>${cdata(absolutizeFeedHtml(post.html, post.url))}</content:encoded>
</item>`;
      }
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
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

function openSearch() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${escapeHtml(site.brand || site.title)}</ShortName>
  <Description>${escapeHtml(`搜索 ${site.title} 的技术笔记`)}</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image height="64" width="64" type="image/svg+xml">${escapeHtml(absoluteUrl("/favicon.svg"))}</Image>
  <Url type="text/html" method="get" template="${escapeHtml(`${absoluteUrl("/search/")}?q={searchTerms}`)}" />
</OpenSearchDescription>`;
}

function jsonFeed(posts) {
  const items = posts.slice(0, 20).map((post) => {
    const tags = Array.from(new Set([post.category, post.series, ...post.tags].filter(Boolean)));
    return {
      id: absoluteUrl(post.url),
      url: absoluteUrl(post.url),
      title: post.title,
      content_html: absolutizeFeedHtml(post.html, post.url),
      summary: post.summary,
      date_published: new Date(post.date).toISOString(),
      date_modified: new Date(post.updated || post.date).toISOString(),
      authors: [{ name: site.brand || site.title }],
      tags,
      image: absoluteAssetUrl(post.cover)
    };
  });

  return JSON.stringify(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: site.title,
      home_page_url: absoluteUrl("/"),
      feed_url: absoluteUrl("/feed.json"),
      description: site.description,
      language: site.language || "zh-CN",
      favicon: absoluteUrl("/favicon.svg"),
      icon: absoluteAssetUrl(site.socialImage || "/favicon.svg"),
      authors: [{ name: site.brand || site.title }],
      items
    },
    null,
    2
  );
}

function latestPostDate(list) {
  return (list || [])
    .map((post) => post.updated || post.date)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];
}

function cdata(value = "") {
  return `<![CDATA[${String(value).replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function absolutizeFeedHtml(html, basePath = "/") {
  return String(html || "").replace(/\s(href|src)="([^"]*)"/g, (match, attr, value) => {
    if (value.startsWith("/")) {
      return ` ${attr}="${escapeAttr(absoluteUrl(value))}"`;
    }
    if (attr === "href" && value.startsWith("#")) {
      return ` ${attr}="${escapeAttr(absoluteUrl(`${basePath}${value}`))}"`;
    }
    return match;
  });
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

function sitemap(posts, categories, years, tags, seriesEntries) {
  const latest = latestPostDate(posts);
  const archiveUrls = paginatedSitemapEntries("/archive/", posts, "0.8");
  const categoryUrls = categories.flatMap(([category, list]) =>
    paginatedSitemapEntries(`/categories/${slugify(category)}/`, list, "0.7")
  );
  const yearUrls = years.flatMap(([year, list]) => paginatedSitemapEntries(`/years/${slugify(year)}/`, list, "0.7"));
  const archiveCombinationUrls = categories.flatMap(([category, list]) =>
    groupByYear(list).flatMap(([year, yearList]) =>
      paginatedSitemapEntries(archiveSelectionPath({ category, year }), yearList, "0.7")
    )
  );
  const tagUrls = tags.flatMap(([tag, list]) => paginatedSitemapEntries(`/tags/${slugify(tag)}/`, list, "0.6"));
  const seriesUrls = seriesEntries.flatMap(([seriesName, list]) =>
    paginatedSitemapEntries(`/series/${slugify(seriesName)}/`, list, "0.7")
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
    ...yearUrls,
    ...archiveCombinationUrls,
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
const years = groupByYear(posts);
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

await writePage(".", homePage(posts, categories, tags, seriesEntries));
await writeArchivePages({
  posts,
  allPosts: posts,
  categories,
  years,
  baseRoute: "archive",
  basePath: "/archive/",
  totalCount: posts.length
});
await writePage("tags", tagIndexPage(tags, posts));
await writePage("series", seriesIndexPage(seriesEntries, posts));
await writePage("search", searchPage());
await writePage("about", await aboutPage());
await writeFile(path.join(dist, "404.html"), notFoundPage(posts), "utf8");

for (const post of posts) {
  await writePage(path.join("posts", post.slug), postPage(post, posts));
}

for (const [category, list] of categories) {
  const categorySlug = slugify(category);
  await writeArchivePages({
    posts: list,
    allPosts: posts,
    categories,
    years,
    activeCategory: category,
    baseRoute: path.join("categories", categorySlug),
    basePath: `/categories/${categorySlug}/`,
    totalCount: posts.length
  });
}

for (const [year, list] of years) {
  const yearSlug = slugify(year);
  await writeArchivePages({
    posts: list,
    allPosts: posts,
    categories,
    years,
    activeYear: year,
    baseRoute: path.join("years", yearSlug),
    basePath: `/years/${yearSlug}/`,
    totalCount: posts.length
  });
}

for (const [category, categoryPosts] of categories) {
  for (const [year, list] of groupByYear(categoryPosts)) {
    await writeArchivePages({
      posts: list,
      allPosts: posts,
      categories,
      years,
      activeCategory: category,
      activeYear: year,
      baseRoute: archiveSelectionRoute({ category, year }),
      basePath: archiveSelectionPath({ category, year }),
      totalCount: posts.length
    });
  }
}

for (const [tag, list] of tags) {
  await writeTagPages({ tag, posts: list, tags });
}

for (const [seriesName, list] of seriesEntries) {
  await writeSeriesPages({
    name: seriesName,
    posts: list,
    seriesEntries
  });
}

await writeFile(path.join(dist, "search-index.json"), JSON.stringify(posts.map((post) => ({
  title: post.title,
  slug: post.slug,
  url: post.url,
  date: post.date,
  year: postYear(post),
  category: post.category,
  series: post.series,
  tags: post.tags,
  cover: post.cover,
  readingTime: post.readingTime,
  summary: post.summary,
  text: post.text
})), null, 2), "utf8");
await writeFile(path.join(dist, "rss.xml"), rss(posts), "utf8");
await writeFile(path.join(dist, "feed.json"), jsonFeed(posts), "utf8");
await writeFile(path.join(dist, "opensearch.xml"), openSearch(), "utf8");
await writeFile(path.join(dist, "sitemap.xml"), sitemap(posts, categories, years, tags, seriesEntries), "utf8");
await writeFile(
  path.join(dist, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl("/sitemap.xml")}\n`,
  "utf8"
);

console.log(`Built ${posts.length} posts into dist/`);
