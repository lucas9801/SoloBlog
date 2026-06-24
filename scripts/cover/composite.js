import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const width = 1200;
const height = 675;

export async function compositeCover({ sourcePath, outputPath, article, promptInfo, config }) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const overlay = Buffer.from(coverOverlaySvg(article, promptInfo, config));
  const tempPath = `${outputPath}.tmp`;

  await sharp(sourcePath)
    .resize(width, height, { fit: "cover", position: "attention" })
    .composite([{ input: overlay, left: 0, top: 0 }])
    .webp({ quality: 82 })
    .toFile(tempPath);

  await rename(tempPath, outputPath);
}

function coverOverlaySvg(article, promptInfo, config) {
  const titleLines = titleWrap(article.title, 18, 2);
  const titleY = titleLines.length === 1 ? 502 : 466;
  const meta = [article.category, promptInfo.channelLabel, formatDate(article.date)].filter(Boolean).join(" · ");
  const categoryWidth = Math.max(112, textWidth(article.category) * 15 + 46);
  const titleSize = titleLines.length === 1 ? 48 : 43;
  const titleBlock = titleLines
    .map((line, index) => `<tspan x="86" y="${titleY + index * 52}">${escapeXml(line)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(5,7,13,0)"/>
      <stop offset=".42" stop-color="rgba(5,7,13,.72)"/>
      <stop offset="1" stop-color="rgba(5,7,13,.94)"/>
    </linearGradient>
    <linearGradient id="leftShade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="rgba(5,7,13,.88)"/>
      <stop offset=".62" stop-color="rgba(5,7,13,.42)"/>
      <stop offset="1" stop-color="rgba(5,7,13,0)"/>
    </linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${config.palette.brand}"/>
      <stop offset="1" stop-color="${config.palette.accent}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="rgba(9,13,18,.18)"/>
  <rect x="0" y="300" width="1200" height="375" fill="url(#bottomShade)"/>
  <rect x="0" y="0" width="760" height="675" fill="url(#leftShade)"/>
  <rect x="86" y="392" width="${categoryWidth}" height="34" rx="4" fill="rgba(34,211,238,.10)" stroke="${config.palette.brand}" stroke-opacity=".76"/>
  <text x="${86 + categoryWidth / 2}" y="414" text-anchor="middle" font-family="Inter, Microsoft YaHei, PingFang SC, sans-serif" font-size="16" font-weight="700" fill="${config.palette.brand}">${escapeXml(article.category)}</text>
  <text font-family="Inter, Microsoft YaHei, PingFang SC, sans-serif" font-size="${titleSize}" font-weight="800" fill="${config.palette.text}" letter-spacing="0">${titleBlock}</text>
  <text x="86" y="603" font-family="Inter, Microsoft YaHei, PingFang SC, sans-serif" font-size="20" font-weight="600" fill="${config.palette.muted}">${escapeXml(meta)}</text>
  <rect x="86" y="626" width="156" height="5" rx="2.5" fill="url(#rule)"/>
</svg>`;
}

function titleWrap(value, maxWidth, maxLines) {
  const lines = [];
  let current = "";
  for (const char of Array.from(String(value || "").trim())) {
    const candidate = `${current}${char}`;
    if (current && textWidth(candidate) > maxWidth) {
      lines.push(current.trim());
      current = char.trimStart();
    } else {
      current = candidate;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current.trim());
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines && textWidth(lines.at(-1)) > maxWidth - 1) {
    const chars = Array.from(lines.at(-1));
    while (chars.length && textWidth(`${chars.join("")}...`) > maxWidth) chars.pop();
    lines[lines.length - 1] = `${chars.join("")}...`;
  }
  return lines.length ? lines : [""];
}

function textWidth(value) {
  return Array.from(String(value || "")).reduce((sum, char) => {
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char)) return sum + 1;
    if (/[A-Z0-9]/.test(char)) return sum + 0.68;
    if (/\s/.test(char)) return sum + 0.34;
    return sum + 0.56;
  }, 0);
}

function formatDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : "";
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
