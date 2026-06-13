import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
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

function sendFile(request, response, filePath, size) {
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
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
    const resolved = await resolveRequestPath(url.pathname);
    if (resolved.status === 403) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }
    if (resolved.status !== 200) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    sendFile(request, response, resolved.filePath, resolved.size);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
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
