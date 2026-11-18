import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import net from "node:net";
import { parseEnv } from "node:util";

const require = createRequire(import.meta.url);
const convexCli = path.join(path.dirname(require.resolve("convex/package.json")), "bin/main.js");
const playwrightCli = require.resolve("@playwright/test/cli");
const backendPort = 3210;

function checkPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, "127.0.0.1");
    const finish = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(800);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

function waitForConvexFunctionsReady(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    let tail = "";
    const timer = setTimeout(() => fail(new Error("Convex did not become ready within 90 seconds")), 90_000);
    const fail = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };
    const onChunk = (chunk: Buffer) => {
      const output = chunk.toString("utf8");
      process.stderr.write(output);
      tail = (tail + output).slice(-2_000);
      if (tail.includes("Convex functions ready")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    child.once("error", fail);
    child.once("exit", (code) => fail(new Error(`Convex exited before readiness (status ${code})`)));
  });
}

function runCli(script: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

function assertLocalDeployment() {
  const settings = {
    ...Object.assign({}, ...[".env", ".env.local"].map((file) =>
      fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {}
    )),
    ...process.env,
  };
  if (settings.CONVEX_DEPLOY_KEY || settings.CONVEX_DEPLOYMENT_TOKEN ||
      settings.CONVEX_SELF_HOSTED_URL || settings.CONVEX_SELF_HOSTED_ADMIN_KEY ||
      (settings.CONVEX_DEPLOYMENT && !/^(anonymous|local):/.test(settings.CONVEX_DEPLOYMENT))) {
    throw new Error("Playwright fixture seeding requires a local Convex deployment. Run the suite with local deployment settings.");
  }
  return settings.KSUX_SERVER_SECRET;
}

function stopBackend(child: ChildProcess | undefined) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

async function main() {
  const configuredSecret = assertLocalDeployment();
  const browsersDir = path.join(process.cwd(), ".playwright-browsers");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CONVEX_AGENT_MODE: "anonymous",
    NEXT_PUBLIC_CONVEX_URL: `http://127.0.0.1:${backendPort}`,
    NEXT_PUBLIC_CONVEX_SITE_URL: `http://127.0.0.1:${backendPort + 1}`,
    KSUX_SERVER_SECRET: configuredSecret || randomBytes(32).toString("hex"),
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ??
      (fs.existsSync(browsersDir) ? browsersDir : undefined),
  };

  let backend: ChildProcess | undefined;
  try {
    if (!(await checkPortOpen(backendPort))) {
      console.log("[e2e] Starting local Convex and pushing functions");
      backend = spawn(process.execPath, [convexCli, "dev", "--typecheck=disable", "--codegen=disable"], {
        env,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      await waitForConvexFunctionsReady(backend);
    } else if (process.env.CI) {
      throw new Error("CI requires port 3210 to be free so Playwright can start its own Convex backend.");
    } else if (!configuredSecret) {
      throw new Error("Set KSUX_SERVER_SECRET for the running local backend, or stop that backend so the test runner can configure its own.");
    }

    if (backend) {
      const secretStatus = await runCli(convexCli, ["env", "set", "KSUX_SERVER_SECRET", env.KSUX_SERVER_SECRET!], env);
      if (secretStatus !== 0) return secretStatus;
    }
    console.log("[e2e] Seeding the local Judge Demo Mode fixtures");
    const seedStatus = await runCli(convexCli, ["run", "seed:bootstrapKsu", '{"includeFixtures":true}'], env);
    if (seedStatus !== 0) return seedStatus;

    console.log("[e2e] Running the two-tab and offline Playwright suite");
    return await runCli(playwrightCli, ["test", ...process.argv.slice(2)], env);
  } finally {
    stopBackend(backend);
  }
}

void main()
  .then((code) => { process.exitCode = code; })
  .catch((error: Error) => {
    console.error(`[e2e] ${error.message}`);
    process.exitCode = 1;
  });
