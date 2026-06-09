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

function tokens(query) {
  return normalize(query).split(" ").filter(Boolean);
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
    tags: normalize((post.tags || []).join(" ")),
    text: normalize(post.text),
    compactTitle: compact(post.title),
    compactAll: compact([post.title, post.summary, post.category, (post.tags || []).join(" "), post.text].join(" "))
  };
}

function scorePost(post, query) {
  const fields = searchable(post);
  const normalizedQuery = normalize(query);
  const compactQuery = compact(query);
  const queryTokens = tokens(query);
  let score = 0;

  if (!normalizedQuery) return 0;

  if (fields.title === normalizedQuery) score += 200;
  if (fields.title.includes(normalizedQuery)) score += 120;
  if (fields.compactTitle.includes(compactQuery)) score += 100;
  if (fields.category.includes(normalizedQuery)) score += 80;
  if (fields.tags.includes(normalizedQuery)) score += 70;
  if (fields.summary.includes(normalizedQuery)) score += 48;
  if (fields.text.includes(normalizedQuery)) score += 24;
  if (fields.compactAll.includes(compactQuery)) score += 32;

  const allTokensMatched = queryTokens.every((token) =>
    [fields.title, fields.category, fields.tags, fields.summary, fields.text].some((field) =>
      field.includes(token)
    )
  );
  if (!allTokensMatched && score === 0) return 0;

  for (const token of queryTokens) {
    if (fields.title.includes(token)) score += 42;
    if (fields.category.includes(token)) score += 24;
    if (fields.tags.includes(token)) score += 22;
    if (fields.summary.includes(token)) score += 12;
    if (fields.text.includes(token)) score += 4;
  }

  return score;
}

function render(posts, query) {
  if (!query) {
    results.innerHTML = '<p class="muted">输入关键词开始搜索。</p>';
    return;
  }

  const matched = posts
    .map((post) => ({ post, score: scorePost(post, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.post.date) - new Date(a.post.date))
    .map((item) => item.post);

  if (matched.length === 0) {
    results.innerHTML = '<p class="muted">没有找到匹配文章。</p>';
    return;
  }

  results.innerHTML = `<p class="search-count">找到 ${matched.length} 篇文章</p>${matched
    .map(
      (post) => `<article class="search-result-card">
        <a class="search-result-thumb" href="${escapeHtml(post.url)}" style="--cover-image: url('${escapeHtml(post.cover || "/assets/hero-game-tech.png")}')" aria-hidden="true">
          <span>${escapeHtml(post.category)}</span>
        </a>
        <div class="search-result-body">
          <div class="post-meta">
            <time datetime="${escapeHtml(post.date)}">${escapeHtml(post.date)}</time>
            <span>${escapeHtml(post.readingTime || "")}</span>
          </div>
          <h2><a href="${escapeHtml(post.url)}">${escapeHtml(post.title)}</a></h2>
          <p>${escapeHtml(post.summary)}</p>
          <div class="tag-row">${(post.tags || [])
            .slice(0, 5)
            .map((tag) => `<a href="/tags/${slugify(tag)}/">${escapeHtml(tag)}</a>`)
            .join("")}</div>
        </div>
      </article>`
    )
    .join("")}`;
}

const response = await fetch("/search-index.json");
const posts = await response.json();
const initialQuery = params.get("q") || "";
input.value = initialQuery;
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
