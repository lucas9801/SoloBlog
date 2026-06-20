const input = document.querySelector("#searchInputPage");
const results = document.querySelector("#searchResults");
const status = document.querySelector("#searchStatus");
const facets = document.querySelector("#searchFacets");
const activeFilters = document.querySelector("#searchActiveFilters");
const pagination = document.querySelector("#searchPagination");
const clearButton = document.querySelector("[data-search-clear]");
const params = new URLSearchParams(window.location.search);
const SEARCH_RESULTS_PER_PAGE = 6;
const searchRenderDelay = 160;
let searchRenderTimer = 0;

function pageNumber(value) {
  const page = Number.parseInt(value || "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

const state = {
  query: params.get("q") || "",
  year: params.get("year") || "",
  category: params.get("category") || "",
  series: params.get("series") || "",
  tag: params.get("tag") || "",
  page: pageNumber(params.get("page"))
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
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

function dateTime(date) {
  const value = new Date(date);
  return Number.isNaN(value.getTime()) ? 0 : value.getTime();
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
  const series = availableValues(posts, (post) => post.series);
  const tags = availableValues(posts, (post) => post.tags);

  if (state.year && !years.has(state.year)) {
    state.year = "";
    changed = true;
  }
  if (state.category && !categories.has(state.category)) {
    state.category = "";
    changed = true;
  }
  if (state.series && !series.has(state.series)) {
    state.series = "";
    changed = true;
  }
  if (state.tag && !tags.has(state.tag)) {
    state.tag = "";
    changed = true;
  }
  if (!hasSearchState() && state.page !== 1) {
    state.page = 1;
    changed = true;
  }

  if (changed) updateUrl();
}

function facetButton(type, value, count, label = value) {
  const active = value ? state[type] === value : !state[type];
  return `<button class="facet-button${active ? " active" : ""}" type="button" data-facet-type="${type}" data-facet-value="${escapeHtml(value)}" aria-pressed="${active}" aria-controls="searchResults searchStatus">
    <span>${escapeHtml(label)}</span><b>${count}</b>
  </button>`;
}

function facetGroup(label, type, allLabel, allCount, entries) {
  return `<div class="facet-group">
    <span>${escapeHtml(label)}</span>
    <div class="facet-list">
      ${facetButton(type, "", allCount, allLabel)}
      ${entries.map(([value, count]) => facetButton(type, value, count)).join("")}
    </div>
  </div>`;
}

function renderFacets(posts) {
  if (!facets) return;
  const yearScope = facetScope(posts, "year");
  const categoryScope = facetScope(posts, "category");
  const seriesScope = facetScope(posts, "series");
  const tagScope = facetScope(posts, "tag");
  const years = includeActiveFacet(
    countEntries(yearScope, postYear).sort(
      (a, b) => Number.parseInt(b[0], 10) - Number.parseInt(a[0], 10) || b[0].localeCompare(a[0], "zh-CN")
    ),
    "year"
  );
  const categories = includeActiveFacet(countEntries(categoryScope, (post) => post.category), "category");
  const series = includeActiveFacet(countEntries(seriesScope, (post) => post.series), "series");
  const tags = limitFacetEntries(
    includeActiveFacet(countEntries(tagScope, (post) => post.tags), "tag"),
    "tag",
    24
  );

  facets.innerHTML = `
    ${facetGroup("年份", "year", "全部年份", yearScope.length, years)}
    ${facetGroup("分类", "category", "全部分类", categoryScope.length, categories)}
    ${series.length ? facetGroup("专题", "series", "全部专题", seriesScope.length, series) : ""}
    ${facetGroup("标签", "tag", "全部标签", tagScope.length, tags)}`;
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
  const seriesMatches = except === "series" || !state.series || post.series === state.series;
  const tagMatches = except === "tag" || !state.tag || (post.tags || []).includes(state.tag);
  return yearMatches && categoryMatches && seriesMatches && tagMatches;
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

function resultLabel(query, count) {
  if (normalize(query)) return `匹配到 ${count} 篇文章`;
  if (!hasSearchState()) return `全部文章 ${count} 篇`;
  return `筛选出 ${count} 篇文章`;
}

function selectedFilters() {
  return [
    state.year ? `年份：${state.year}` : "",
    state.category ? `分类：${state.category}` : "",
    state.series ? `专题：${state.series}` : "",
    state.tag ? `标签：${state.tag}` : ""
  ]
    .filter(Boolean)
    .join(" · ");
}

function selectedFilterItems() {
  return [
    normalize(state.query) ? { type: "query", label: `关键词：${state.query.trim()}` } : null,
    state.year ? { type: "year", label: `年份：${state.year}` } : null,
    state.category ? { type: "category", label: `分类：${state.category}` } : null,
    state.series ? { type: "series", label: `专题：${state.series}` } : null,
    state.tag ? { type: "tag", label: `标签：${state.tag}` } : null
  ].filter(Boolean);
}

function hasSearchState() {
  return Boolean(normalize(state.query) || state.year || state.category || state.series || state.tag);
}

function paginationItems(currentPage, totalPages) {
  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  return [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b)
    .flatMap((page, index, sorted) => {
      const previous = sorted[index - 1];
      return previous && page - previous > 1 ? ["gap", page] : [page];
    });
}

function searchParamsForState(page = state.page) {
  const next = new URLSearchParams();
  if (normalize(state.query)) next.set("q", state.query.trim());
  if (state.year) next.set("year", state.year);
  if (state.category) next.set("category", state.category);
  if (state.series) next.set("series", state.series);
  if (state.tag) next.set("tag", state.tag);
  if (page > 1) next.set("page", String(page));
  return next;
}

function searchHref(page) {
  const url = new URL(window.location.href);
  const next = searchParamsForState(page);
  url.search = next.toString();
  return `${url.pathname}${url.search}`;
}

function renderSearchPagination(totalPages) {
  if (!pagination) return;
  if (totalPages <= 1) {
    pagination.hidden = true;
    pagination.innerHTML = "";
    return;
  }

  const currentPage = state.page;
  const previous =
    currentPage > 1
      ? `<a class="pagination-control" href="${escapeHtml(searchHref(currentPage - 1))}" data-search-page="${currentPage - 1}">上一页</a>`
      : `<span class="pagination-control disabled" aria-disabled="true">上一页</span>`;
  const next =
    currentPage < totalPages
      ? `<a class="pagination-control" href="${escapeHtml(searchHref(currentPage + 1))}" data-search-page="${currentPage + 1}">下一页</a>`
      : `<span class="pagination-control disabled" aria-disabled="true">下一页</span>`;
  const pages = paginationItems(currentPage, totalPages)
    .map((page) => {
      if (page === "gap") return `<span class="pagination-ellipsis" aria-hidden="true">...</span>`;
      if (page === currentPage) {
        return `<span class="active" aria-current="page" aria-label="第 ${page} 页，当前页">${page}</span>`;
      }
      return `<a href="${escapeHtml(searchHref(page))}" data-search-page="${page}" aria-label="第 ${page} 页">${page}</a>`;
    })
    .join("");

  pagination.hidden = false;
  pagination.innerHTML = `${previous}${pages}${next}`;
}

function renderCard(post, query, index) {
  return `<article class="search-result-card" role="listitem" data-result-year="${escapeHtml(postYear(post))}" data-result-category="${escapeHtml(post.category)}" data-result-series="${escapeHtml(post.series || "")}">
    <span class="search-result-index" aria-hidden="true">${escapeHtml(String(index).padStart(2, "0"))}</span>
    <div class="search-result-body">
      <div class="post-meta">
        <time datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
        <span>${escapeHtml(post.category)}</span>
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
    return filtered.sort((a, b) => dateTime(b.date) - dateTime(a.date));
  }

  return filtered
    .map((post) => ({ post, ...scorePost(post, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => a.tier - b.tier || b.score - a.score || dateTime(b.post.date) - dateTime(a.post.date))
    .map((item) => item.post);
}

function updateUrl() {
  const url = new URL(window.location.href);
  const next = searchParamsForState();
  url.search = next.toString();
  window.history.replaceState({}, "", url);
}

function syncControls() {
  if (input && input.value !== state.query) input.value = state.query;
  const hasState = hasSearchState();
  if (clearButton) clearButton.hidden = !hasState;
  if (activeFilters) {
    const items = selectedFilterItems();
    activeFilters.hidden = items.length === 0;
    activeFilters.innerHTML = items.length
      ? `<span>当前筛选</span>
        <div class="active-filter-list">
          ${items
            .map(
              (item) =>
                `<button class="active-filter-chip" type="button" data-remove-filter="${escapeHtml(item.type)}" aria-label="移除${escapeHtml(item.label)}">${escapeHtml(item.label)}</button>`
            )
            .join("")}
        </div>
        <button class="active-filter-clear" type="button" data-clear-active-filters>清除全部</button>`
      : "";
  }
  for (const button of facets?.querySelectorAll("[data-facet-type]") || []) {
    const type = button.dataset.facetType;
    const value = button.dataset.facetValue || "";
    const active = value ? state[type] === value : !state[type];
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function render(posts) {
  const matched = rankedPosts(posts);
  const totalPages = Math.max(1, Math.ceil(matched.length / SEARCH_RESULTS_PER_PAGE));
  const nextPage = Math.min(state.page, totalPages);
  if (state.page !== nextPage) {
    state.page = nextPage;
    updateUrl();
  }
  const visible = matched.slice((state.page - 1) * SEARCH_RESULTS_PER_PAGE, state.page * SEARCH_RESULTS_PER_PAGE);
  const filters = selectedFilters();

  renderFacets(posts);
  renderSearchPagination(visible.length > 0 ? totalPages : 1);
  syncControls();

  if (visible.length === 0) {
    if (status) {
      status.innerHTML = `<div class="search-summary">
        <p class="search-count">没有找到匹配文章</p>
        ${filters ? `<span>${escapeHtml(filters)}</span>` : ""}
      </div>`;
    }
    renderSearchPagination(1);
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
    <p class="search-count">${resultLabel(state.query, matched.length)}</p>
    ${[filters, totalPages > 1 ? `第 ${state.page}/${totalPages} 页` : ""]
      .filter(Boolean)
      .map((item) => `<span>${escapeHtml(item)}</span>`)
      .join("")}
  </div>`;
  }
  results.innerHTML = visible
    .map((post, index) => renderCard(post, state.query, (state.page - 1) * SEARCH_RESULTS_PER_PAGE + index + 1))
    .join("");
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

function resetSearchState() {
  state.query = "";
  state.year = "";
  state.category = "";
  state.series = "";
  state.tag = "";
  state.page = 1;
  if (input) input.value = "";
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
    state.page = 1;
    scheduleSearchRender(posts);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    cancelScheduledSearchRender();
    resetSearchState();
    updateUrl();
    render(posts);
  });

  facets?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("[data-facet-type]");
    if (!button) return;
    cancelScheduledSearchRender();
    const type = button.dataset.facetType;
    if (!["year", "category", "series", "tag"].includes(type)) return;
    const value = button.dataset.facetValue || "";
    state[type] = state[type] === value ? "" : value;
    state.page = 1;
    updateUrl();
    render(posts);
  });

  activeFilters?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const clear = target?.closest("[data-clear-active-filters]");
    const remove = target?.closest("[data-remove-filter]");
    if (!clear && !remove) return;

    cancelScheduledSearchRender();
    if (clear) {
      resetSearchState();
    } else {
      const type = remove.dataset.removeFilter;
      if (type === "query") state.query = "";
      if (type === "year") state.year = "";
      if (type === "category") state.category = "";
      if (type === "series") state.series = "";
      if (type === "tag") state.tag = "";
      state.page = 1;
    }
    updateUrl();
    render(posts);
    input.focus();
  });

  pagination?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest("[data-search-page]");
    if (!link) return;
    event.preventDefault();
    cancelScheduledSearchRender();
    state.page = pageNumber(link.dataset.searchPage);
    updateUrl();
    render(posts);
  });

  clearButton?.addEventListener("click", () => {
    cancelScheduledSearchRender();
    resetSearchState();
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
