import type { FloorConfig, Point } from "./types";
import { BALL_CELLS } from "./collision";

export interface MapConfigJSON {
  cellSize: number;
  spriteScale: number;
  ballScale: number;
  walkSpeed: number;
  playerSpeed: number;
  floors: { key: string; src: string; width: number; height: number }[];
  floorBoundaryRow: number;
  collisionMap: string[];
  playerSpawn: { col: number; row: number };
}

let CELL = 32;

export let MAP_SCALE = 1;
export let SPRITE_SCALE = 2;
export let WALK_SPEED = 120;
export let BALL_SCALE = 2;
export let PLAYER_SPEED = 160;

export let WORLD_W = 0;
export let WORLD_H = 0;

export let FLOOR_CONFIG: Record<number, FloorConfig> = {};
export let PLAYER_SPAWN: Point = { x: 0, y: 0 };

export function initMapConfig(raw: MapConfigJSON) {
  CELL = raw.cellSize;
  SPRITE_SCALE = raw.spriteScale;
  BALL_SCALE = raw.ballScale;
  WALK_SPEED = raw.walkSpeed;
  PLAYER_SPEED = raw.playerSpeed;

  let yOffset = 0;
  FLOOR_CONFIG = {};
  raw.floors.forEach((f, i) => {
    FLOOR_CONFIG[raw.floors.length - i] = {
      key: f.key,
      src: f.src,
      width: f.width,
      height: f.height,
      yOffset,
    };
    yOffset += f.height;
  });

  WORLD_W = raw.floors[0]?.width ?? 0;
  WORLD_H = yOffset;

  PLAYER_SPAWN = {
    x: raw.playerSpawn.col * CELL + CELL / 2,
    y: raw.playerSpawn.row * CELL + CELL,
  };
}

export function getBallPos(index: number): Point {
  const cell = BALL_CELLS[index];
  if (!cell) return { x: 16, y: 16 };
  return {
    x: cell.col * CELL + CELL / 2,
    y: cell.row * CELL + CELL / 2,
  };
}
