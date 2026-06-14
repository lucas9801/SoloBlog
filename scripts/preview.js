import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd(), "dist");
const requestedPort = Number.parseInt(process.env.PORT || "4173", 10);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"]
]);

async function loadRedirects() {
  const source = await readFile(path.join(root, "_redirects"), "utf8").catch(() => "");
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [from, to, status = "302"] = line.split(/\s+/);
      return {
        from,
        to,
        status: Number.parseInt(status, 10) || 302
      };
    })
    .filter((redirect) => redirect.from?.startsWith("/") && redirect.to);
}

function redirectLocation(target, requestUrl) {
  const location = new URL(target, "http://localhost");
  if (!location.search && requestUrl.search) location.search = requestUrl.search;
  return location.origin === "http://localhost"
    ? `${location.pathname}${location.search}${location.hash}`
    : location.toString();
}

function isInsideRoot(filePath) {
  const relative = path.relative(root, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolveRequestPath(pathname) {
  const cleanPath = decodeURIComponent(pathname).replace(/^\/+/, "");
  let target = path.resolve(root, cleanPath || "index.html");

  if (!isInsideRoot(target)) return { status: 403 };

  let info = await stat(target);
  if (info.isDirectory()) {
    target = path.join(target, "index.html");
    if (!isInsideRoot(target)) return { status: 403 };
    info = await stat(target);
  }

  if (!info.isFile()) return { status: 404 };
  return { status: 200, filePath: target, size: info.size };
}

async function resolveNotFoundPage() {
  const filePath = path.join(root, "404.html");
  try {
    const info = await stat(filePath);
    return info.isFile() ? { filePath, size: info.size } : null;
  } catch {
    return null;
  }
}

function sendFile(request, response, filePath, size, status = 200) {
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(status, {
    "Content-Type": contentTypes.get(extension) || "application/octet-stream",
    "Content-Length": size,
    "Cache-Control": "no-store"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath)
    .on("error", () => response.destroy())
    .pipe(response);
}

function sendRedirect(request, response, location, status) {
  response.writeHead(status, {
    "Location": location,
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  response.end(`Redirecting to ${location}`);
}

const redirects = await loadRedirects();

const server = createServer(async (request, response) => {
  try {
    if (!["GET", "HEAD"].includes(request.method || "GET")) {
      response.writeHead(405, {
        "Allow": "GET, HEAD",
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end("Method not allowed");
      return;
    }

    const url = new URL(request.url || "/", "http://localhost");
    const redirect = redirects.find((item) => item.from === url.pathname);
    if (redirect) {
      sendRedirect(request, response, redirectLocation(redirect.to, url), redirect.status);
      return;
    }

    const resolved = await resolveRequestPath(url.pathname);
    if (resolved.status === 403) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }
    if (resolved.status !== 200) {
      const notFound = await resolveNotFoundPage();
      if (notFound) {
        sendFile(request, response, notFound.filePath, notFound.size, 404);
      } else {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
      }
      return;
    }
    sendFile(request, response, resolved.filePath, resolved.size);
  } catch {
    const notFound = await resolveNotFoundPage();
    if (notFound) {
      sendFile(request, response, notFound.filePath, notFound.size, 404);
    } else {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  }
});

server.listen(requestedPort, () => {
  console.log(`Preview server running at http://localhost:${requestedPort}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
