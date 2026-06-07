const viewNodes = Array.from(document.querySelectorAll("[data-view-slug]"));

function uniqueSlugs(nodes) {
  return Array.from(new Set(nodes.map((node) => node.dataset.viewSlug).filter(Boolean)));
}

function renderViews(viewsBySlug) {
  const formatter = new Intl.NumberFormat("zh-CN");
  for (const node of viewNodes) {
    const slug = node.dataset.viewSlug;
    if (!slug || !(slug in viewsBySlug)) continue;
    node.hidden = false;
    node.textContent = `阅读 ${formatter.format(Math.max(0, Number.parseInt(viewsBySlug[slug], 10) || 0))}`;
  }
}

async function loadViews() {
  const slugs = uniqueSlugs(viewNodes);
  if (slugs.length === 0) return;

  const params = new URLSearchParams({ slugs: slugs.join(",") });
  const response = await fetch(`/api/views?${params.toString()}`, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) throw new Error("View counter is unavailable.");
  const data = await response.json();
  const viewsBySlug =
    data.views && typeof data.views === "object" ? data.views : { [data.slug]: data.views };
  renderViews(viewsBySlug);
}

loadViews().catch(() => {
  for (const node of viewNodes) node.hidden = true;
});
