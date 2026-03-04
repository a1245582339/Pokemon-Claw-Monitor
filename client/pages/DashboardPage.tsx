import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  connectSSE, fetchConfig,
  type MonitorSnapshot, type AgentStatus, type SubagentRun, type PokemonMapping,
} from "../lib/api";
import { formatTokens, timeAgo, formatTime, agentColor } from "../lib/utils";
import "../styles/dashboard.css";

export function DashboardPage() {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const pokemonRef = useRef<PokemonMapping>({});

  useEffect(() => {
    fetchConfig()
      .then((cfg) => { if (cfg.pokemon) pokemonRef.current = cfg.pokemon; })
      .catch(() => {});

    const dispose = connectSSE(
      (s) => setSnapshot(s),
      () => setConnected(true),
      () => setConnected(false),
    );
    return dispose;
  }, []);

  const agents = snapshot?.agents ?? [];
  const runs = snapshot?.subagentRuns ?? [];
  const working = agents.filter((a) => a.isWorking).length;
  const active = agents.filter((a) => a.isActive).length;
  const totalSessions = agents.reduce((s, a) => s + a.activeSessions.length, 0);
  const totalTokens = agents.reduce((s, a) => s + a.totalTokensUsed, 0);
  const runningRuns = runs.filter((r) => r.status === "running").length;

  const sorted = [...agents].sort((a, b) => {
    if (a.isWorking !== b.isWorking) return a.isWorking ? -1 : 1;
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.lastActivity - a.lastActivity;
  });

  const maxTokens = Math.max(...agents.map((a) => a.totalTokensUsed), 1);

  return (
    <>
      <div className="dashboard-header">
        <div className="header-left">
          <div className="logo">OC</div>
          <h1>Agent Monitor</h1>
        </div>
        <div className="header-right">
          <Link className="pokemon-btn" to="/pokemon">&#9889; Pokemon Field</Link>
          <span className="last-update">
            {snapshot ? `Updated: ${new Date(snapshot.timestamp).toLocaleTimeString(undefined, { hour12: false })}` : "--"}
          </span>
          <div className="connection-status">
            <div className={`connection-dot${connected ? "" : " disconnected"}`} />
            <span>{connected ? "Connected" : "Reconnecting..."}</span>
          </div>
        </div>
      </div>

      <div className="stats-bar">
        <StatCard label="Total Agents" value={agents.length} className="accent" />
        <StatCard label="Working" value={working} className="green" />
        <StatCard label="Active" value={active} className="accent" />
        <StatCard label="Active Sessions" value={totalSessions} className="accent" />
        <StatCard label="Total Tokens" value={formatTokens(totalTokens)} />
        <StatCard label="Subagent Runs" value={`${runningRuns} / ${runs.length}`} />
      </div>

      <div className="main">
        <div className="section-title">Agents</div>
        <div className="agent-grid">
          {sorted.map((agent) => (
            <AgentCard key={agent.id} agent={agent} maxTokens={maxTokens} pokemon={pokemonRef.current} />
          ))}
        </div>
        <div className="section-title">Recent Subagent Runs</div>
        <SubagentRunsTable runs={runs} />
      </div>
    </>
  );
}

function StatCard({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className={`stat-value${className ? ` ${className}` : ""}`}>{value}</span>
    </div>
  );
}

function AgentCard({ agent, maxTokens, pokemon }: { agent: AgentStatus; maxTokens: number; pokemon: PokemonMapping }) {
  const pokeId = pokemon[agent.id];
  const tokenPct = maxTokens > 0 ? (agent.totalTokensUsed / maxTokens) * 100 : 0;

  let statusClass: string, statusText: string;
  if (agent.isWorking) { statusClass = "working"; statusText = "Working"; }
  else if (agent.isActive) { statusClass = "active"; statusText = "Active"; }
  else { statusClass = "idle"; statusText = "Idle"; }

  const avatarStyle: React.CSSProperties = pokeId
    ? {
        backgroundImage: `url(/assets/pokemon/${String(pokeId).padStart(3, "0")}/avatar.png)`,
        backgroundSize: "cover",
        imageRendering: "pixelated",
      }
    : { background: agentColor(agent.id) };

  return (
    <div className={`agent-card ${statusClass}`}>
      <div className="agent-header">
        <div className="agent-identity">
          <div className="agent-avatar" style={avatarStyle}>
            {!pokeId && agent.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="agent-name">{agent.name}</div>
            <div className="agent-id">{agent.id}</div>
          </div>
        </div>
        <span className={`status-badge ${statusClass}`}>
          <span className={`status-dot ${statusClass}`} />
          {statusText}
        </span>
      </div>

      <div className="agent-metrics">
        <div className="metric">
          <span className="metric-label">Sessions</span>
          <span className="metric-value">{agent.totalSessions}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Active</span>
          <span className="metric-value" style={{ color: "var(--green)" }}>{agent.activeSessions.length}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Last Activity</span>
          <span className="metric-value">{timeAgo(agent.lastActivity)}</span>
        </div>
      </div>

      <div className="metric" style={{ marginBottom: 16 }}>
        <span className="metric-label">Total Tokens: {formatTokens(agent.totalTokensUsed)}</span>
        <div className="token-bar">
          <div className="token-bar-fill" style={{ width: `${tokenPct}%` }} />
        </div>
      </div>

      {agent.activeSessions.length > 0 && (
        <div className="sessions-list">
          <div className="sessions-title">Sessions ({agent.activeSessions.length})</div>
          {agent.activeSessions.slice(0, 5).map((s, i) => {
            const name = s.displayName || s.sessionKey.split(":").pop() || "unknown";
            return (
              <div className="session-item" key={i}>
                <div className="session-name">
                  {s.isLocked && <span className="lock-badge">WORKING</span>}
                  <span className="session-channel">{s.channel}</span>
                  <span title={s.sessionKey}>{name}</span>
                </div>
                <span className="session-time">
                  {s.isLocked && s.lockSince
                    ? `since ${formatTime(new Date(s.lockSince).getTime())}`
                    : timeAgo(s.updatedAt)}
                </span>
              </div>
            );
          })}
          {agent.activeSessions.length > 5 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 10px" }}>
              +{agent.activeSessions.length - 5} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubagentRunsTable({ runs }: { runs: SubagentRun[] }) {
  if (!runs.length) {
    return <div className="empty-state"><div className="empty-state-text">No subagent runs</div></div>;
  }

  const sorted = [...runs]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 20);

  const statusClass = (s: string) => {
    if (s === "running") return "running";
    if (s === "ok") return "ok";
    if (s === "timeout") return "timeout";
    if (s === "error") return "error";
    return "ended";
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "auto" }}>
      <table className="subagent-runs-table">
        <thead>
          <tr>
            <th>Status</th><th>Task</th><th>Session</th><th>Created</th><th>Ended</th><th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.runId || i}>
              <td><span className={`run-status ${statusClass(r.status)}`}>{r.status}</span></td>
              <td className="task-text" title={r.task || ""}>{r.task || "--"}</td>
              <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.childSessionKey?.split(":").slice(0, 3).join(":") || "--"}</td>
              <td>{formatTime(r.createdAt)}</td>
              <td>{r.endedAt ? formatTime(r.endedAt) : <span style={{ color: "var(--green)" }}>running</span>}</td>
              <td>{r.endedReason || "--"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
