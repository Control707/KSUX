import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync, ChildProcess } from "node:child_process";
import net from "node:net";

function checkPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(800);
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => {
      sock.destroy();
      resolve(false);
    });
    sock.once("timeout", () => {
      sock.destroy();
      resolve(false);
    });
    sock.connect(port, host);
  });
}

function waitForConvexFunctionsReady(
  proc: ChildProcess,
  timeoutMs = 60_000
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);

    const onChunk = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      process.stderr.write(text);
      if (text.includes("Convex functions ready")) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(true);
        }
      }
    };

    proc.stdout?.on("data", onChunk);
    proc.stderr?.on("data", onChunk);
    proc.once("exit", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    });
  });
}

async function main() {
  const localBrowsersDir = path.join(process.cwd(), ".playwright-browsers");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CONVEX_AGENT_MODE: "anonymous",
    ...(fs.existsSync(localBrowsersDir) && !process.env.PLAYWRIGHT_BROWSERS_PATH
      ? { PLAYWRIGHT_BROWSERS_PATH: localBrowsersDir }
      : {}),
  };

  let convexDaemon: ChildProcess | null = null;
  const alreadyListening = await checkPortOpen(3210);

  if (!alreadyListening) {
    console.log("[e2e] Starting local Convex dev backend & pushing functions...");
    convexDaemon = spawn("npx", ["convex", "dev", "--typecheck=disable"], {
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const ready = await waitForConvexFunctionsReady(convexDaemon, 60_000);
    if (!ready) {
      if (convexDaemon.pid) {
        try {
          process.kill(-convexDaemon.pid, "SIGTERM");
        } catch {
          convexDaemon.kill("SIGTERM");
        }
      }
      console.error("[e2e] Convex functions failed to push within timeout.");
      process.exit(1);
    }
  }

  const cleanupDaemon = () => {
    if (convexDaemon?.pid) {
      try {
        process.kill(-convexDaemon.pid, "SIGTERM");
      } catch {
        convexDaemon.kill("SIGTERM");
      }
    }
  };

  console.log("[e2e] Running idempotent seed:bootstrapKsu...");
  const seedRes = spawnSync("npx", ["convex", "run", "seed:bootstrapKsu"], {
    env,
    stdio: "inherit",
  });
  if (seedRes.status !== 0) {
    cleanupDaemon();
    process.exit(seedRes.status ?? 1);
  }

  console.log(
    "[e2e] Running Playwright 2-tab live WebSocket + offline suite..."
  );
  const pwArgs = ["playwright", "test", ...process.argv.slice(2)];
  const pwRes = spawnSync("npx", pwArgs, {
    env,
    stdio: "inherit",
  });

  cleanupDaemon();
  process.exit(pwRes.status ?? 1);
}

void main();
