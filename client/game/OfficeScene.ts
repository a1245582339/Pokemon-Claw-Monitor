import Phaser from "phaser";
import {
  MAP_SCALE, SPRITE_SCALE, WALK_SPEED, BALL_SCALE,
  FLOOR_CONFIG,
  getBallPos, PLAYER_SPAWN, PLAYER_SPEED,
} from "./config";
import type { PokemonSprite, Point } from "./types";
import { fetchConfig, connectSSE, type MonitorSnapshot, type PokemonMapping } from "../lib/api";
import { escHtml, formatTokens } from "../lib/utils";
import { COLLISION_MAP, STAIR_MAP, DESK_CELLS, findPath, simplifyPath, type DeskCell } from "./collision";
import { gameCallbacks } from "./events";

let lastAgentStates: Record<string, MonitorSnapshot["agents"][number]> = {};
const AGENT_POKEMON: PokemonMapping = {};
const AGENT_NAMES: Record<string, string> = {};

export class OfficeScene extends Phaser.Scene {
  private pokemonSprites: Record<string, PokemonSprite> = {};
  private nameLabels: Record<string, Phaser.GameObjects.Text> = {};
  private statusLabels: Record<string, Phaser.GameObjects.Text> = {};
  private ballSprites: Record<string, Phaser.GameObjects.Image> = {};
  private ballLabels: Record<string, Phaser.GameObjects.Text> = {};
  private configLoaded = false;
  private disposeSSE: (() => void) | null = null;

  private occupiedDesks: Map<string, DeskCell> = new Map();

  private player!: Phaser.GameObjects.Sprite;
  private playerDir: "up" | "down" | "left" | "right" = "down";
  private playerMoving = false;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super("OfficeScene");
  }

  create() {
    for (const [, cfg] of Object.entries(FLOOR_CONFIG)) {
      this.add.image(0, cfg.yOffset, cfg.key).setOrigin(0, 0).setScale(MAP_SCALE);
    }

    this.cameras.main.setBackgroundColor("#000000");

    this.player = this.add.sprite(PLAYER_SPAWN.x, PLAYER_SPAWN.y, "player_1_3");
    this.player.setScale(SPRITE_SCALE);
    this.player.setOrigin(0.5, 1);
    this.player.setDepth(9000);
    this.player.play("player_idle_down");

    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.connectSSE();
  }

  update() {
    if (this.playerMoving) return;

    const cell = 32;
    let dx = 0, dy = 0;
    let dir: "up" | "down" | "left" | "right" | null = null;

    if (this.wasd.W.isDown) { dy = -cell; dir = "up"; }
    else if (this.wasd.S.isDown) { dy = cell; dir = "down"; }
    else if (this.wasd.A.isDown) { dx = -cell; dir = "left"; }
    else if (this.wasd.D.isDown) { dx = cell; dir = "right"; }

    if (!dir) {
      const curAnim = this.player.anims.currentAnim;
      if (curAnim && curAnim.key.includes("walk")) {
        this.player.play(`player_idle_${this.playerDir}`);
      }
      return;
    }

    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    if (!this.isWalkable(nx, ny)) {
      if (this.playerDir !== dir) {
        this.playerDir = dir;
        this.player.play(`player_idle_${dir}`);
      }
      return;
    }

    const dirChanged = this.playerDir !== dir;
    this.playerDir = dir;
    this.playerMoving = true;

    const walkKey = `player_walk_${dir}`;
    if (dirChanged || this.player.anims.currentAnim?.key !== walkKey) {
      this.player.play(walkKey);
    }

    const dist = Math.sqrt(dx * dx + dy * dy);
    const duration = (dist / PLAYER_SPEED) * 1000;

    this.tweens.add({
      targets: this.player,
      x: nx,
      y: ny,
      duration,
      ease: "Linear",
      onComplete: () => {
        this.playerMoving = false;
        this.checkStairs();
        if (!this.wasd.W.isDown && !this.wasd.A.isDown && !this.wasd.S.isDown && !this.wasd.D.isDown) {
          this.player.play(`player_idle_${this.playerDir}`);
        }
      },
    });
  }

  private checkStairs() {
    const col = Math.floor(this.player.x / 32);
    const row = Math.floor((this.player.y - 1) / 32);
    const target = STAIR_MAP[`${col},${row}`];
    if (target) {
      this.player.x = target.col * 32 + 16;
      this.player.y = target.row * 32 + 32;
    }
  }

  private isWalkable(x: number, footY: number): boolean {
    const col = Math.floor(x / 32);
    const row = Math.floor((footY - 1) / 32);
    if (row < 0 || row >= COLLISION_MAP.length || col < 0 || col >= (COLLISION_MAP[0]?.length ?? 0)) {
      return false;
    }
    if (COLLISION_MAP[row][col] !== 1) return false;
    for (const desk of this.occupiedDesks.values()) {
      if (desk.col === col && desk.row === row) return false;
    }
    return true;
  }

  destroy() {
    this.disposeSSE?.();
  }

  // --- Desk assignment ---

  private allocateDesk(agentId: string): DeskCell | null {
    const usedKeys = new Set<string>();
    for (const desk of this.occupiedDesks.values()) {
      usedKeys.add(`${desk.col},${desk.row}`);
    }
    const available = DESK_CELLS.filter(
      (d) => !usedKeys.has(`${d.col},${d.row}`),
    );
    if (available.length === 0) return null;
    const minFloor = Math.min(...available.map((d) => d.floorIndex));
    const pool = available.filter((d) => d.floorIndex === minFloor);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.occupiedDesks.set(agentId, pick);
    return pick;
  }

  private releaseDesk(agentId: string) {
    this.occupiedDesks.delete(agentId);
  }

  private cellToPixel(col: number, row: number): Point {
    return { x: col * 32 + 16, y: row * 32 + 32 };
  }

  // --- Pokeball management ---

  private initBalls() {
    if (Object.keys(this.ballSprites).length > 0) return;

    const agentIds = Object.keys(AGENT_POKEMON);
    agentIds.forEach((agentId, idx) => {
      const pos = getBallPos(idx);

      const ball = this.add.image(pos.x, pos.y, "ball").setScale(BALL_SCALE).setDepth(201);
      ball.setInteractive({ useHandCursor: true });

      const label = this.add.text(pos.x, pos.y + 24, AGENT_NAMES[agentId] || agentId, {
        fontSize: "12px", fontFamily: "monospace", fontStyle: "bold",
        color: "#ffffff", stroke: "#000000", strokeThickness: 2,
        align: "center",
      }).setOrigin(0.5, 0).setDepth(202).setVisible(false);

      ball.on("pointerover", () => label.setVisible(true));
      ball.on("pointerout", () => label.setVisible(false));

      this.ballSprites[agentId] = ball;
      this.ballLabels[agentId] = label;
    });
  }

  private getBallPosForAgent(agentId: string): Point {
    const idx = Object.keys(AGENT_POKEMON).indexOf(agentId);
    if (idx === -1) return { x: 16, y: 16 };
    return getBallPos(idx);
  }

  // --- Sprite creation ---

  private getOrCreateSprite(agentId: string, pokeId: number): PokemonSprite | null {
    if (this.pokemonSprites[agentId]) return this.pokemonSprites[agentId];

    const ballPos = this.getBallPosForAgent(agentId);
    const sprite = this.add.sprite(ballPos.x, ballPos.y, `poke_${pokeId}_3`) as PokemonSprite;
    sprite.setScale(SPRITE_SCALE);
    sprite.setOrigin(0.5, 1);
    sprite.setDepth(ballPos.y);
    sprite.setVisible(false);

    sprite.pokeId = pokeId;
    sprite.agentId = agentId;
    sprite.state = "idle_outside";
    sprite.walkPath = [];
    sprite.walkIndex = 0;
    sprite.assignedDesk = null;

    const nameLabel = this.add.text(0, 0, AGENT_NAMES[agentId] || agentId, {
      fontSize: "14px", fontFamily: "monospace", fontStyle: "bold",
      color: "#ffffff", stroke: "#000000", strokeThickness: 2,
      align: "center",
    }).setOrigin(0.5, 0).setVisible(false).setDepth(9999);

    const statusLabel = this.add.text(0, 0, "", {
      fontSize: "11px", fontFamily: "sans-serif", fontStyle: "bold",
      color: "#000000",
      backgroundColor: "#22c55e",
      padding: { x: 3, y: 1 },
      align: "center",
    }).setOrigin(0.5, 0).setVisible(false).setDepth(9999);

    sprite.setInteractive({ pixelPerfect: false, useHandCursor: true });
    sprite.on("pointerover", (pointer: Phaser.Input.Pointer) => {
      const agent = lastAgentStates[agentId];
      if (!agent) return;
      const html =
        `<div class="tooltip-name">${escHtml(agent.name || agentId)}</div>` +
        `<div class="tooltip-row"><span>Status</span><span class="v" style="color:${agent.isWorking ? "var(--green)" : "var(--text-muted)"}">${agent.isWorking ? "Working" : "Idle"}</span></div>` +
        `<div class="tooltip-row"><span>Sessions</span><span class="v">${agent.activeSessions?.length || 0} / ${agent.totalSessions || 0}</span></div>` +
        `<div class="tooltip-row"><span>Tokens</span><span class="v">${formatTokens(agent.totalTokensUsed || 0)}</span></div>`;
      const x = Math.min(pointer.event.clientX + 12, window.innerWidth - 200);
      const y = Math.min(pointer.event.clientY + 12, window.innerHeight - 120);
      gameCallbacks.onTooltip?.({ html, x, y });
    });
    sprite.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const x = Math.min(pointer.event.clientX + 12, window.innerWidth - 200);
      const y = Math.min(pointer.event.clientY + 12, window.innerHeight - 120);
      gameCallbacks.onTooltip?.({ html: "", x, y });
    });
    sprite.on("pointerout", () => {
      gameCallbacks.onTooltip?.(null);
    });

    this.pokemonSprites[agentId] = sprite;
    this.nameLabels[agentId] = nameLabel;
    this.statusLabels[agentId] = statusLabel;

    return sprite;
  }

  // --- Agent lifecycle ---

  private agentActivated(agentId: string, pokeId: number) {
    const sprite = this.getOrCreateSprite(agentId, pokeId);
    if (!sprite) return;
    if (sprite.state === "working") return;

    this.tweens.killTweensOf(sprite);

    const desk = this.allocateDesk(agentId);
    if (!desk) return;

    if (this.ballSprites[agentId]) {
      this.ballSprites[agentId].setTexture("ball_open");
    }

    sprite.assignedDesk = desk;
    const pos = this.cellToPixel(desk.col, desk.row);
    sprite.x = pos.x;
    sprite.y = pos.y;
    sprite.setVisible(true);
    sprite.setAlpha(1);
    sprite.setDepth(pos.y);
    sprite.state = "working";

    sprite.play(`poke_${sprite.pokeId}_idle_${desk.facing}`);

    this.nameLabels[agentId].setVisible(true);
    this.nameLabels[agentId].setPosition(sprite.x, sprite.y + 4);

    this.statusLabels[agentId].setText("WORKING");
    this.statusLabels[agentId].setVisible(true);
    this.statusLabels[agentId].setPosition(sprite.x, sprite.y + 20);
  }

  private agentDeactivated(agentId: string) {
    const sprite = this.pokemonSprites[agentId];
    if (!sprite) return;
    if (sprite.state === "idle_outside" || sprite.state === "walking_to_ball") return;

    this.tweens.killTweensOf(sprite);
    this.tweens.killTweensOf(this.nameLabels[agentId]);

    this.statusLabels[agentId].setVisible(false);

    const desk = sprite.assignedDesk;
    const ballPos = this.getBallPosForAgent(agentId);
    const ballCol = Math.floor(ballPos.x / 32);
    const ballRow = Math.floor((ballPos.y - 1) / 32);

    if (desk) {
      const gridPath = findPath(desk.col, desk.row, ballCol, ballRow);
      if (gridPath && gridPath.length > 0) {
        const waypoints = simplifyPath(gridPath);
        sprite.state = "walking_to_ball";
        sprite.walkPath = waypoints.map((wp) => this.cellToPixel(wp.col, wp.row));
        sprite.walkIndex = -1;
        this.startNextWalkSegment(sprite);
        this.releaseDesk(agentId);
        return;
      }
    }

    this.finishReturnToBall(sprite);
  }

  private agentAlreadyWorking(agentId: string, pokeId: number) {
    this.agentActivated(agentId, pokeId);
  }

  // --- Walk segments ---

  private startNextWalkSegment(sprite: PokemonSprite) {
    const path = sprite.walkPath;
    const nextIdx = sprite.walkIndex + 1;

    if (nextIdx >= path.length) {
      this.onPathComplete(sprite);
      return;
    }

    sprite.walkIndex = nextIdx;
    const target = path[nextIdx];

    const curCol = Math.floor(sprite.x / 32);
    const curRow = Math.floor((sprite.y - 1) / 32);
    const stairDest = STAIR_MAP[`${curCol},${curRow}`];
    if (stairDest) {
      const tgtCol = Math.floor(target.x / 32);
      const tgtRow = Math.floor((target.y - 1) / 32);
      if (stairDest.col === tgtCol && stairDest.row === tgtRow) {
        sprite.setPosition(target.x, target.y);
        sprite.setDepth(sprite.y);
        this.nameLabels[sprite.agentId].setPosition(sprite.x, sprite.y + 4);
        this.startNextWalkSegment(sprite);
        return;
      }
    }

    const dx = target.x - sprite.x;
    const dy = target.y - sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const duration = (dist / WALK_SPEED) * 1000;

    const dir = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? "right" : "left")
      : (dy > 0 ? "down" : "up");

    sprite.play(`poke_${sprite.pokeId}_walk_${dir}`);
    sprite.setDepth(sprite.y);

    this.tweens.add({
      targets: sprite,
      x: target.x,
      y: target.y,
      duration: Math.max(duration, 100),
      ease: "Linear",
      onUpdate: () => {
        sprite.setDepth(sprite.y);
        this.nameLabels[sprite.agentId].setPosition(sprite.x, sprite.y + 4);
        if (this.statusLabels[sprite.agentId].visible) {
          this.statusLabels[sprite.agentId].setPosition(sprite.x, sprite.y + 20);
        }
      },
      onComplete: () => {
        this.startNextWalkSegment(sprite);
      },
    });
  }

  private onPathComplete(sprite: PokemonSprite) {
    if (sprite.state === "walking_to_ball") {
      this.finishReturnToBall(sprite);
    }
  }

  private finishReturnToBall(sprite: PokemonSprite) {
    const agentId = sprite.agentId;
    sprite.state = "idle_outside";
    sprite.assignedDesk = null;
    sprite.setVisible(false);
    this.nameLabels[agentId].setVisible(false);
    this.statusLabels[agentId].setVisible(false);
    this.releaseDesk(agentId);

    if (this.ballSprites[agentId]) {
      this.ballSprites[agentId].setTexture("ball");
    }
  }

  // --- SSE ---

  private connectSSE() {
    fetchConfig().then((cfg) => {
      if (cfg.pokemon) {
        Object.assign(AGENT_POKEMON, cfg.pokemon);
        this.initBalls();
        this.configLoaded = true;
      }
    }).catch(() => {});

    this.disposeSSE = connectSSE(
      (snapshot) => this.handleSnapshot(snapshot),
      () => gameCallbacks.onConnected?.(),
      () => gameCallbacks.onDisconnected?.(),
    );
  }

  private handleSnapshot(snapshot: MonitorSnapshot) {
    if (!this.configLoaded) return;

    const agents = snapshot.agents || [];
    const newStates: typeof lastAgentStates = {};
    let workingCount = 0;
    let totalMapped = 0;

    for (const agent of agents) {
      const pokeId = AGENT_POKEMON[agent.id];
      if (!pokeId) continue;

      if (agent.name && !AGENT_NAMES[agent.id]) {
        AGENT_NAMES[agent.id] = agent.name;
        if (this.ballLabels[agent.id]) {
          this.ballLabels[agent.id].setText(agent.name);
        }
        if (this.nameLabels[agent.id]) {
          this.nameLabels[agent.id].setText(agent.name);
        }
      }

      totalMapped++;
      newStates[agent.id] = agent;

      const prev = lastAgentStates[agent.id];
      const wasWorking = prev?.isWorking || false;
      const isWorking = agent.isWorking;

      if (isWorking) workingCount++;

      if (!prev) {
        if (isWorking) this.agentAlreadyWorking(agent.id, pokeId);
      } else {
        if (isWorking && !wasWorking) this.agentActivated(agent.id, pokeId);
        else if (!isWorking && wasWorking) this.agentDeactivated(agent.id);
      }
    }

    lastAgentStates = newStates;
    gameCallbacks.onStats?.({ workingCount, totalCount: totalMapped });
  }
}
