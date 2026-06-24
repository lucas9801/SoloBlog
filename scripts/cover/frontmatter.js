const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n?)([\s\S]*)$/;

export function parseFrontmatterValue(value) {
  const raw = String(value || "").trim();
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return raw.replace(/^["']|["']$/g, "");
}

export function parseFrontmatter(source) {
  const match = String(source || "").match(frontmatterPattern);
  if (!match) return { data: {}, body: source, hasFrontmatter: false, raw: "" };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) data[key] = parseFrontmatterValue(value);
  }

  return {
    data,
    body: match[3],
    hasFrontmatter: true,
    raw: match[1],
    separator: match[2] || "\n"
  };
}

export function setFrontmatterField(source, key, value) {
  const match = String(source || "").match(frontmatterPattern);
  if (!match) {
    throw new Error("Article is missing YAML frontmatter.");
  }

  const lines = match[1].split(/\r?\n/);
  const fieldPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:`);
  const replacement = `${key}: ${value}`;
  const index = lines.findIndex((line) => fieldPattern.test(line));

  if (index >= 0) {
    lines[index] = replacement;
  } else {
    lines.push(replacement);
  }

  return `---\n${lines.join("\n")}\n---${match[2] || "\n"}${match[3]}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
