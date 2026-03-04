export function escHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return "--";
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  if (diff < 60000) return Math.floor(diff / 1000) + "s ago";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  return Math.floor(diff / 86400000) + "d ago";
}

export function formatTime(ts: number | null | undefined): string {
  if (!ts) return "--";
  return new Date(ts).toLocaleTimeString(undefined, { hour12: false });
}

const COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#14b8a6",
  "#6366f1", "#f43f5e", "#06b6d4", "#84cc16", "#a855f7",
];

export function agentColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}
