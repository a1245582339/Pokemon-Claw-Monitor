import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { StatusCollector, type MonitorSnapshot } from "./collector.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface PokemonMapping {
  [agentId: string]: number;
}

interface MonitorServerOptions {
  port: number;
  pollInterval: number;
  collector: StatusCollector;
  assetsDir: string;
  clientDir: string;
  pokemon: PokemonMapping;
}

export class MonitorServer {
  private server: ReturnType<typeof createServer> | null = null;
  private sseClients = new Set<ServerResponse>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshot: MonitorSnapshot | null = null;
  private opts: MonitorServerOptions;

  constructor(opts: MonitorServerOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handleRequest(req, res));

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.opts.port, "0.0.0.0", () => {
        console.log(`[pokemon-claw-monitor] Dashboard running at http://localhost:${this.opts.port}`);
        resolve();
      });
      this.server!.on("error", reject);
    });

    await this.poll();
    this.pollTimer = setInterval(() => this.poll(), this.opts.pollInterval);
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    for (const client of this.sseClients) {
      try { client.end(); } catch {}
    }
    this.sseClients.clear();
    this.server?.close();
    this.server = null;
  }

  private async poll() {
    try {
      const snapshot = await this.opts.collector.collect();
      this.lastSnapshot = snapshot;
      this.broadcast(snapshot);
    } catch (err) {
      console.error("[pokemon-claw-monitor] Poll error:", err);
    }
  }

  private broadcast(snapshot: MonitorSnapshot) {
    const data = `data: ${JSON.stringify(snapshot)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(data);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/api/events") {
      return this.handleSSE(req, res);
    }

    if (url.pathname === "/api/config") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ pokemon: this.opts.pokemon }));
      return;
    }

    if (url.pathname === "/api/snapshot") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(this.lastSnapshot ?? { timestamp: 0, agents: [], subagentRuns: [] }));
      return;
    }

    if (url.pathname.startsWith("/assets/")) {
      return this.handleStaticFile(url.pathname, this.opts.assetsDir, "/assets/", res);
    }

    return this.handleClient(url.pathname, res);
  }

  private async handleClient(pathname: string, res: ServerResponse) {
    const clientDir = this.opts.clientDir;

    if (pathname !== "/" && !pathname.startsWith("/api/")) {
      const filePath = join(clientDir, ...pathname.split("/").filter(Boolean));
      if (!filePath.includes("..")) {
        try {
          const s = await stat(filePath);
          if (s.isFile()) {
            return this.serveFile(filePath, res);
          }
        } catch {}
      }
    }

    const indexPath = join(clientDir, "index.html");
    return this.serveFile(indexPath, res);
  }

  private async serveFile(filePath: string, res: ServerResponse) {
    try {
      const data = await readFile(filePath);
      const ext = extname(filePath);
      const mime = MIME_TYPES[ext] || "application/octet-stream";
      const cacheControl = ext === ".html"
        ? "no-cache"
        : "public, max-age=31536000, immutable";
      res.writeHead(200, {
        "Content-Type": mime + (mime.startsWith("text/") ? "; charset=utf-8" : ""),
        "Content-Length": data.length,
        "Cache-Control": cacheControl,
      });
      res.end(data);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  }

  private async handleStaticFile(pathname: string, baseDir: string, prefix: string, res: ServerResponse) {
    const filename = pathname.replace(prefix, "");
    if (filename.includes("..")) {
      res.writeHead(403); res.end("Forbidden"); return;
    }
    const filePath = join(baseDir, ...filename.split("/"));
    const ext = extname(filename);
    const mime = MIME_TYPES[ext];
    if (!mime) { res.writeHead(404); res.end("Not Found"); return; }

    try {
      const data = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=86400",
        "Content-Length": data.length,
      });
      res.end(data);
    } catch {
      res.writeHead(404); res.end("Not Found");
    }
  }

  private handleSSE(_req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    if (this.lastSnapshot) {
      res.write(`data: ${JSON.stringify(this.lastSnapshot)}\n\n`);
    }

    this.sseClients.add(res);

    res.on("close", () => {
      this.sseClients.delete(res);
    });
  }
}
