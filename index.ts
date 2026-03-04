import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { StatusCollector } from "./src/collector.js";
import { MonitorServer } from "./src/server.js";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let server: MonitorServer | null = null;

function getPluginConfig(api: OpenClawPluginApi): Record<string, unknown> {
  try {
    return (api.config?.plugins?.entries?.["pokemon-claw-monitor"]?.config as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

const plugin = {
  id: "pokemon-claw-monitor",
  name: "Pokemon Claw Monitor",
  description: "Real-time Pokemon-themed monitoring dashboard for OpenClaw agents",
  configSchema: {
    type: "object" as const,
    properties: {
      port: { type: "number" as const, description: "Dashboard HTTP port (default 3060)" },
      pollInterval: { type: "number" as const, description: "Status poll interval in ms (default 3000)" },
    },
  },
  register(api: OpenClawPluginApi) {
    const cfg = getPluginConfig(api);
    const port = typeof cfg.port === "number" ? cfg.port : 3060;
    const pollInterval = typeof cfg.pollInterval === "number" ? cfg.pollInterval : 3000;

    const stateDir = join(homedir(), ".openclaw");

    const agentConfigs = (api.config?.agents?.list ?? []).map((a: any) => ({
      id: a.id,
      name: a.name ?? a.id,
      workspace: a.workspace ?? "",
      agentDir: a.agentDir ?? "",
      subagents: a.subagents,
    }));

    const collector = new StatusCollector(stateDir, agentConfigs);
    const assetsDir = join(__dirname, "assets");

    const pokemon = (typeof cfg.pokemon === "object" && cfg.pokemon !== null)
      ? cfg.pokemon as Record<string, number>
      : {};

    const clientDir = join(__dirname, "dist", "client");

    server = new MonitorServer({ port, pollInterval, collector, assetsDir, clientDir, pokemon });
    server.start().catch((err: unknown) => {
      console.error("[pokemon-claw-monitor] Failed to start monitor server:", err);
    });
  },
};

export default plugin;
