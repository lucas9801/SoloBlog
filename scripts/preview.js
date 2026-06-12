import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const root = path.join(process.cwd(), "dist");
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
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"]
]);

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": contentTypes.get(extension) || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    const cleanPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const target = path.normalize(path.join(root, cleanPath || "index.html"));

    if (!target.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const info = await stat(target);
    sendFile(response, info.isDirectory() ? path.join(target, "index.html") : target);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(requestedPort, () => {
  console.log(`Preview server running at http://localhost:${requestedPort}`);
});
