# Pokemon Claw Monitor

A real-time Pokemon-themed monitoring dashboard and interactive office view for [OpenClaw](https://github.com/nicepkg/openclaw) agents.

![Dashboard](https://img.shields.io/badge/dashboard-real--time-blue)
![Pokemon Office](https://img.shields.io/badge/pokemon-office-yellow)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Dashboard** — Real-time overview of all agents: status, active sessions, token usage, and subagent runs.
- **Pokemon Office** — An interactive Phaser-based pixel-art office where each agent is represented by a Pokemon. When an agent starts working, its Pokemon appears at a desk; when it finishes, the Pokemon walks back to its Pokeball.
- **Player Character** — Control your own character with WASD to walk around the office.
- **Configurable Map** — The office map, collision, workstations, pokeball positions, and stairs are all defined in a single JSON config file.

## Installation

1. Clone or copy this extension into your OpenClaw extensions directory:

```
~/.openclaw/extensions/pokemon-claw-monitor/
```

2. Install dependencies and build the frontend:

```bash
cd ~/.openclaw/extensions/pokemon-claw-monitor
npm install
npm run build
```

3. Register the extension in your `openclaw.json`:

```jsonc
{
  "plugins": {
    "entries": {
      "pokemon-claw-monitor": {
        "package": "./extensions/pokemon-claw-monitor",
        "config": {
          "port": 3060,
          "pollInterval": 3000,
          "pokemon": {
            "my-agent-id": 25
          }
        }
      }
    }
  }
}
```

4. Restart the OpenClaw gateway. The dashboard will be available at `http://localhost:3060`.

## Configuration

All configuration is set in the `config` section of the plugin entry in `openclaw.json`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `port` | number | `3060` | HTTP port for the dashboard server |
| `pollInterval` | number | `3000` | Agent status polling interval in milliseconds |
| `pokemon` | object | `{}` | Agent-to-Pokemon mapping (see below) |

### Pokemon Mapping

The `pokemon` field maps agent IDs to Pokedex numbers (1–151). Each agent with a mapping will be represented by that Pokemon in the office view.

```json
{
  "pokemon": {
    "agent-alpha": 25,
    "agent-beta": 6,
    "agent-gamma": 150
  }
}
```

The extension includes Gen 1 sprites (001–151) in `assets/pokemon/`. Each Pokemon folder contains:

| File | Description |
|------|-------------|
| `1.png` – `8.png` | Directional walk sprites (up, down, left, right × 2 frames each) |
| `avatar.png` | Avatar icon used on the dashboard |

### Map Configuration

The office map is defined in `assets/map-config.json`. You can customize it without modifying any code.

```jsonc
{
  "cellSize": 32,         // Pixel size of each grid cell
  "spriteScale": 2,       // Scale factor for Pokemon sprites
  "ballScale": 2,         // Scale factor for Pokeball sprites
  "walkSpeed": 120,       // Pokemon walk speed (px/s)
  "playerSpeed": 160,     // Player walk speed (px/s)

  "floors": [
    // Floors listed top-to-bottom. First entry = topmost on screen = highest workstation priority.
    // width & height MUST be multiples of cellSize (32). E.g. 1152 = 36 cells, 704 = 22 cells.
    { "key": "map2f", "src": "/assets/map-2f.png", "width": 1152, "height": 704 },
    { "key": "map1f", "src": "/assets/map-1f.png", "width": 1152, "height": 704 }
  ],

  "floorBoundaryRow": 22, // Row where floors[0] ends and floors[1] begins (= floors[0].height / cellSize)

  "collisionMap": [
    // One string per row. Each character = one cell.
    // See "Map Symbols" below.
    "####################################",
    "..."
  ],

  "playerSpawn": { "col": 8, "row": 42 }  // Player start position (grid coords)
}
```

### Map Symbols

| Symbol | Meaning |
|--------|---------|
| `#` | Wall / impassable |
| `.` | Walkable floor |
| `+` | Workstation — Pokemon will sit here when their agent is active |
| `*` | Pokeball slot — Pokeballs are placed here in order of appearance |
| `$` | Stair (upper floor) — teleports to matching `%` on the lower floor |
| `%` | Stair (lower floor) — teleports to matching `$` on the upper floor |

Stair pairs are matched by order of appearance: the 1st `$` links to the 1st `%`, the 2nd `$` to the 2nd `%`, etc.

Stair teleportation also works for Pokemon pathfinding — when walking back to their Pokeball, Pokemon will use stairs to cross floors.

### Workstation Priority

Workstations (`+`) are assigned to active agents with the **first floor in the `floors` array** prioritized. If all workstations on the priority floor are occupied, remaining agents are assigned to the next floor. Within each floor, workstations are assigned randomly.

Pokemon face the nearest `#` (wall/desk) while working at their assigned workstation.

### Floors Configuration

The `floors` array defines the map images stacked vertically. The **first entry** appears at the top of the screen and has the highest workstation priority.

| Field | Description |
|-------|-------------|
| `key` | Unique identifier used internally by Phaser for this floor's texture |
| `src` | Path to the floor image (served from `/assets/`) |
| `width` | Image width in pixels — **must be a multiple of `cellSize`** |
| `height` | Image height in pixels — **must be a multiple of `cellSize`** |

The `floorBoundaryRow` field indicates the row index where the first floor ends and the second floor begins in the `collisionMap`. For example, if the first floor image is 704px tall and `cellSize` is 32, that floor occupies 704 / 32 = 22 rows, so `floorBoundaryRow` should be `22`.

### Custom Map Images

Replace the floor images in `assets/` with your own pixel-art office maps. Requirements:

- **Dimensions must be exact multiples of `cellSize` (default: 32).** For example, 1152×704 = 36×22 cells. Images like 1150×700 will cause misalignment.
- Each grid cell is `cellSize × cellSize` pixels (32×32 by default). All sprites, pokeballs, and the player character are aligned to this grid.
- The `width` and `height` in the `floors` config must exactly match the image dimensions.
- The `collisionMap` must have the correct number of rows and columns to cover all floors. Total rows = sum of each floor's `height / cellSize`. Columns = `width / cellSize`.

**Example:** Two floors at 1152×704 each → `collisionMap` should have 44 rows (22 + 22) of 36 characters each.

### Player Sprites

Player character sprites are in `assets/player/`. The naming convention is `{direction}-{frame}.png`:

| Direction | Value |
|-----------|-------|
| Down | 1 |
| Up | 2 |
| Left | 3 |
| Right | 4 |

Each direction has 3 frames (1, 2, 3), where frame 3 is the neutral/idle pose.

## Development

Start the Vite dev server with hot reload:

```bash
npm run dev
```

The dev server proxies API requests to `http://localhost:3060`, so the OpenClaw gateway must be running.

Build for production:

```bash
npm run build
```

The built frontend is output to `dist/client/` and served by the plugin's built-in HTTP server.

## Project Structure

```
pokemon-claw-monitor/
├── assets/                  # Static assets served at /assets/*
│   ├── map-config.json      # Map layout & collision config
│   ├── map-1f.png           # 1F floor map image
│   ├── map-2f.png           # 2F floor map image
│   ├── ball.png             # Pokeball sprite
│   ├── ball-open.png        # Open pokeball sprite
│   ├── player/              # Player character sprites
│   └── pokemon/             # Pokemon sprites (001–151)
├── client/                  # Frontend source (React + Phaser)
│   ├── game/                # Phaser game logic
│   │   ├── BootScene.ts     # Asset loading & initialization
│   │   ├── OfficeScene.ts   # Main game scene
│   │   ├── config.ts        # Runtime config (from map-config.json)
│   │   ├── collision.ts     # Collision map, pathfinding, desk detection
│   │   ├── events.ts        # Phaser ↔ React event bridge
│   │   └── types.ts         # Shared type definitions
│   ├── lib/                 # API client & utilities
│   ├── pages/               # React page components
│   └── styles/              # CSS stylesheets
├── src/                     # Backend source (Node.js)
│   ├── server.ts            # HTTP server (SSE, static files, API)
│   └── collector.ts         # Agent status data collector
├── index.ts                 # Plugin entry point
├── openclaw.plugin.json     # Plugin metadata & config schema
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## License

[MIT](./LICENSE)
