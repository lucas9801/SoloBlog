import { spawn } from "node:child_process";
import net from "node:net";

const node = process.execPath;

function npmCommand(args) {
  if (process.platform !== "win32") {
    return { command: "npm", args };
  }

  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", "npm", ...args]
  };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...options
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
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

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, wait(1500)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function runLayoutCheck() {
  const port = await getFreePort();
  const previewUrl = `http://127.0.0.1:${port}/`;
  const preview = spawn(node, ["scripts/preview.js"], {
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "inherit"]
  });

  preview.stdout.on("data", (chunk) => process.stdout.write(chunk));

  try {
    await waitForPreview(previewUrl);
    const checkLayout = npmCommand(["run", "check:layout"]);
    await run(checkLayout.command, checkLayout.args, {
      env: {
        ...process.env,
        CHECK_URL: previewUrl
      }
    });
  } finally {
    await stopProcess(preview);
  }
}

try {
  for (const script of ["lint", "test:lint", "test:new-post", "test:build", "test:views", "build", "test:preview", "check:output"]) {
    const command = npmCommand(["run", script]);
    await run(command.command, command.args);
  }
  await runLayoutCheck();
  console.log("All checks passed.");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
