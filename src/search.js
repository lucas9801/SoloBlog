const input = document.querySelector("#searchInputPage");
const results = document.querySelector("#searchResults");
const params = new URLSearchParams(window.location.search);

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[，。！？；：、,.!?;:()[\]{}"'`~_#*|/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  return normalize(value).replace(/\s+/g, "");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(value, query) {
  const escaped = escapeHtml(value);
  const term = query.trim();
  if (!term) return escaped;
  return escaped.replace(new RegExp(escapeRegExp(escapeHtml(term)), "gi"), "<mark>$&</mark>");
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(date));
}

function tokens(query) {
  return normalize(query).split(" ").filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function slugify(value = "") {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || encodeURIComponent(String(value));
}

function searchable(post) {
  return {
    title: normalize(post.title),
    summary: normalize(post.summary),
    category: normalize(post.category),
    series: normalize(post.series),
    tags: (post.tags || []).map((tag) => normalize(tag)),
    text: normalize(post.text)
  };
}

function scoreFields(fields, query, baseScore) {
  const normalizedQuery = normalize(query);
  const compactQuery = compact(query);
  const queryTokens = tokens(query);
  const normalizedFields = unique(fields.map((field) => normalize(field)));
  const combined = normalize(normalizedFields.join(" "));
  const compactCombined = compact(combined);
  let score = 0;

  if (!normalizedQuery) return 0;

  for (const field of normalizedFields) {
    if (field === normalizedQuery) score += baseScore * 4;
    if (field.includes(normalizedQuery)) score += baseScore * 2;
    if (compact(field).includes(compactQuery)) score += baseScore;
  }

  if (queryTokens.length > 1 && queryTokens.every((token) => combined.includes(token))) {
    score += baseScore;
  }

  if (!score && compactCombined.includes(compactQuery)) score += Math.round(baseScore * 0.8);
  return score;
}

function scorePost(post, query) {
  const fields = searchable(post);
  const primaryScore = scoreFields([fields.title, fields.category, fields.series, ...fields.tags], query, 40);
  if (primaryScore > 0) return { tier: 1, score: primaryScore };

  const summaryScore = scoreFields([fields.summary], query, 24);
  if (summaryScore > 0) return { tier: 2, score: summaryScore };

  const bodyScore = scoreFields([fields.text], query, 8);
  if (bodyScore > 0) return { tier: 3, score: bodyScore };

  return { tier: 0, score: 0 };
}

function render(posts, query) {
  if (!query) {
    results.innerHTML = '<p class="muted">输入关键词开始搜索。</p>';
    return;
  }

  const ranked = posts
    .map((post) => ({ post, ...scorePost(post, query) }))
    .filter((item) => item.score > 0);

  if (ranked.length === 0) {
    results.innerHTML = '<p class="muted">没有找到匹配文章。</p>';
    return;
  }

  const matched = ranked
    .sort((a, b) => a.tier - b.tier || b.score - a.score || new Date(b.post.date) - new Date(a.post.date))
    .map((item) => item.post);

  results.innerHTML = `<p class="search-count">匹配到 ${matched.length} 篇文章</p>${matched
    .map(
      (post) => `<article class="search-result-card">
        <a class="search-result-thumb" href="${escapeHtml(post.url)}" style="--cover-image: url('${escapeHtml(post.cover || "/assets/hero-game-tech.png")}')" aria-label="${escapeHtml(post.title)}">
          <span>${escapeHtml(post.category)}</span>
        </a>
        <div class="search-result-body">
          <div class="post-meta">
            <time datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
            <span>${escapeHtml(post.readingTime || "")}</span>
          </div>
          <h2><a href="${escapeHtml(post.url)}">${highlight(post.title, query)}</a></h2>
          <p>${highlight(post.summary, query)}</p>
          <div class="tag-row">${(post.tags || [])
            .slice(0, 5)
            .map((tag) => `<a href="/tags/${slugify(tag)}/">${escapeHtml(tag)}</a>`)
            .join("")}</div>
        </div>
      </article>`
    )
    .join("")}`;
}

const initialQuery = params.get("q") || "";
input.value = initialQuery;

try {
  const response = await fetch("/search-index.json");
  if (!response.ok) throw new Error("Search index is unavailable.");
  const posts = await response.json();
  render(posts, initialQuery);

  input.addEventListener("input", () => {
    const query = input.value;
    const url = new URL(window.location.href);
    if (normalize(query)) {
      url.searchParams.set("q", query.trim());
    } else {
      url.searchParams.delete("q");
    }
    window.history.replaceState({}, "", url);
    render(posts, query);
  });
} catch {
  results.innerHTML = '<p class="muted">搜索索引暂时不可用。</p>';
}
