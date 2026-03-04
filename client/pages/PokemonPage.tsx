import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import Phaser from "phaser";
import { BootScene } from "../game/BootScene";
import { OfficeScene } from "../game/OfficeScene";
import { gameCallbacks, type TooltipData } from "../game/events";
import "../styles/pokemon.css";

export function PokemonPage() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [stats, setStats] = useState({ workingCount: 0, totalCount: 0 });
  const [connected, setConnected] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const tooltipHtmlRef = useRef("");

  const handleTooltip = useCallback((data: TooltipData | null) => {
    if (!data) {
      setTooltip(null);
      return;
    }
    if (data.html) tooltipHtmlRef.current = data.html;
    setTooltip({ html: tooltipHtmlRef.current, x: data.x, y: data.y });
  }, []);

  useEffect(() => {
    gameCallbacks.onStats = setStats;
    gameCallbacks.onConnected = () => setConnected(true);
    gameCallbacks.onDisconnected = () => setConnected(false);
    gameCallbacks.onTooltip = handleTooltip;

    let game: Phaser.Game | null = null;
    let cancelled = false;

    fetch("/assets/map-config.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load map config: ${r.status}`);
        return r.json();
      })
      .then((cfg) => {
        if (cancelled) return;
        const floors: { width: number; height: number }[] = cfg.floors || [];
        const w = floors[0]?.width ?? 1152;
        const h = floors.reduce((sum: number, f: { height: number }) => sum + f.height, 0) || 1408;

        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: "game-container",
          width: w,
          height: h,
          pixelArt: true,
          backgroundColor: "#000000",
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          scene: [BootScene, OfficeScene],
        });

        gameRef.current = game;
      })
      .catch((err) => console.error("[PokemonPage] Init failed:", err));

    return () => {
      cancelled = true;
      game?.destroy(true);
      gameRef.current = null;
      gameCallbacks.onStats = undefined;
      gameCallbacks.onConnected = undefined;
      gameCallbacks.onDisconnected = undefined;
      gameCallbacks.onTooltip = undefined;
    };
  }, [handleTooltip]);

  return (
    <div className="pokemon-page">
      <div className="topbar">
        <div className="topbar-left">
          <Link className="back-btn" to="/">&larr; Dashboard</Link>
          <span className="topbar-title">Pokemon Office</span>
        </div>
        <div className="topbar-right">
          <div className="stats-pill">Working: <span className="count green">{stats.workingCount}</span></div>
          <div className="stats-pill">Total: <span className="count">{stats.totalCount}</span></div>
          <div className={`conn-dot${connected ? "" : " off"}`} />
        </div>
      </div>
      <div id="game-container" />
      {tooltip && (
        <div
          className="tooltip show"
          style={{ left: tooltip.x, top: tooltip.y }}
          dangerouslySetInnerHTML={{ __html: tooltip.html }}
        />
      )}
    </div>
  );
}
