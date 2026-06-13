import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const requestedUrl = process.env.CHECK_URL || "http://localhost:4173";
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
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "page"
  );
}

async function defaultPaths() {
  const paths = ["/", "/archive/", "/tags/", "/series/", "/search/", "/404.html"];

  const searchIndex = await readFile(path.join(root, "dist", "search-index.json"), "utf8")
    .then(JSON.parse)
    .catch(() => []);
  const firstPost = Array.isArray(searchIndex) ? searchIndex.find((post) => post?.url)?.url : "";
  if (firstPost) paths.splice(1, 0, firstPost);

  return [...new Set(paths)];
}

async function pagesToCheck() {
  const baseUrl = normalizedBaseUrl(requestedUrl);
  const paths = process.env.CHECK_PATHS
    ? process.env.CHECK_PATHS.split(",").map((item) => item.trim()).filter(Boolean)
    : await defaultPaths();

  return paths.map((pathname) => ({
    name: pageName(pathname),
    pathname,
    url: new URL(pathname, baseUrl).toString()
  }));
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
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, wait(1500)]);
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
          ".post-grid",
          ".home-post-grid",
          ".blog-sidebar",
          ".article-index-page",
          ".article-index-grid",
          ".archive-filters",
          ".pagination",
          ".tag-matrix-page",
          ".tag-matrix",
          ".series-page",
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
            scrollWidth: document.documentElement.scrollWidth
          },
          body: {
            clientWidth: document.body.clientWidth,
            scrollWidth: document.body.scrollWidth
          },
          mainCount: document.querySelectorAll("main").length,
          visibleBrokenImages,
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
    await removeWithRetry(browser.userDataDir);
    return result.result.value;
  } catch (error) {
    await stopProcess(browser.child);
    await removeWithRetry(browser.userDataDir);
    throw error;
  }
}

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
  process.exit(1);
}

console.log("Layout checks passed.");
