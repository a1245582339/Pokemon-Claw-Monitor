import Phaser from "phaser";
import { initMapConfig, FLOOR_CONFIG, type MapConfigJSON } from "./config";
import { initCollision } from "./collision";
import { fetchConfig } from "../lib/api";

const PLAYER_SPRITE_MAP: Record<string, number> = { down: 1, up: 2, left: 3, right: 4 };

export class BootScene extends Phaser.Scene {
  private pokeIds: number[] = [];

  constructor() {
    super("BootScene");
  }

  preload() {
    this.load.json("mapConfig", "/assets/map-config.json");
  }

  create() {
    const raw = this.cache.json.get("mapConfig") as MapConfigJSON;
    initMapConfig(raw);
    initCollision(raw.collisionMap, raw.floorBoundaryRow);

    for (const [, cfg] of Object.entries(FLOOR_CONFIG)) {
      this.load.image(cfg.key, cfg.src);
    }
    this.load.image("ball", "/assets/ball.png");
    this.load.image("ball_open", "/assets/ball-open.png");

    for (let dir = 1; dir <= 4; dir++) {
      for (let frame = 1; frame <= 3; frame++) {
        this.load.image(`player_${dir}_${frame}`, `/assets/player/${dir}-${frame}.png`);
      }
    }

    fetchConfig()
      .then((cfg) => {
        this.pokeIds = [...new Set(Object.values(cfg.pokemon || {}))];
        for (const pokeId of this.pokeIds) {
          const padId = String(pokeId).padStart(3, "0");
          for (let f = 1; f <= 8; f++) {
            this.load.image(`poke_${pokeId}_${f}`, `/assets/pokemon/${padId}/${f}.png`);
          }
        }
        this.load.once("complete", () => this.onAllLoaded());
        this.load.start();
      })
      .catch(() => {
        this.load.once("complete", () => this.onAllLoaded());
        this.load.start();
      });
  }

  private onAllLoaded() {
    for (const [dir, n] of Object.entries(PLAYER_SPRITE_MAP)) {
      const pk = (f: number) => ({ key: `player_${n}_${f}` });
      this.anims.create({ key: `player_walk_${dir}`, frames: [pk(3), pk(1), pk(3), pk(2)], frameRate: 10, repeat: -1 });
      this.anims.create({ key: `player_idle_${dir}`, frames: [pk(3)], frameRate: 1, repeat: 0 });
    }

    for (const pokeId of this.pokeIds) {
      const k = (f: number) => ({ key: `poke_${pokeId}_${f}` });

      this.anims.create({ key: `poke_${pokeId}_walk_down`,  frames: [k(3), k(4)], frameRate: 4, repeat: -1 });
      this.anims.create({ key: `poke_${pokeId}_walk_up`,    frames: [k(1), k(2)], frameRate: 4, repeat: -1 });
      this.anims.create({ key: `poke_${pokeId}_walk_left`,  frames: [k(5), k(6)], frameRate: 4, repeat: -1 });
      this.anims.create({ key: `poke_${pokeId}_walk_right`, frames: [k(7), k(8)], frameRate: 4, repeat: -1 });

      this.anims.create({ key: `poke_${pokeId}_idle_down`,  frames: [k(3)], frameRate: 1, repeat: 0 });
      this.anims.create({ key: `poke_${pokeId}_idle_up`,    frames: [k(1)], frameRate: 1, repeat: 0 });
      this.anims.create({ key: `poke_${pokeId}_idle_left`,  frames: [k(5)], frameRate: 1, repeat: 0 });
      this.anims.create({ key: `poke_${pokeId}_idle_right`, frames: [k(7)], frameRate: 1, repeat: 0 });
    }

    this.scene.start("OfficeScene");
  }
}
