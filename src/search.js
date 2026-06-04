const input = document.querySelector("#searchInputPage");
const results = document.querySelector("#searchResults");
const params = new URLSearchParams(window.location.search);

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function render(posts, query) {
  if (!query) {
    results.innerHTML = '<p class="muted">输入关键词开始搜索。</p>';
    return;
  }

  const matched = posts
    .map((post) => {
      const haystack = normalize(
        [post.title, post.summary, post.category, post.tags.join(" "), post.text].join(" ")
      );
      return { post, matched: haystack.includes(query) };
    })
    .filter((item) => item.matched)
    .map((item) => item.post);

  if (matched.length === 0) {
    results.innerHTML = '<p class="muted">没有找到匹配文章。</p>';
    return;
  }

  results.innerHTML = matched
    .map(
      (post) => `<article class="search-result">
        <h2><a href="${post.url}">${post.title}</a></h2>
        <p>${post.summary}</p>
        <div class="post-meta"><span>${post.category}</span><span>${post.date}</span></div>
      </article>`
    )
    .join("");
}

const response = await fetch("/search-index.json");
const posts = await response.json();
const initialQuery = params.get("q") || "";
input.value = initialQuery;
render(posts, normalize(initialQuery));

input.addEventListener("input", () => {
  const query = normalize(input.value);
  const url = new URL(window.location.href);
  if (query) {
    url.searchParams.set("q", query);
  } else {
    url.searchParams.delete("q");
  }
  window.history.replaceState({}, "", url);
  render(posts, query);
});
