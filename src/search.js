const input = document.querySelector("#searchInputPage");
const results = document.querySelector("#searchResults");
const status = document.querySelector("#searchStatus");
const facets = document.querySelector("#searchFacets");
const clearButton = document.querySelector("[data-search-clear]");
const yearSelect = document.querySelector("#searchYearFilter");
const categorySelect = document.querySelector("#searchCategoryFilter");
const params = new URLSearchParams(window.location.search);
const searchRenderDelay = 160;
let searchRenderTimer = 0;

const state = {
  query: params.get("q") || "",
  year: params.get("year") || "",
  category: params.get("category") || "",
  tag: params.get("tag") || ""
};

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

function queryTokens(query) {
  return normalize(query).split(" ").filter(Boolean);
}

function highlight(value, query) {
  let html = escapeHtml(value);
  const terms = queryTokens(query).slice(0, 5);
  for (const term of terms) {
    html = html.replace(new RegExp(escapeRegExp(escapeHtml(term)), "gi"), "<mark>$&</mark>");
  }
  return html;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(date));
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
    year: normalize(post.year || String(post.date || "").slice(0, 4)),
    tags: (post.tags || []).map((tag) => normalize(tag)),
    text: normalize(post.text)
  };
}

function scoreFields(fields, query, baseScore) {
  const normalizedQuery = normalize(query);
  const compactQuery = compact(query);
  const terms = queryTokens(query);
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

  if (terms.length > 1 && terms.every((term) => combined.includes(term))) {
    score += baseScore;
  }

  if (!score && compactCombined.includes(compactQuery)) score += Math.round(baseScore * 0.8);
  return score;
}

function scorePost(post, query) {
  const fields = searchable(post);
  const primaryScore = scoreFields([fields.title, fields.category, fields.series, fields.year, ...fields.tags], query, 40);
  if (primaryScore > 0) return { tier: 1, score: primaryScore };

  const summaryScore = scoreFields([fields.summary], query, 24);
  if (summaryScore > 0) return { tier: 2, score: summaryScore };

  const bodyScore = scoreFields([fields.text], query, 8);
  if (bodyScore > 0) return { tier: 3, score: bodyScore };

  return { tier: 0, score: 0 };
}

function countEntries(posts, getter) {
  const counts = new Map();
  for (const post of posts) {
    const values = Array.isArray(getter(post)) ? getter(post) : [getter(post)];
    for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
}

function postYear(post) {
  return post.year || String(post.date || "").slice(0, 4);
}

function availableValues(posts, getter) {
  const values = new Set();
  for (const post of posts) {
    const entries = Array.isArray(getter(post)) ? getter(post) : [getter(post)];
    for (const value of entries.filter(Boolean)) values.add(value);
  }
  return values;
}

function sanitizeState(posts) {
  let changed = false;
  const years = availableValues(posts, (post) => post.year || String(post.date || "").slice(0, 4));
  const categories = availableValues(posts, (post) => post.category);
  const tags = availableValues(posts, (post) => post.tags);

  if (state.year && !years.has(state.year)) {
    state.year = "";
    changed = true;
  }
  if (state.category && !categories.has(state.category)) {
    state.category = "";
    changed = true;
  }
  if (state.tag && !tags.has(state.tag)) {
    state.tag = "";
    changed = true;
  }

  if (changed) updateUrl();
}

function facetButton(type, value, count) {
  const active = state[type] === value;
  return `<button class="facet-button${active ? " active" : ""}" type="button" data-facet-type="${type}" data-facet-value="${escapeHtml(value)}" aria-pressed="${active}">
    <span>${escapeHtml(value)}</span><b>${count}</b>
  </button>`;
}

function selectOption(value, count, active) {
  return `<option value="${escapeHtml(value)}"${active ? " selected" : ""}>${escapeHtml(value)} (${count})</option>`;
}

function renderFilterSelect(select, type, label, entries) {
  if (!select) return;
  const active = state[type] || "";
  select.innerHTML = [
    `<option value=""${!active ? " selected" : ""}>${label}</option>`,
    ...entries.map(([value, count]) => selectOption(value, count, value === active))
  ].join("");
  select.value = active;
}

function renderFilterSelects(posts) {
  const years = includeActiveFacet(
    countEntries(facetScope(posts, "year"), postYear).sort(
      (a, b) => Number.parseInt(b[0], 10) - Number.parseInt(a[0], 10) || b[0].localeCompare(a[0], "zh-CN")
    ),
    "year"
  );
  const categories = includeActiveFacet(countEntries(facetScope(posts, "category"), (post) => post.category), "category");

  renderFilterSelect(yearSelect, "year", "全部年份", years);
  renderFilterSelect(categorySelect, "category", "全部分类", categories);
}

function renderFacets(posts) {
  if (!facets) return;
  const tags = limitFacetEntries(
    includeActiveFacet(countEntries(facetScope(posts, "tag"), (post) => post.tags), "tag"),
    "tag",
    24
  );

  facets.innerHTML = `
    <div class="facet-group">
      <span>标签</span>
      <div class="facet-list">
        ${tags.map(([tag, count]) => facetButton("tag", tag, count)).join("")}
      </div>
    </div>`;
}

function includeActiveFacet(entries, type) {
  const active = state[type];
  if (!active || entries.some(([value]) => value === active)) return entries;
  return [...entries, [active, 0]];
}

function limitFacetEntries(entries, type, limit) {
  const limited = entries.slice(0, limit);
  const active = state[type];
  if (!active || limited.some(([value]) => value === active)) return limited;
  const activeEntry = entries.find(([value]) => value === active) || [active, 0];
  return [...limited, activeEntry];
}

function matchesQuery(post) {
  return !normalize(state.query) || scorePost(post, state.query).score > 0;
}

function facetScope(posts, except) {
  return posts.filter((post) => matchesQuery(post) && matchesFilters(post, except));
}

function matchesFilters(post, except = "") {
  const year = postYear(post);
  const yearMatches = except === "year" || !state.year || year === state.year;
  const categoryMatches = except === "category" || !state.category || post.category === state.category;
  const tagMatches = except === "tag" || !state.tag || (post.tags || []).includes(state.tag);
  return yearMatches && categoryMatches && tagMatches;
}

function truncate(value, maxLength = 118) {
  const chars = Array.from(String(value || "").replace(/\s+/g, " ").trim());
  if (chars.length <= maxLength) return chars.join("");
  return `${chars.slice(0, maxLength - 1).join("")}…`;
}

function snippet(post, query) {
  if (!normalize(query)) return post.summary;
  const terms = queryTokens(query);
  const chunks = String(`${post.summary || ""}。${post.text || ""}`)
    .replace(/\s+/g, " ")
    .split(/[。！？.!?]\s*/u)
    .filter(Boolean);
  const matched = chunks.find((chunk) => terms.some((term) => normalize(chunk).includes(term)));
  return truncate(matched || post.summary || post.text || "");
}

function resultLabel(query, count, showingRecent) {
  if (showingRecent) return `最近更新的 ${count} 篇文章`;
  if (normalize(query)) return `匹配到 ${count} 篇文章`;
  return `筛选出 ${count} 篇文章`;
}

function selectedFilters() {
  return [
    state.year ? `年份：${state.year}` : "",
    state.category ? `分类：${state.category}` : "",
    state.tag ? `标签：${state.tag}` : ""
  ]
    .filter(Boolean)
    .join(" · ");
}

function renderCard(post, query) {
  return `<article class="search-result-card" role="listitem" data-result-year="${escapeHtml(postYear(post))}" data-result-category="${escapeHtml(post.category)}">
    <a class="search-result-thumb" href="${escapeHtml(post.url)}" aria-label="${escapeHtml(post.title)}">
      <img src="${escapeHtml(post.cover || "/assets/posts/start-here.svg")}" alt="" width="1200" height="675" loading="lazy" decoding="async" />
      <span>${escapeHtml(post.category)}</span>
    </a>
    <div class="search-result-body">
      <div class="post-meta">
        <time datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
        <span>${escapeHtml(post.readingTime || "")}</span>
      </div>
      <h2><a href="${escapeHtml(post.url)}">${highlight(post.title, query)}</a></h2>
      <p>${highlight(snippet(post, query), query)}</p>
      <div class="tag-row">${(post.tags || [])
        .slice(0, 5)
        .map((tag) => `<a href="/tags/${slugify(tag)}/">${escapeHtml(tag)}</a>`)
        .join("")}</div>
    </div>
  </article>`;
}

function rankedPosts(posts) {
  const query = state.query;
  const filtered = posts.filter((post) => matchesFilters(post));
  const hasQuery = Boolean(normalize(query));

  if (!hasQuery) {
    return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  return filtered
    .map((post) => ({ post, ...scorePost(post, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => a.tier - b.tier || b.score - a.score || new Date(b.post.date) - new Date(a.post.date))
    .map((item) => item.post);
}

function updateUrl() {
  const url = new URL(window.location.href);
  const next = new URLSearchParams();
  if (normalize(state.query)) next.set("q", state.query.trim());
  if (state.year) next.set("year", state.year);
  if (state.category) next.set("category", state.category);
  if (state.tag) next.set("tag", state.tag);
  url.search = next.toString();
  window.history.replaceState({}, "", url);
}

function syncControls() {
  if (input && input.value !== state.query) input.value = state.query;
  if (yearSelect && yearSelect.value !== state.year) yearSelect.value = state.year;
  if (categorySelect && categorySelect.value !== state.category) categorySelect.value = state.category;
  const hasState = Boolean(normalize(state.query) || state.year || state.category || state.tag);
  if (clearButton) clearButton.hidden = !hasState;
  for (const button of facets?.querySelectorAll("[data-facet-type]") || []) {
    const type = button.dataset.facetType;
    const active = state[type] === button.dataset.facetValue;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function render(posts) {
  const showingRecent = !normalize(state.query) && !state.year && !state.category && !state.tag;
  const matched = rankedPosts(posts);
  const visible = showingRecent ? matched.slice(0, 6) : matched;
  const filters = selectedFilters();

  renderFilterSelects(posts);
  renderFacets(posts);
  syncControls();

  if (visible.length === 0) {
    if (status) {
      status.innerHTML = `<div class="search-summary">
        <p class="search-count">没有找到匹配文章</p>
        ${filters ? `<span>${escapeHtml(filters)}</span>` : ""}
      </div>`;
    }
    results.removeAttribute("role");
    results.innerHTML = `<div class="search-empty">
      <p>没有找到匹配文章。</p>
      <small>${filters ? `${escapeHtml(filters)} · ` : ""}可以换一个关键词或清除筛选。</small>
    </div>`;
    return;
  }

  results.setAttribute("role", "list");
  if (status) {
    status.innerHTML = `<div class="search-summary">
    <p class="search-count">${resultLabel(state.query, visible.length, showingRecent)}</p>
    ${filters ? `<span>${escapeHtml(filters)}</span>` : ""}
  </div>`;
  }
  results.innerHTML = visible.map((post) => renderCard(post, state.query)).join("");
}

function cancelScheduledSearchRender() {
  if (!searchRenderTimer) return;
  window.clearTimeout(searchRenderTimer);
  searchRenderTimer = 0;
}

function scheduleSearchRender(posts) {
  cancelScheduledSearchRender();
  searchRenderTimer = window.setTimeout(() => {
    searchRenderTimer = 0;
    updateUrl();
    render(posts);
  }, searchRenderDelay);
}

async function boot() {
  if (!input || !results) return;

  input.value = state.query;

  const response = await fetch("/search-index.json");
  if (!response.ok) throw new Error("Search index is unavailable.");
  const posts = await response.json();

  sanitizeState(posts);
  render(posts);

  input.addEventListener("input", () => {
    state.query = input.value;
    scheduleSearchRender(posts);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    cancelScheduledSearchRender();
    state.query = "";
    input.value = "";
    updateUrl();
    render(posts);
  });

  facets?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-facet-type]");
    if (!button) return;
    cancelScheduledSearchRender();
    const type = button.dataset.facetType;
    const value = button.dataset.facetValue || "";
    state[type] = state[type] === value ? "" : value;
    updateUrl();
    render(posts);
  });

  yearSelect?.addEventListener("change", () => {
    cancelScheduledSearchRender();
    state.year = yearSelect.value;
    updateUrl();
    render(posts);
  });

  categorySelect?.addEventListener("change", () => {
    cancelScheduledSearchRender();
    state.category = categorySelect.value;
    updateUrl();
    render(posts);
  });

  clearButton?.addEventListener("click", () => {
    cancelScheduledSearchRender();
    state.query = "";
    state.year = "";
    state.category = "";
    state.tag = "";
    updateUrl();
    render(posts);
    input.focus();
  });
}

boot().catch(() => {
  results?.removeAttribute("role");
  if (status) status.innerHTML = '<p class="muted">搜索索引暂时不可用。</p>';
  if (results) results.innerHTML = "";
});
