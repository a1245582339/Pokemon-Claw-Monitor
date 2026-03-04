import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export interface AgentSessionInfo {
  sessionId: string;
  sessionKey: string;
  displayName: string;
  channel: string;
  chatType: string;
  model: string;
  modelProvider: string;
  updatedAt: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheRead: number;
  cacheWrite: number;
  subject?: string;
  compactionCount: number;
  abortedLastRun: boolean;
  isSubagent: boolean;
  spawnedBy?: string;
  isLocked: boolean;
  lockPid?: number;
  lockSince?: string;
}

export interface AgentStatus {
  id: string;
  name: string;
  workspace: string;
  activeSessions: AgentSessionInfo[];
  totalSessions: number;
  lastActivity: number;
  isActive: boolean;
  isWorking: boolean;
  workingSessions: string[];
  totalTokensUsed: number;
}

export interface SubagentRun {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  task: string;
  status: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  endedReason?: string;
}

export interface MonitorSnapshot {
  timestamp: number;
  agents: AgentStatus[];
  subagentRuns: SubagentRun[];
}

interface AgentConfig {
  id: string;
  name: string;
  workspace: string;
  agentDir: string;
  subagents?: { allowAgents?: string[] };
}

export class StatusCollector {
  private stateDir: string;
  private agentConfigs: AgentConfig[];

  constructor(stateDir: string, agentConfigs: AgentConfig[]) {
    this.stateDir = stateDir;
    this.agentConfigs = agentConfigs;
  }

  async collect(): Promise<MonitorSnapshot> {
    const agents = await Promise.all(
      this.agentConfigs.map((cfg) => this.collectAgent(cfg))
    );
    const subagentRuns = await this.collectSubagentRuns();

    return { timestamp: Date.now(), agents, subagentRuns };
  }

  private async collectAgent(cfg: AgentConfig): Promise<AgentStatus> {
    const sessionsDir = join(this.stateDir, "agents", cfg.id, "sessions");
    const sessionsPath = join(sessionsDir, "sessions.json");
    let sessions: Record<string, any> = {};

    try {
      const raw = await readFile(sessionsPath, "utf-8");
      sessions = JSON.parse(raw);
    } catch {
      // no sessions yet
    }

    const lockedSessions = await this.scanLockFiles(sessionsDir);
    const fileMtimes = await this.scanSessionFileMtimes(sessionsDir);

    const now = Date.now();
    const recentThreshold = 5 * 60 * 1000;
    const workingFileThreshold = 30 * 1000;

    const allSessions: AgentSessionInfo[] = [];
    let lastActivity = 0;
    let totalTokensUsed = 0;
    const workingSessions: string[] = [];

    for (const [key, sess] of Object.entries(sessions)) {
      if (!sess || typeof sess !== "object") continue;
      const s = sess as any;
      const sessionId: string = s.sessionId ?? "";
      const lockInfo = lockedSessions.get(sessionId);
      const fileMtime = fileMtimes.get(sessionId) ?? 0;
      const isLocked = !!lockInfo || (fileMtime > 0 && now - fileMtime < workingFileThreshold);

      if (isLocked) workingSessions.push(key);

      const effectiveUpdatedAt = Math.max(s.updatedAt ?? 0, fileMtime);

      const info: AgentSessionInfo = {
        sessionId,
        sessionKey: key,
        displayName: s.displayName ?? key,
        channel: s.channel ?? "unknown",
        chatType: s.chatType ?? "unknown",
        model: s.model ?? "unknown",
        modelProvider: s.modelProvider ?? "unknown",
        updatedAt: effectiveUpdatedAt,
        inputTokens: s.inputTokens ?? 0,
        outputTokens: s.outputTokens ?? 0,
        totalTokens: s.totalTokens ?? 0,
        cacheRead: s.cacheRead ?? 0,
        cacheWrite: s.cacheWrite ?? 0,
        subject: s.subject,
        compactionCount: s.compactionCount ?? 0,
        abortedLastRun: s.abortedLastRun ?? false,
        isSubagent: !!s.spawnedBy,
        spawnedBy: s.spawnedBy,
        isLocked,
        lockPid: lockInfo?.pid,
        lockSince: lockInfo?.createdAt,
      };

      allSessions.push(info);
      totalTokensUsed += info.totalTokens;
      if (info.updatedAt > lastActivity) lastActivity = info.updatedAt;
    }

    const isWorking = workingSessions.length > 0;

    const activeSessions = allSessions
      .filter((s) => s.isLocked || now - s.updatedAt < recentThreshold)
      .sort((a, b) => {
        if (a.isLocked !== b.isLocked) return a.isLocked ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });

    return {
      id: cfg.id,
      name: cfg.name,
      workspace: cfg.workspace,
      activeSessions,
      totalSessions: allSessions.length,
      lastActivity,
      isActive: isWorking || activeSessions.length > 0,
      isWorking,
      workingSessions,
      totalTokensUsed,
    };
  }

  private async scanSessionFileMtimes(sessionsDir: string): Promise<Map<string, number>> {
    const mtimes = new Map<string, number>();
    try {
      const files = await readdir(sessionsDir);
      await Promise.all(
        files
          .filter((f) => f.endsWith(".jsonl") && !f.includes(".deleted."))
          .map(async (file) => {
            try {
              const st = await stat(join(sessionsDir, file));
              const sessionId = file.replace(".jsonl", "");
              mtimes.set(sessionId, st.mtimeMs);
            } catch {}
          })
      );
    } catch {}
    return mtimes;
  }

  private async scanLockFiles(sessionsDir: string): Promise<Map<string, { pid: number; createdAt: string }>> {
    const locks = new Map<string, { pid: number; createdAt: string }>();
    try {
      const files = await readdir(sessionsDir);
      await Promise.all(
        files
          .filter((f) => f.endsWith(".jsonl.lock"))
          .map(async (lockFile) => {
            try {
              const raw = await readFile(join(sessionsDir, lockFile), "utf-8");
              const data = JSON.parse(raw);
              const pid = data.pid;
              if (typeof pid === "number" && isProcessAlive(pid)) {
                const sessionId = lockFile.replace(".jsonl.lock", "");
                locks.set(sessionId, { pid, createdAt: data.createdAt ?? "" });
              }
            } catch {
              // stale or unreadable lock
            }
          })
      );
    } catch {
      // sessions dir may not exist
    }
    return locks;
  }

  private async collectSubagentRuns(): Promise<SubagentRun[]> {
    const runsPath = join(this.stateDir, "subagents", "runs.json");
    try {
      const raw = await readFile(runsPath, "utf-8");
      const data = JSON.parse(raw);
      const runs = data.runs ?? {};

      return Object.values(runs).map((r: any) => ({
        runId: r.runId ?? "",
        childSessionKey: r.childSessionKey ?? "",
        requesterSessionKey: r.requesterSessionKey ?? "",
        task: r.task ?? "",
        status: r.outcome?.status ?? (r.endedAt ? "ended" : "running"),
        createdAt: r.createdAt ?? 0,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        endedReason: r.endedReason,
      }));
    } catch {
      return [];
    }
  }
}
