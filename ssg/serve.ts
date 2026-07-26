// Dev server: builds dist/, serves it, watches sources, and live-reloads the
// browser on change (`npm run dev`).
//
// Polling rather than fs.watch: on this repo's WSL2 /mnt/c mount inotify doesn't
// fire. And `typst watch` can't run the pipeline (per-page compile + metadata
// queries + TS transpile + templating), so a change re-runs the whole build().

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { build, GENERATED } from "./build.ts";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const WATCH = ["content", "lib", "static"].map((d) => join(ROOT, d));
const IGNORE = new Set(GENERATED); // build outputs; skip so they don't self-trigger
const PORT = process.env.PORT || 4321;
const POLL_MS = 300;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

// --- live reload (Server-Sent Events) ---------------------------------------
const clients = new Set<ServerResponse>();
const RELOAD_SNIPPET =
  `<script>new EventSource("/__livereload").onmessage=()=>location.reload()</script>`;

function broadcastReload(): void {
  for (const res of clients) res.write("data: reload\n\n");
}

// --- build ------------------------------------------------------------------
// Guarded so a Typst error doesn't kill the server.
function safeBuild(): boolean {
  try {
    build();
    return true;
  } catch (e) {
    console.error("\nbuild failed:", (e as Error).message, "\n");
    return false;
  }
}

// --- source polling ---------------------------------------------------------
// Async: stat is slow on /mnt/c, so keep it off the event loop or it stalls
// serving. Stats fan out onto the libuv threadpool.
async function snapshot(): Promise<Map<string, number>> {
  const seen = new Map<string, number>();
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // dir may not exist (e.g. no static/)
    }
    await Promise.all(entries.map(async (e) => {
      if (e.name.startsWith(".")) return;
      const full = join(dir, e.name);
      if (IGNORE.has(full)) return;
      if (e.isDirectory()) await walk(full);
      else seen.set(full, (await stat(full)).mtimeMs);
    }));
  };
  await Promise.all(WATCH.map(walk));
  return seen;
}

function changed(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return true;
  for (const [path, mtime] of a) if (b.get(path) !== mtime) return true;
  return false;
}

// --- file serving -----------------------------------------------------------
async function resolveFile(pathname: string): Promise<string> {
  let file = join(DIST, pathname);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    if (!extname(file)) file = join(DIST, pathname, "index.html");
  }
  return file;
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);

  if (pathname === "/__livereload") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write("retry: 500\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  try {
    const file = await resolveFile(pathname);
    if (extname(file) === ".html") {
      // Inject the live-reload client into served HTML (not into dist/ itself).
      let html = await readFile(file, "utf8");
      html = html.includes("</body>")
        ? html.replace("</body>", `${RELOAD_SNIPPET}</body>`)
        : html + RELOAD_SNIPPET;
      res.writeHead(200, { "content-type": TYPES[".html"] });
      res.end(html);
    } else {
      const data = await readFile(file);
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] || "application/octet-stream",
      });
      res.end(data);
    }
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("404 Not Found");
  }
});

server.listen(PORT, async () => {
  safeBuild(); // synchronous, so nothing is served half-built
  console.log(`\n  http://localhost:${PORT}   (watching sources, live reload on)\n`);

  // Self-scheduling so polls never overlap.
  let prev = await snapshot();
  const tick = async (): Promise<void> => {
    const next = await snapshot();
    if (changed(prev, next)) {
      console.log("change detected, rebuilding...");
      if (safeBuild()) broadcastReload();
    }
    prev = next;
    setTimeout(tick, POLL_MS);
  };
  setTimeout(tick, POLL_MS);
});
