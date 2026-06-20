import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
let requestedUrl = process.env.CHECK_URL || "";
const root = process.cwd();

const viewports = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 390, height: 844 }
];

function normalizedBaseUrl(value) {
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function pageName(pathname) {
  if (pathname === "/") return "home";
  return (
    pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.html$/i, "")
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "page"
  );
}

function frontMatterValue(markdown, name) {
  const match = String(markdown || "").match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "") || "";
}

function hasMarkdownTable(markdown) {
  return /\n\|.+\|\s*\r?\n\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|/m.test(`\n${markdown}`);
}

async function firstContentPostPath(searchIndex, predicate) {
  const postsDir = path.join(root, "content", "posts");
  const files = await readdir(postsDir).catch(() => []);
  const posts = Array.isArray(searchIndex) ? searchIndex : [];

  for (const file of files.filter((item) => item.endsWith(".md")).sort()) {
    const raw = await readFile(path.join(postsDir, file), "utf8").catch(() => "");
    if (!raw || frontMatterValue(raw, "status") === "draft" || !predicate(raw)) continue;

    const slug = frontMatterValue(raw, "slug") || slugifyForPath(frontMatterValue(raw, "title") || path.basename(file, ".md"));
    const indexed = posts.find((post) => post?.slug === slug || post?.url === `/posts/${slug}/`);
    return indexed?.url || `/posts/${slug}/`;
  }

  return "";
}

async function defaultPaths() {
  const paths = ["/", "/archive/", "/tags/", "/series/", "/search/", "/about/", "/404.html"];

  const searchIndex = await readFile(path.join(root, "dist", "search-index.json"), "utf8")
    .then(JSON.parse)
    .catch(() => []);
  const firstPost = Array.isArray(searchIndex) ? searchIndex.find((post) => post?.url)?.url : "";
  if (firstPost) paths.splice(1, 0, firstPost);
  const firstTablePost = await firstContentPostPath(searchIndex, hasMarkdownTable);
  if (firstTablePost) paths.splice(2, 0, firstTablePost);
  const firstYear = Array.isArray(searchIndex) ? searchIndex.find((post) => post?.year)?.year : "";
  if (firstYear) paths.splice(3, 0, `/years/${firstYear}/`);
  const firstCategory = Array.isArray(searchIndex) ? searchIndex.find((post) => post?.category)?.category : "";
  if (firstCategory) paths.splice(4, 0, `/categories/${slugifyForPath(firstCategory)}/`);
  if (firstYear && firstCategory) paths.splice(4, 0, `/archive/${slugifyForPath(firstYear)}/${slugifyForPath(firstCategory)}/`);
  const firstTag = Array.isArray(searchIndex) ? searchIndex.find((post) => post?.tags?.length)?.tags[0] : "";
  if (firstTag) paths.splice(5, 0, `/tags/${slugifyForPath(firstTag)}/`);
  const firstSeries = Array.isArray(searchIndex) ? searchIndex.find((post) => post?.series)?.series : "";
  if (firstSeries) {
    const seriesIndex = paths.indexOf("/series/");
    paths.splice(seriesIndex === -1 ? paths.length : seriesIndex + 1, 0, `/series/${slugifyForPath(firstSeries)}/`);
  }
  const searchIndexPath = paths.indexOf("/search/");
  paths.splice(searchIndexPath === -1 ? paths.length : searchIndexPath + 1, 0, "/search/?year=__missing__&category=__missing__&series=__missing__&tag=__missing__");

  return [...new Set(paths)];
}

function slugifyForPath(value = "") {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || encodeURIComponent(String(value));
}

async function pagesToCheck() {
  const baseUrl = normalizedBaseUrl(requestedUrl);
  const paths = process.env.CHECK_PATHS
    ? process.env.CHECK_PATHS.split(",").map((item) => item.trim()).filter(Boolean)
    : await defaultPaths();

  return paths.map((pathname) => {
    const url = new URL(pathname, baseUrl);
    return {
      name: pageName(pathname),
      pathname: url.pathname,
      search: url.search,
      url: url.toString()
    };
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runQuiet(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", resolve);
    child.on("exit", resolve);
  });
}

async function removeWithRetry(target, attempts = 8) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
      return;
    } catch (error) {
      if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(error.code) || index === attempts - 1) {
        throw error;
      }
      await wait(150 * (index + 1));
    }
  }
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  if (process.platform === "win32" && child.pid) {
    const taskkill = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore"
    });
    await Promise.race([
      new Promise((resolve) => taskkill.once("exit", resolve)),
      wait(1500)
    ]);
  }
  child.kill();
  await Promise.race([exited, wait(1500)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function waitForPreview(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview server is still starting.
    }
    await wait(150);
  }
  throw new Error(`Timed out waiting for preview server at ${url}`);
}

async function startPreviewIfNeeded() {
  if (requestedUrl) return null;

  const port = await getFreePort();
  requestedUrl = `http://127.0.0.1:${port}/`;
  const preview = spawn(process.execPath, ["scripts/preview.js"], {
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "inherit"]
  });
  preview.stdout.on("data", (chunk) => process.stdout.write(chunk));
  await waitForPreview(requestedUrl);
  return preview;
}

async function stopEdgeUserDataProcesses(userDataDir) {
  if (process.platform !== "win32") return;
  const needle = userDataDir.replaceAll("'", "''");
  const command = `$needle = '${needle}'; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like "*$needle*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  await runQuiet("powershell.exe", ["-NoProfile", "-Command", command]);
}

async function waitForJson(endpoint, timeoutMs = 20000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        return response.json();
      }
    } catch {
      // Browser is still starting.
    }
    await wait(150);
  }

  throw new Error(`Timed out waiting for ${endpoint}`);
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) {
      return;
    }

    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);

    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    async send(method, params = {}, sessionId) {
      await opened;
      const id = nextId++;
      const message = { id, method, params };
      if (sessionId) {
        message.sessionId = sessionId;
      }
      socket.send(JSON.stringify(message));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    async close() {
      await opened;
      socket.close();
    }
  };
}

async function launchBrowser(port, viewport, page) {
  const userDataDir = path.join(root, `.edge-layout-${viewport.name}-${page.name}`);
  await removeWithRetry(userDataDir);
  await mkdir(userDataDir, { recursive: true });

  const child = spawn(edgePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-crash-reporter",
    "--disable-crashpad",
    "--no-sandbox",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
    "about:blank"
  ]);

  child.stderr.resume();
  child.stdout.resume();
  return { child, userDataDir };
}

async function checkViewport(viewport, page) {
  const port = await getFreePort();
  const browser = await launchBrowser(port, viewport, page);

  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const client = connect(version.webSocketDebuggerUrl);

    const { targetId } = await client.send("Target.createTarget", { url: page.url });
    const { sessionId } = await client.send("Target.attachToTarget", {
      targetId,
      flatten: true
    });

    const send = (method, params = {}) => client.send(method, params, sessionId);
    const currentPathname = async () => {
      const location = await send("Runtime.evaluate", {
        returnByValue: true,
        expression: "decodeURIComponent(location.pathname)"
      });
      return location.result.value || "";
    };
    const waitForPathname = async (expectedPathname, timeoutMs = 4000) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        if ((await currentPathname()) === expectedPathname) return true;
        await wait(80);
      }
      return false;
    };
    const waitForSelector = async (selector, timeoutMs = 4000) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const result = await send("Runtime.evaluate", {
          returnByValue: true,
          expression: `Boolean(document.querySelector(${JSON.stringify(selector)}))`
        });
        if (result.result.value) return true;
        await wait(80);
      }
      return false;
    };

    await send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.name === "mobile"
    });
    await send("Page.enable");
    await send("Page.navigate", { url: page.url });
    await wait(900);

    const result = await send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const selectors = [
          "body",
          ".site-header",
          ".nav-links",
          ".site-search",
          ".hero-section",
          ".hero-inner",
          ".content-shell",
          ".content-main",
          ".section-head",
          ".home-post-grid",
          ".blog-sidebar",
          ".article-index-page",
          ".post-index-list",
          ".archive-filters",
          ".pagination",
          ".tag-matrix-page",
          ".tag-matrix",
          ".compact-post-index",
          ".compact-post-list",
          ".series-page",
          ".series-index-layout",
          ".series-index-sidebar",
          ".series-detail-layout",
          ".series-grid",
          ".article-shell",
          ".article-page",
          ".article-hero",
          ".article-content",
          ".article-aside",
          ".reading-pill",
          ".search-page-card",
          ".search-result-card"
        ];
        const visibleBrokenImages = Array.from(document.images)
          .filter((image) => {
            const rect = image.getBoundingClientRect();
            const visible = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
            return visible && (!image.complete || image.naturalWidth === 0);
          })
          .map((image) => image.currentSrc || image.src || image.alt || "unknown image");
        const metrics = {
          page: location.pathname,
          viewport: { width: innerWidth, height: innerHeight },
          document: {
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight
          },
          body: {
            clientWidth: document.body.clientWidth,
            scrollWidth: document.body.scrollWidth,
            scrollHeight: document.body.scrollHeight
          },
          mainCount: document.querySelectorAll("main").length,
          visibleBrokenImages,
          footer: (() => {
            const footer = document.querySelector(".site-footer");
            if (!footer) return null;
            const rect = footer.getBoundingClientRect();
            return { bottom: Math.round(rect.bottom) };
          })(),
          elements: []
        };
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (!element) continue;
          const rect = element.getBoundingClientRect();
          metrics.elements.push({
            selector,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            overflowX: getComputedStyle(element).overflowX
          });
        }
        return metrics;
      })()`
    });
    const siteRuntime =
      page.pathname === "/"
        ? await send("Runtime.evaluate", {
            awaitPromise: true,
            returnByValue: true,
            expression: `(async () => {
              const failures = [];
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const header = document.querySelector(".site-header");
              const hero = document.querySelector(".hero-inner");
              const primaryHeroLink = document.querySelector(".hero-actions .button-link");
              const toggle = document.querySelector("[data-theme-toggle]");
              const rankingTitle = document.querySelector("[data-ranking-title]");
              const rssCopyButton = document.querySelector("[data-copy-rss]");
              const headerSearchButton = document.querySelector(".site-search button[type='submit']");
              if (!header) failures.push("site header is missing");
              if (!(toggle instanceof HTMLButtonElement)) failures.push("theme toggle is missing");
              if (!(rssCopyButton instanceof HTMLButtonElement)) failures.push("RSS copy button is missing");
              if (!(headerSearchButton instanceof HTMLButtonElement)) failures.push("header search button is missing");
              if (primaryHeroLink?.getAttribute("href") === "#latest-posts" && !document.querySelector("#latest-posts")) {
                failures.push("home hero latest-posts link points to a missing section");
              }
              if (rankingTitle && rankingTitle.textContent.trim() !== "阅读排行") {
                failures.push("ranking title should stay reading-rank oriented before view data loads");
              }
              if (failures.length > 0) return failures;

              if (hero) {
                const heroHeight = Math.round(hero.getBoundingClientRect().height);
                if (innerWidth > 720 && heroHeight > 250) {
                  failures.push("desktop hero is too tall for an index-first home page");
                }
                if (innerWidth <= 720 && heroHeight > 286) {
                  failures.push("mobile hero is too tall for an index-first home page");
                }
              }
              if (headerSearchButton.getAttribute("aria-label") !== "搜索文章") {
                failures.push("header search icon button is missing its accessible label");
              }
              if (headerSearchButton.childNodes.length !== 1 || headerSearchButton.textContent.trim() !== "搜索文章") {
                failures.push("header search icon button should expose text only through sr-only content");
              }
              const hiddenSearchLabel = headerSearchButton.querySelector(".sr-only");
              if (!hiddenSearchLabel || getComputedStyle(hiddenSearchLabel).position !== "absolute") {
                failures.push("header search icon button hidden label is not visually hidden");
              }

              const originalTheme = document.documentElement.dataset.theme || "light";
              const expectedNext = originalTheme === "dark" ? "light" : "dark";
              const themeLabel = (theme) => (theme === "dark" ? "切换浅色模式" : "切换深色模式");
              if (toggle.getAttribute("aria-label") !== themeLabel(originalTheme)) {
                failures.push("theme toggle aria-label is out of sync before toggling");
              }
              toggle.click();
              await wait(120);
              if (document.documentElement.dataset.theme !== expectedNext) {
                failures.push("theme toggle did not update document theme");
              }
              if (toggle.getAttribute("aria-pressed") !== String(expectedNext === "dark")) {
                failures.push("theme toggle aria-pressed is out of sync");
              }
              if (toggle.getAttribute("aria-label") !== themeLabel(expectedNext)) {
                failures.push("theme toggle aria-label is out of sync after toggling");
              }
              try {
                if (localStorage.getItem("solus-theme") !== expectedNext) {
                  failures.push("theme toggle did not persist the selected theme");
                }
              } catch {
                // Storage can be unavailable; the click behavior still matters.
              }
              toggle.click();
              await wait(120);
              if (document.documentElement.dataset.theme !== originalTheme) {
                failures.push("theme toggle did not restore original theme");
              }
              if (toggle.getAttribute("aria-label") !== themeLabel(originalTheme)) {
                failures.push("theme toggle aria-label did not restore with the original theme");
              }

              const rssCopyStatus = rssCopyButton.parentElement?.querySelector("[data-copy-rss-status]");
              const originalClipboard = navigator.clipboard;
              const originalRssCopyText = rssCopyButton.textContent.trim();
              try {
                Object.defineProperty(navigator, "clipboard", {
                  configurable: true,
                  value: { writeText: async () => {} }
                });
              } catch {
                failures.push("RSS copy button clipboard stub could not be installed");
              }
              rssCopyButton.click();
              await wait(120);
              if (rssCopyButton.textContent.trim() !== "已复制") {
                failures.push("RSS copy button did not expose visible feedback");
              }
              if (rssCopyButton.getAttribute("aria-label") !== "RSS 链接已复制") {
                failures.push("RSS copy button did not expose aria feedback");
              }
              if (rssCopyStatus?.textContent.trim() !== "RSS 链接已复制") {
                failures.push("RSS copy button did not expose live-region feedback");
              }
              await wait(1700);
              if (rssCopyButton.textContent.trim() !== originalRssCopyText) {
                failures.push("RSS copy button did not restore its original label");
              }
              try {
                Object.defineProperty(navigator, "clipboard", {
                  configurable: true,
                  value: originalClipboard
                });
              } catch {
                // The test page is disposable; restoring is best effort.
              }

              scrollTo(0, Math.min(520, document.documentElement.scrollHeight));
              await wait(220);
              if (!header.classList.contains("is-hidden")) {
                failures.push("header did not hide after scrolling down");
              }
              const focusTarget = header.querySelector("button, a, input");
              if (focusTarget instanceof HTMLElement) {
                focusTarget.focus();
                await wait(120);
                if (header.classList.contains("is-hidden")) {
                  failures.push("header did not reveal when it received keyboard focus");
                }
                focusTarget.blur();
                await wait(80);
              } else {
                failures.push("header has no focusable target");
              }
              scrollTo(0, 0);
              await wait(220);
              if (header.classList.contains("is-hidden")) {
                failures.push("header did not show after scrolling back to top");
              }
              return failures;
            })()`
          })
        : { result: { value: [] } };
    const searchRuntime =
      page.pathname === "/search/"
        ? await send("Runtime.evaluate", {
            awaitPromise: true,
            returnByValue: true,
            expression: `(async () => {
              const failures = [];
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const waitFor = async (predicate, timeoutMs = 4000) => {
                const started = Date.now();
                while (Date.now() - started < timeoutMs) {
                  if (predicate()) return true;
                  await wait(80);
                }
                return false;
              };

              const input = document.querySelector("#searchInputPage");
              const results = document.querySelector("#searchResults");
              const status = document.querySelector("#searchStatus");
              const facets = document.querySelector("#searchFacets");
              const activeFilters = document.querySelector("#searchActiveFilters");
              const pagination = document.querySelector("#searchPagination");
              const clearButton = document.querySelector("[data-search-clear]");
              const invalidFacetUrl = ${JSON.stringify(page.search.includes("__missing__"))};
              if (!input) failures.push("search input is missing");
              if (!results) failures.push("search results container is missing");
              if (!status) failures.push("search status container is missing");
              if (!facets) failures.push("search facets container is missing");
              if (!activeFilters) failures.push("search active filters container is missing");
              if (!pagination) failures.push("search pagination container is missing");
              if (!clearButton) failures.push("search clear button is missing");
              if (failures.length > 0) return failures;
              const clearButtonIsHidden = () => clearButton.hidden && getComputedStyle(clearButton).display === "none";
              const clearButtonIsVisible = () => !clearButton.hidden && getComputedStyle(clearButton).display !== "none";

              await waitFor(() => document.querySelectorAll(".search-result-card").length > 0 || document.querySelector(".search-empty"));
              const initialCards = document.querySelectorAll(".search-result-card").length;
              const facetButtons = document.querySelectorAll("[data-facet-type]").length;
              if (initialCards === 0) failures.push("search page did not render initial all-post results");
              if (!(status.textContent || "").includes("全部文章")) failures.push("search page initial status must describe all posts");
              if (initialCards > 0 && results.getAttribute("role") !== "list") {
                failures.push("search result cards must be inside a list container");
              }
              for (const card of document.querySelectorAll(".search-result-card")) {
                const indexNode = card.querySelector(".search-result-index");
                const titleLink = card.querySelector(".search-result-body h2 a");
                if (!(indexNode instanceof HTMLElement)) {
                  failures.push("search result card is missing a result index");
                  break;
                }
                if (!(titleLink instanceof HTMLAnchorElement)) {
                  failures.push("search result card is missing a title article link");
                  break;
                }
              }
              for (const facetButton of document.querySelectorAll("[data-facet-type]")) {
                const controls = facetButton.getAttribute("aria-controls") || "";
                if (!controls.includes("searchResults") || !controls.includes("searchStatus")) {
                  failures.push("search facet button does not expose controlled result regions");
                  break;
                }
              }
              if (pagination && !pagination.hidden && !pagination.querySelector("[data-search-page]")) {
                failures.push("search pagination is visible without page links");
              }
              if (facetButtons === 0) failures.push("search page did not render facet buttons");
              if (!clearButtonIsHidden()) failures.push("clear button is visible before any search state");
              if (!activeFilters.hidden) failures.push("active filter chips are visible before any search state");
              if (innerWidth <= 720) {
                const filterPanel = document.querySelector(".search-filter-panel");
                const filterHeight = filterPanel instanceof HTMLElement ? Math.round(filterPanel.getBoundingClientRect().height) : 0;
                if (filterHeight > 190) failures.push("mobile search filter panel is too tall");
              }
              if (invalidFacetUrl && new URL(location.href).search !== "") {
                failures.push("search page did not remove invalid facet URL params");
              }
              const defaultPageLink = pagination?.querySelector('[data-search-page="2"]');
              if (defaultPageLink instanceof HTMLAnchorElement) {
                defaultPageLink.click();
                await waitFor(() => new URL(location.href).searchParams.get("page") === "2");
                if (new URL(location.href).searchParams.get("page") !== "2") {
                  failures.push("default all-post search pagination did not preserve page in the URL");
                }
              }

              input.value = "Unity";
              input.dispatchEvent(new Event("input", { bubbles: true }));
              await waitFor(() => new URL(location.href).searchParams.get("q"));
              const queryCards = document.querySelectorAll(".search-result-card").length;
              const queryText = ((status.textContent || "") + " " + (results.textContent || "")).trim();
              if (queryCards === 0) failures.push("search query did not render result cards");
              if (!queryText.toLowerCase().includes("unity")) failures.push("search query results do not mention Unity");
              if (!results.querySelector("mark")) failures.push("search query results did not highlight matched terms");
              if (!new URL(location.href).searchParams.get("q")) failures.push("search query did not update the URL");
              if (!clearButtonIsVisible()) failures.push("clear button stayed hidden after search input");
              if (activeFilters.hidden || !activeFilters.textContent.includes("关键词：Unity")) {
                failures.push("active filter chips did not show the current query");
              }

              const firstFacetButton = (type) =>
                Array.from(document.querySelectorAll('[data-facet-type="' + type + '"]')).find(
                  (button) => button.dataset.facetValue
                );
              const activeFacetButton = (type, value) =>
                Array.from(document.querySelectorAll('[data-facet-type="' + type + '"]')).find(
                  (button) => button.dataset.facetValue === value && button.classList.contains("active")
                );

              const yearButton = firstFacetButton("year");
              let selectedYear = "";
              if (yearButton instanceof HTMLButtonElement) {
                selectedYear = yearButton.dataset.facetValue || "";
                yearButton.click();
                await waitFor(() => new URL(location.href).searchParams.get("year") === selectedYear);
                if (!activeFacetButton("year", selectedYear)) {
                  failures.push("year quick filter did not keep the selected year");
                }
              } else {
                failures.push("year quick filter has no selectable year");
              }

              const categoryButton = firstFacetButton("category");
              let selectedCategory = "";
              if (categoryButton instanceof HTMLButtonElement) {
                selectedCategory = categoryButton.dataset.facetValue || "";
                categoryButton.click();
                await waitFor(() => new URL(location.href).searchParams.get("category") === selectedCategory);
                const url = new URL(location.href);
                if (!url.searchParams.get("category")) {
                  failures.push("category quick filter did not update the URL");
                }
                if (selectedYear && url.searchParams.get("year") !== selectedYear) {
                  failures.push("category quick filter did not preserve the selected year");
                }
                await wait(120);
                const resultCards = Array.from(document.querySelectorAll(".search-result-card"));
                if (resultCards.length === 0) {
                  failures.push("combined year and category filters rendered no result cards");
                }
                if (selectedYear && resultCards.some((card) => card.dataset.resultYear !== selectedYear)) {
                  failures.push("combined search results include posts outside the selected year");
                }
                if (selectedCategory && resultCards.some((card) => card.dataset.resultCategory !== selectedCategory)) {
                  failures.push("combined search results include posts outside the selected category");
                }
                const summaryText = ((status.textContent || "") + " " + (results.textContent || "")).trim();
                if (selectedYear && !summaryText.includes("年份：" + selectedYear)) {
                  failures.push("combined search summary does not show the selected year");
                }
                if (selectedCategory && !summaryText.includes("分类：" + selectedCategory)) {
                  failures.push("combined search summary does not show the selected category");
                }
                const activeFilterText = activeFilters.textContent || "";
                if (selectedYear && !activeFilterText.includes("年份：" + selectedYear)) {
                  failures.push("active filter chips do not show the selected year");
                }
                if (selectedCategory && !activeFilterText.includes("分类：" + selectedCategory)) {
                  failures.push("active filter chips do not show the selected category");
                }
              } else {
                failures.push("category quick filter has no selectable category");
              }

              let seriesButton = firstFacetButton("series");
              let selectedSeries = "";
              if (!(seriesButton instanceof HTMLButtonElement) && selectedCategory) {
                const blockingCategoryChip = activeFilters.querySelector('[data-remove-filter="category"]');
                if (blockingCategoryChip instanceof HTMLButtonElement) {
                  blockingCategoryChip.click();
                  await waitFor(() => !new URL(location.href).searchParams.get("category"));
                  selectedCategory = "";
                  seriesButton = firstFacetButton("series");
                }
              }
              if (seriesButton instanceof HTMLButtonElement) {
                selectedSeries = seriesButton.dataset.facetValue || "";
                seriesButton.click();
                await waitFor(() => new URL(location.href).searchParams.get("series") === selectedSeries);
                const url = new URL(location.href);
                if (!url.searchParams.get("series")) {
                  failures.push("series quick filter did not update the URL");
                }
                if (selectedYear && url.searchParams.get("year") !== selectedYear) {
                  failures.push("series quick filter did not preserve the selected year");
                }
                if (selectedCategory && url.searchParams.get("category") !== selectedCategory) {
                  failures.push("series quick filter did not preserve the selected category");
                }
                if (!selectedCategory) {
                  const compatibleCategoryButton = firstFacetButton("category");
                  if (compatibleCategoryButton instanceof HTMLButtonElement) {
                    selectedCategory = compatibleCategoryButton.dataset.facetValue || "";
                    compatibleCategoryButton.click();
                    await waitFor(() => new URL(location.href).searchParams.get("category") === selectedCategory);
                    const categoryUrl = new URL(location.href);
                    if (categoryUrl.searchParams.get("series") !== selectedSeries) {
                      failures.push("category quick filter did not preserve the selected series");
                    }
                    if (selectedYear && categoryUrl.searchParams.get("year") !== selectedYear) {
                      failures.push("category quick filter after series did not preserve the selected year");
                    }
                  } else {
                    failures.push("series-filtered category list has no selectable category");
                  }
                }
                await wait(120);
                const resultCards = Array.from(document.querySelectorAll(".search-result-card"));
                if (resultCards.length === 0) {
                  failures.push("combined year/category/series filters rendered no result cards");
                }
                if (selectedCategory && resultCards.some((card) => card.dataset.resultCategory !== selectedCategory)) {
                  failures.push("combined search results include posts outside the selected category after series filtering");
                }
                if (selectedSeries && resultCards.some((card) => card.dataset.resultSeries !== selectedSeries)) {
                  failures.push("combined search results include posts outside the selected series");
                }
                const summaryText = ((status.textContent || "") + " " + (results.textContent || "")).trim();
                if (selectedSeries && !summaryText.includes("专题：" + selectedSeries)) {
                  failures.push("combined search summary does not show the selected series");
                }
                if (selectedSeries && !(activeFilters.textContent || "").includes("专题：" + selectedSeries)) {
                  failures.push("active filter chips do not show the selected series");
                }
              } else if (document.querySelectorAll('[data-facet-type="series"]').length === 0) {
                failures.push("series quick filter group is missing even though indexed posts include series");
              }

              const seriesChip = activeFilters.querySelector('[data-remove-filter="series"]');
              if (selectedSeries && seriesChip instanceof HTMLButtonElement) {
                seriesChip.click();
                await waitFor(() => !new URL(location.href).searchParams.get("series"));
                if (new URL(location.href).searchParams.get("series")) {
                  failures.push("series active filter chip did not remove the series URL param");
                }
                if (new URL(location.href).searchParams.get("q") !== "Unity") {
                  failures.push("series active filter chip did not preserve the query URL param");
                }
                if (selectedYear && new URL(location.href).searchParams.get("year") !== selectedYear) {
                  failures.push("series active filter chip did not preserve the year URL param");
                }
                if (selectedCategory && new URL(location.href).searchParams.get("category") !== selectedCategory) {
                  failures.push("series active filter chip did not preserve the category URL param");
                }
                if ((activeFilters.textContent || "").includes("专题：" + selectedSeries)) {
                  failures.push("series active filter chip did not remove the visible series chip");
                }
              } else if (selectedSeries) {
                failures.push("active filter chips do not include a removable series chip");
              }

              const categoryChip = activeFilters.querySelector('[data-remove-filter="category"]');
              if (selectedCategory && categoryChip instanceof HTMLButtonElement) {
                categoryChip.click();
                await waitFor(() => !new URL(location.href).searchParams.get("category"));
                if (new URL(location.href).searchParams.get("category")) {
                  failures.push("category active filter chip did not remove the category URL param");
                }
                if (new URL(location.href).searchParams.get("q") !== "Unity") {
                  failures.push("category active filter chip did not preserve the query URL param");
                }
                if (selectedYear && new URL(location.href).searchParams.get("year") !== selectedYear) {
                  failures.push("category active filter chip did not preserve the year URL param");
                }
                if ((activeFilters.textContent || "").includes("分类：" + selectedCategory)) {
                  failures.push("category active filter chip did not remove the visible category chip");
                }
              } else if (selectedCategory) {
                failures.push("active filter chips do not include a removable category chip");
              }

              const pollutedUrlBefore = location.href;
              const invalidFacetButton = document.createElement("button");
              invalidFacetButton.type = "button";
              invalidFacetButton.dataset.facetType = "invalid";
              invalidFacetButton.dataset.facetValue = "polluted";
              facets.append(invalidFacetButton);
              invalidFacetButton.click();
              await wait(120);
              if (location.href !== pollutedUrlBefore || new URL(location.href).searchParams.has("invalid")) {
                failures.push("search quick filters accepted an unknown facet type");
              }
              invalidFacetButton.remove();

              input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
              await wait(160);
              if (input.value !== "") failures.push("Escape did not empty the search input");
              if (new URL(location.href).search !== "") failures.push("Escape did not reset the URL search params");
              if (Array.from(document.querySelectorAll("[data-facet-type].active")).some((button) => button.dataset.facetValue)) {
                failures.push("Escape did not clear active facets");
              }
              if (!activeFilters.hidden) failures.push("Escape did not hide active filter chips");
              input.value = "Unity";
              input.dispatchEvent(new Event("input", { bubbles: true }));
              await waitFor(() => new URL(location.href).searchParams.get("q"));

              clearButton.click();
              await wait(120);
              if (input.value !== "") failures.push("clear button did not empty the search input");
              if (new URL(location.href).search !== "") failures.push("clear button did not reset the URL search params");
              if (Array.from(document.querySelectorAll("[data-facet-type].active")).some((button) => button.dataset.facetValue)) {
                failures.push("clear button did not clear active facets");
              }
              if (document.querySelectorAll(".search-result-card").length === 0) {
                failures.push("clear button did not restore recent results");
              }
              if (results.getAttribute("role") !== "list") {
                failures.push("clear button did not restore list semantics for results");
              }
              if (!clearButtonIsHidden()) failures.push("clear button stayed visible after clearing search state");
              if (!activeFilters.hidden) failures.push("clear button did not hide active filter chips");
              document.activeElement?.blur?.();

              return failures;
            })()`
          })
        : { result: { value: [] } };
    const archiveRuntime =
      page.pathname === "/archive/"
        ? await send("Runtime.evaluate", {
            returnByValue: true,
            expression: `(() => {
              const failures = [];
              const quickFilters = document.querySelector(".archive-filter-links");
              const status = document.querySelector(".archive-status");
              const duplicateForm = document.querySelector(".archive-filter-form, [data-archive-filter-form]");
              if (!(quickFilters instanceof HTMLElement)) failures.push("archive quick filters are missing");
              if (!(status instanceof HTMLElement)) failures.push("archive result status is missing");
              if (status && !/篇/.test(status.textContent || "")) failures.push("archive result status does not show a post count");
              if (quickFilters?.querySelector("summary")) failures.push("archive quick filters should not render a visible summary label");
              if (duplicateForm) failures.push("archive duplicate dropdown filters are still rendered");
              if (failures.length > 0) return { failures };

              const yearLink = Array.from(quickFilters.querySelectorAll("a")).find((link) =>
                /^\\/years\\/[^/]+\\/$/.test(new URL(link.href).pathname)
              );
              if (!yearLink) return { failures: ["archive quick filters have no year link"] };

              const yearPath = decodeURIComponent(new URL(yearLink.href).pathname);
              yearLink.click();
              return { failures, yearPath };
            })()`
          })
        : { result: { value: [] } };
    const tagRuntime =
      page.pathname === "/tags/"
        ? await send("Runtime.evaluate", {
            returnByValue: true,
            expression: `(() => {
              const failures = [];
              const matrix = document.querySelector(".tag-matrix");
              if (!(matrix instanceof HTMLElement)) return ["tag matrix is missing"];
              const items = matrix.querySelectorAll(".tag-index-item");
              if (items.length === 0) failures.push("tag matrix has no tag items");
              if (innerWidth <= 720) {
                const height = Math.round(matrix.getBoundingClientRect().height);
                const columns = getComputedStyle(matrix).gridTemplateColumns.split(" ").filter(Boolean).length;
                if (height > 330) failures.push("mobile tag matrix is too tall");
                if (columns < 2) failures.push("mobile tag matrix should use at least two columns");
              }
              return failures;
            })()`
          })
        : { result: { value: [] } };
    const archiveNavigationFailures = [];
    const archiveYearPath = archiveRuntime.result.value?.yearPath || "";
    if (archiveYearPath) {
      if (!(await waitForPathname(archiveYearPath))) {
        archiveNavigationFailures.push("archive quick year filter did not navigate to " + archiveYearPath);
      } else {
        if (!(await waitForSelector(".archive-filter-links"))) {
          archiveNavigationFailures.push("archive quick filters are missing on year page");
        }
        const combinedRuntime = await send("Runtime.evaluate", {
          returnByValue: true,
          expression: `(() => {
            const failures = [];
            const quickFilters = document.querySelector(".archive-filter-links");
            const status = document.querySelector(".archive-status");
            const duplicateForm = document.querySelector(".archive-filter-form, [data-archive-filter-form]");
            if (!(quickFilters instanceof HTMLElement)) failures.push("archive quick filters are missing on year page");
            if (!(status instanceof HTMLElement)) failures.push("archive result status is missing on year page");
            if (quickFilters?.querySelector("summary")) failures.push("archive quick filters should not render a visible summary label on year page");
            if (duplicateForm) failures.push("archive duplicate dropdown filters are still rendered on year page");
            if (failures.length > 0) return { failures };

            const combinedLink = Array.from(quickFilters.querySelectorAll("a")).find((link) =>
              /^\\/archive\\/[^/]+\\/[^/]+\\/$/.test(new URL(link.href).pathname)
            );
            if (!combinedLink) return { failures: ["archive quick filters have no combined year/category link"] };

            const combinedPath = decodeURIComponent(new URL(combinedLink.href).pathname);
            combinedLink.click();
            return { failures, combinedPath };
          })()`
        });
        archiveNavigationFailures.push(...(combinedRuntime.result.value?.failures || []));
        const archiveTargetPath = combinedRuntime.result.value?.combinedPath || "";
        if (archiveTargetPath && !(await waitForPathname(archiveTargetPath))) {
          archiveNavigationFailures.push("archive combined year/category quick filter did not navigate to " + archiveTargetPath);
        } else if (archiveTargetPath && !(await waitForSelector(".archive-filter-links"))) {
          archiveNavigationFailures.push("archive quick filters are missing on combined archive page");
        } else if (archiveTargetPath && !(await waitForSelector(".archive-status"))) {
          archiveNavigationFailures.push("archive result status is missing on combined archive page");
        }
      }
      await send("Page.navigate", { url: page.url });
      if (!(await waitForPathname(page.pathname))) {
        archiveNavigationFailures.push("archive page was not restored before screenshot capture");
      }
    }
    const headerSearchFailures = [];
    if (page.pathname === "/" && viewport.name === "desktop") {
      const submitHeaderSearch = async (query) => {
        const submitted = await send("Runtime.evaluate", {
          returnByValue: true,
          expression: `(() => {
            const form = document.querySelector(".site-search");
            const input = form?.querySelector('input[name="q"]');
            if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) return false;
            input.value = ${JSON.stringify(query)};
            form.requestSubmit();
            return true;
          })()`
        });
        return Boolean(submitted.result.value);
      };

      if (!(await submitHeaderSearch("   "))) {
        headerSearchFailures.push("header search form is missing");
      } else {
        if (!(await waitForPathname("/search/"))) {
          headerSearchFailures.push("blank header search did not navigate to /search/");
        } else {
          const blankSearch = await send("Runtime.evaluate", {
            returnByValue: true,
            expression: "location.search"
          });
          if (blankSearch.result.value) {
            headerSearchFailures.push("blank header search kept an empty query string");
          }
        }
        await send("Page.navigate", { url: page.url });
        if (!(await waitForPathname(page.pathname))) {
          headerSearchFailures.push("home page was not restored after blank header search");
        }
        await wait(500);

        if (await submitHeaderSearch("  Unity  ")) {
          if (!(await waitForPathname("/search/"))) {
            headerSearchFailures.push("trimmed header search did not navigate to /search/");
          } else {
            const submittedQuery = await send("Runtime.evaluate", {
              returnByValue: true,
              expression: "new URL(location.href).searchParams.get('q') || ''"
            });
            if (submittedQuery.result.value !== "Unity") {
              headerSearchFailures.push("header search did not trim the submitted query");
            }
          }
          await send("Page.navigate", { url: page.url });
          if (!(await waitForPathname(page.pathname))) {
            headerSearchFailures.push("home page was not restored after trimmed header search");
          }
          await wait(500);
        }
      }
    }
    const articleRuntime =
      page.pathname.startsWith("/posts/")
        ? await send("Runtime.evaluate", {
            awaitPromise: true,
            returnByValue: true,
            expression: `(async () => {
              const failures = [];
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const waitFor = async (predicate, timeoutMs = 4000) => {
                const started = Date.now();
                while (Date.now() - started < timeoutMs) {
                  if (predicate()) return true;
                  await wait(80);
                }
                return false;
              };
              const instantScrollTo = async (top) => {
                const previousScrollBehavior = document.documentElement.style.scrollBehavior;
                document.documentElement.style.scrollBehavior = "auto";
                scrollTo(0, top);
                await waitFor(() => Math.abs(window.scrollY - top) < 3, 2500);
                document.documentElement.style.scrollBehavior = previousScrollBehavior;
              };
              const percentNode = document.querySelector("#readingPercent");
              const remainingNode = document.querySelector("#readingRemaining");
              const readingPill = document.querySelector(".reading-pill");
              const tocLinks = Array.from(document.querySelectorAll("[data-toc-target]"));
              const articleHero = document.querySelector(".article-hero");
              const articleContent = document.querySelector(".article-content");
              const sidebarSeries = document.querySelector(".article-related-aside .series-panel");
              const footerSeries = document.querySelector(".article-footer .series-panel");
              const anySeries = document.querySelector(".series-panel");
              if (!percentNode) failures.push("reading percent node is missing");
              if (!remainingNode) failures.push("reading remaining node is missing");
              if (readingPill instanceof HTMLElement) {
                const pillRect = readingPill.getBoundingClientRect();
                if (pillRect.top > 1 || pillRect.height > 3) {
                  failures.push("reading progress should stay a restrained top-edge line");
                }
              }
              if (innerWidth > 720 && articleHero instanceof HTMLElement) {
                const heroHeight = Math.round(articleHero.getBoundingClientRect().height);
                if (heroHeight > 260) {
                  failures.push("article hero is too tall for a focused technical reading page");
                }
              }
              if (!articleContent) failures.push("article content is missing");
              if (anySeries && !sidebarSeries) failures.push("article series panel is not in the side column");
              if (footerSeries) failures.push("article series panel should not render inside the footer");
              if (tocLinks.length < 3) failures.push("article table of contents has fewer than 3 links");
              if (failures.length > 0) return failures;

              const commentsSection = document.querySelector("[data-giscus-comments]");
              const commentsButton = commentsSection?.querySelector("[data-load-comments]");
              if (commentsSection && commentsButton instanceof HTMLButtonElement) {
                const originalTheme = document.documentElement.dataset.theme;
                document.documentElement.dataset.theme = "dark";
                commentsButton.click();
                await wait(120);
                const commentsScript = commentsSection.querySelector('script[src="https://giscus.app/client.js"]');
                if (!commentsScript) {
                  failures.push("comments loader did not append the Giscus script");
                } else if (commentsScript.getAttribute("data-theme") !== "dark") {
                  failures.push("comments loader did not use the current site theme");
                }
                if (originalTheme) {
                  document.documentElement.dataset.theme = originalTheme;
                } else {
                  delete document.documentElement.dataset.theme;
                }
              }

              const copyArticleButton = document.querySelector("[data-copy-article-url]");
              const copyArticleStatus = document.querySelector("[data-copy-article-status]");
              if (!(copyArticleButton instanceof HTMLButtonElement)) {
                failures.push("article copy link button is missing");
              } else {
                copyArticleButton.click();
                await waitFor(() => copyArticleButton.textContent.trim() !== "复制链接", 1600);
                const copyFeedback = (copyArticleButton.textContent || "") + " " + (copyArticleStatus?.textContent || "");
                if (!copyFeedback.includes("已复制") && !copyFeedback.includes("复制失败")) {
                  failures.push("article copy link button did not expose feedback");
                }
              }

              const readPercent = () => Number.parseInt(percentNode.textContent || "0", 10) || 0;
              await instantScrollTo(0);
              await wait(180);
              const topPercent = readPercent();
              const topActiveLink = document.querySelector("[data-toc-target].active");
              const topActive = topActiveLink?.dataset.tocTarget || "";
              if (topPercent > 20) failures.push("reading progress starts too high");
              if (window.scrollY > 2) failures.push("article page did not settle at the top before the top progress check");
              if (tocLinks.length > 0 && topActive !== tocLinks[0].dataset.tocTarget) {
                failures.push("first toc entry is not active near the top");
              }
              if (topActiveLink?.getAttribute("aria-current") !== "location") {
                failures.push("active toc entry must mark the current reading location");
              }

              await instantScrollTo(Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
              await wait(260);
              const bottomPercent = readPercent();
              const bottomActiveLink = document.querySelector("[data-toc-target].active");
              const bottomActive = bottomActiveLink?.dataset.tocTarget || "";
              const lastToc = tocLinks[tocLinks.length - 1]?.dataset.tocTarget || "";
              if (bottomPercent <= topPercent) failures.push("reading progress did not increase after scrolling");
              if (bottomPercent < 90) failures.push("reading progress did not approach completion at the bottom");
              if (!remainingNode.textContent) failures.push("reading remaining text is empty");
              if (lastToc && bottomActive !== lastToc) failures.push("last toc entry is not active near the bottom");
              if (bottomActiveLink?.getAttribute("aria-current") !== "location") {
                failures.push("bottom toc entry must mark the current reading location");
              }

              await instantScrollTo(0);
              await wait(140);
              if (window.scrollY > 2) failures.push("article page did not return to the top before screenshot capture");
              return failures;
            })()`
          })
        : { result: { value: [] } };
    const printRuntime =
      page.pathname.startsWith("/posts/") && viewport.name === "desktop"
        ? await (async () => {
            await send("Emulation.setEmulatedMedia", { media: "print" });
            await wait(80);
            const runtime = await send("Runtime.evaluate", {
              returnByValue: true,
              expression: `(() => {
                const failures = [];
                const isHidden = (selector) => {
                  const element = document.querySelector(selector);
                  return element && getComputedStyle(element).display === "none";
                };
                if (!isHidden(".site-header")) failures.push("print stylesheet did not hide the site header");
                if (!isHidden(".article-aside")) failures.push("print stylesheet did not hide article sidebars");
                if (!isHidden(".reading-pill")) failures.push("print stylesheet did not hide reading progress");
                if (!isHidden(".comments-section")) failures.push("print stylesheet did not hide comments");
                const articleShell = document.querySelector(".article-shell");
                if (articleShell && getComputedStyle(articleShell).display !== "block") {
                  failures.push("print stylesheet did not simplify article shell layout");
                }
                return failures;
              })()`
            });
            await send("Emulation.setEmulatedMedia", { media: "screen" });
            await wait(80);
            return runtime;
          })()
        : { result: { value: [] } };
    result.result.value.runtimeFailures = [
      ...(siteRuntime.result.value || []),
      ...(searchRuntime.result.value || []),
      ...(archiveRuntime.result.value?.failures || archiveRuntime.result.value || []),
      ...(tagRuntime.result.value || []),
      ...archiveNavigationFailures,
      ...headerSearchFailures,
      ...(articleRuntime.result.value || []),
      ...(printRuntime.result.value || [])
    ];

    await mkdir(path.join(root, "screenshots"), { recursive: true });
    const screenshot = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true
    });
    await writeFile(
      path.join(root, "screenshots", `${page.name}-${viewport.name}.png`),
      screenshot.data,
      "base64"
    );
    if (page.name === "home") {
      await writeFile(path.join(root, "screenshots", `${viewport.name}.png`), screenshot.data, "base64");
    }

    await client.close();
    await stopProcess(browser.child);
    await stopEdgeUserDataProcesses(browser.userDataDir);
    await removeWithRetry(browser.userDataDir);
    return result.result.value;
  } catch (error) {
    await stopProcess(browser.child);
    await stopEdgeUserDataProcesses(browser.userDataDir);
    await removeWithRetry(browser.userDataDir);
    throw error;
  }
}

const preview = await startPreviewIfNeeded();

try {
  const failures = [];
  const pages = await pagesToCheck();

  for (const page of pages) {
    for (const viewport of viewports) {
      const metrics = await checkViewport(viewport, page);
      const overflow =
        Math.max(metrics.document.scrollWidth, metrics.body.scrollWidth) -
        metrics.document.clientWidth;

      console.log(
        `${page.name}/${viewport.name}: viewport=${metrics.viewport.width}x${metrics.viewport.height}, document=${metrics.document.clientWidth}/${metrics.document.scrollWidth}, overflow=${overflow}`
      );

      if (metrics.mainCount !== 1) {
        failures.push(`${page.name}/${viewport.name} expected exactly one main element, found ${metrics.mainCount}`);
      }
      if (metrics.visibleBrokenImages.length > 0) {
        failures.push(`${page.name}/${viewport.name} has broken visible images: ${metrics.visibleBrokenImages.join(", ")}`);
      }
      const documentHeight = Math.max(metrics.document.scrollHeight, metrics.body.scrollHeight);
      if (metrics.footer && documentHeight <= metrics.viewport.height + 2 && metrics.footer.bottom < metrics.viewport.height - 28) {
        failures.push(`${page.name}/${viewport.name} footer is floating above the viewport bottom`);
      }
      for (const runtimeFailure of metrics.runtimeFailures || []) {
        failures.push(`${page.name}/${viewport.name} runtime check failed: ${runtimeFailure}`);
      }
      if (overflow > 1) {
        failures.push(`${page.name}/${viewport.name} has ${overflow}px horizontal overflow`);
      }

      for (const element of metrics.elements) {
        const overflowsSelf = element.scrollWidth - element.clientWidth;
        const selfOverflowIsManaged = ["hidden", "clip", "auto", "scroll"].includes(
          element.overflowX
        );
        if (overflowsSelf > 1 && !selfOverflowIsManaged) {
          failures.push(
            `${page.name}/${viewport.name} ${element.selector} overflows itself by ${overflowsSelf}px`
          );
        }
        if (element.left < -1 || element.right > metrics.viewport.width + 1) {
          failures.push(
            `${page.name}/${viewport.name} ${element.selector} is outside viewport (${element.left}-${element.right})`
          );
        }
      }
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`Failed: ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Layout checks passed.");
  }
} finally {
  await stopProcess(preview);
}
