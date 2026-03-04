export interface AgentSession {
  sessionKey: string;
  displayName?: string;
  channel: string;
  isLocked: boolean;
  lockSince?: string;
  updatedAt?: number;
  subject?: string;
}

export interface AgentStatus {
  id: string;
  name: string;
  isWorking: boolean;
  isActive: boolean;
  activeSessions: AgentSession[];
  totalSessions: number;
  totalTokensUsed: number;
  lastActivity: number;
}

export interface SubagentRun {
  runId?: string;
  status: string;
  task?: string;
  childSessionKey?: string;
  createdAt?: number;
  endedAt?: number;
  endedReason?: string;
}

export interface MonitorSnapshot {
  timestamp: number;
  agents: AgentStatus[];
  subagentRuns?: SubagentRun[];
}

export interface PokemonMapping {
  [agentId: string]: number;
}

export async function fetchConfig(): Promise<{ pokemon: PokemonMapping }> {
  const resp = await fetch("/api/config");
  if (!resp.ok) throw new Error(`fetchConfig failed: ${resp.status}`);
  return resp.json();
}

export function connectSSE(
  onSnapshot: (snapshot: MonitorSnapshot) => void,
  onConnected?: () => void,
  onDisconnected?: () => void,
): () => void {
  let es: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function connect() {
    if (disposed) return;
    es = new EventSource("/api/events");
    es.onopen = () => onConnected?.();
    es.onmessage = (e) => {
      try {
        onSnapshot(JSON.parse(e.data));
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };
    es.onerror = () => {
      onDisconnected?.();
      es?.close();
      if (!disposed && !reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, 3000);
      }
    };
  }

  connect();

  return () => {
    disposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    es?.close();
  };
}
