import Phaser from "phaser";

export interface Point {
  x: number;
  y: number;
}

export interface FloorConfig {
  key: string;
  src: string;
  width: number;
  height: number;
  yOffset: number;
}

export type SpriteState =
  | "idle_outside"
  | "working"
  | "walking_to_ball";

export interface PokemonSprite extends Phaser.GameObjects.Sprite {
  pokeId: number;
  agentId: string;
  state: SpriteState;
  walkPath: Point[];
  walkIndex: number;
  assignedDesk: { col: number; row: number; facing: string } | null;
}
