import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const node = process.execPath;

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

async function waitForPreview(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Preview server is still starting.
    }
    await wait(150);
  }
  throw new Error(`Timed out waiting for preview server at ${url}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, wait(1500)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function request(baseUrl, pathname, options) {
  return fetch(new URL(pathname, baseUrl), options);
}

function rawHttpRequest(port, target) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
    });
    let response = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.on("error", reject);
    socket.on("end", () => {
      const [head, ...bodyParts] = response.split("\r\n\r\n");
      const status = Number.parseInt(head.match(/^HTTP\/\d(?:\.\d)?\s+(\d+)/)?.[1] || "0", 10);
      resolve({ status, body: bodyParts.join("\r\n\r\n") });
    });
  });
}

await access(path.join(root, "dist", "index.html")).catch(() => {
  throw new Error("dist/index.html does not exist. Run npm run build first.");
});

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}/`;
const outsideFile = path.join(root, "dist-secret.txt");
const outsideBody = "preview traversal should not read this";
await writeFile(outsideFile, outsideBody, "utf8");

const preview = spawn(node, ["scripts/preview.js"], {
  env: {
    ...process.env,
    PORT: String(port)
  },
  stdio: ["ignore", "pipe", "inherit"]
});
preview.stdout.on("data", (chunk) => process.stdout.write(chunk));

try {
  await waitForPreview(baseUrl);

  let response = await request(baseUrl, "/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(await response.text(), /<!doctype html>/i);

  response = await request(baseUrl, "/archive/");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /全部文章|文章索引/);

  response = await request(baseUrl, "/rss.xml");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/xml/);
  assert.match(await response.text(), /<rss\b/);

  response = await request(baseUrl, "/feed.json");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  assert.equal((await response.json()).version, "https://jsonfeed.org/version/1.1");

  response = await request(baseUrl, "/sitemap.xml");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/xml/);
  assert.match(await response.text(), /<urlset\b/);

  response = await request(baseUrl, "/robots.txt");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/plain/);
  assert.match(await response.text(), /Sitemap: https:\/\/blog\.solus\.games\/sitemap\.xml/);

  response = await request(baseUrl, "/rss", { redirect: "manual" });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/rss.xml");

  response = await request(baseUrl, "/feed.xml", { redirect: "manual" });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/rss.xml");

  response = await request(baseUrl, "/", { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");

  response = await request(baseUrl, "/missing-page");
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(await response.text(), /noindex,follow/);

  let rawResponse = await rawHttpRequest(port, "/%2e%2e%2fdist-secret.txt");
  assert.equal(rawResponse.status, 403);
  assert.notEqual(rawResponse.body, outsideBody);

  rawResponse = await rawHttpRequest(port, "/%2e%2e%5cdist-secret.txt");
  assert.equal(rawResponse.status, 403);
  assert.notEqual(rawResponse.body, outsideBody);
} finally {
  await stopProcess(preview);
  await rm(outsideFile, { force: true });
}

console.log("Preview server tests passed.");
