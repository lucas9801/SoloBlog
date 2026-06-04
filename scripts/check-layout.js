import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const url = process.env.CHECK_URL || "http://localhost:4173";
const root = process.cwd();

const viewports = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 390, height: 844 }
];

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

async function waitForJson(endpoint, timeoutMs = 10000) {
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

async function launchBrowser(port, viewport) {
  const userDataDir = path.join(root, `.edge-layout-${viewport.name}`);
  await rm(userDataDir, { recursive: true, force: true });
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

async function checkViewport(viewport) {
  const port = await getFreePort();
  const browser = await launchBrowser(port, viewport);

  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const client = connect(version.webSocketDebuggerUrl);

    const { targetId } = await client.send("Target.createTarget", { url });
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
    await send("Page.navigate", { url });
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
          ".blog-sidebar"
        ];
        const metrics = {
          viewport: { width: innerWidth, height: innerHeight },
          document: {
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth
          },
          body: {
            clientWidth: document.body.clientWidth,
            scrollWidth: document.body.scrollWidth
          },
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
      path.join(root, "screenshots", `${viewport.name}.png`),
      screenshot.data,
      "base64"
    );

    await client.close();
    browser.child.kill();
    await wait(250);
    await rm(browser.userDataDir, { recursive: true, force: true });
    return result.result.value;
  } catch (error) {
    browser.child.kill();
    await wait(250);
    await rm(browser.userDataDir, { recursive: true, force: true });
    throw error;
  }
}

const failures = [];

for (const viewport of viewports) {
  const metrics = await checkViewport(viewport);
  const overflow =
    Math.max(metrics.document.scrollWidth, metrics.body.scrollWidth) -
    metrics.document.clientWidth;

  console.log(
    `${viewport.name}: viewport=${metrics.viewport.width}x${metrics.viewport.height}, document=${metrics.document.clientWidth}/${metrics.document.scrollWidth}, overflow=${overflow}`
  );

  if (overflow > 1) {
    failures.push(`${viewport.name} has ${overflow}px horizontal overflow`);
  }

  for (const element of metrics.elements) {
    const overflowsSelf = element.scrollWidth - element.clientWidth;
    const selfOverflowIsManaged = ["hidden", "clip", "auto", "scroll"].includes(
      element.overflowX
    );
    if (overflowsSelf > 1 && !selfOverflowIsManaged) {
      failures.push(
        `${viewport.name} ${element.selector} overflows itself by ${overflowsSelf}px`
      );
    }
    if (element.left < -1 || element.right > metrics.viewport.width + 1) {
      failures.push(
        `${viewport.name} ${element.selector} is outside viewport (${element.left}-${element.right})`
      );
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
