export interface DeskCell {
  col: number;
  row: number;
  facing: "up" | "down" | "left" | "right";
  floorIndex: number;
}

export let COLLISION_MAP: number[][] = [];
export let MAP_COLS = 0;
export let MAP_ROWS = 0;
export let STAIR_MAP: Record<string, { col: number; row: number }> = {};
export let DESK_CELLS: DeskCell[] = [];
export let BALL_CELLS: { col: number; row: number }[] = [];

export function initCollision(mapLines: string[], floorBoundaryRow: number) {
  COLLISION_MAP = mapLines.map((row) =>
    [...row].map((ch) => (ch === "#" || ch === "*") ? 0 : 1),
  );
  MAP_COLS = COLLISION_MAP[0]?.length ?? 0;
  MAP_ROWS = COLLISION_MAP.length;

  STAIR_MAP = {};
  const dollarCells: { col: number; row: number }[] = [];
  const percentCells: { col: number; row: number }[] = [];

  mapLines.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      if (ch === "$") dollarCells.push({ col, row });
      if (ch === "%") percentCells.push({ col, row });
    });
  });

  for (let i = 0; i < Math.min(dollarCells.length, percentCells.length); i++) {
    const d = dollarCells[i];
    const p = percentCells[i];
    STAIR_MAP[`${d.col},${d.row}`] = { col: p.col, row: p.row };
    STAIR_MAP[`${p.col},${p.row}`] = { col: d.col, row: d.row };
  }

  BALL_CELLS = [];
  mapLines.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      if (ch === "*") BALL_CELLS.push({ col, row });
    });
  });

  DESK_CELLS = [];

  mapLines.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      if (ch === "+") {
        DESK_CELLS.push({
          col,
          row,
          facing: detectFacing(col, row),
          floorIndex: row < floorBoundaryRow ? 0 : 1,
        });
      }
    });
  });

  DESK_CELLS.sort((a, b) => a.floorIndex - b.floorIndex);
}

function detectFacing(col: number, row: number): "up" | "down" | "left" | "right" {
  const dirs: { dx: number; dy: number; dir: "left" | "right" | "up" | "down" }[] = [
    { dx: -1, dy: 0, dir: "left" },
    { dx: 1, dy: 0, dir: "right" },
    { dx: 0, dy: -1, dir: "up" },
    { dx: 0, dy: 1, dir: "down" },
  ];
  let minDist = Infinity;
  let facing: "up" | "down" | "left" | "right" = "down";
  for (const { dx, dy, dir } of dirs) {
    for (let d = 1; d <= 4; d++) {
      const nc = col + dx * d;
      const nr = row + dy * d;
      if (nr < 0 || nr >= MAP_ROWS || nc < 0 || nc >= MAP_COLS) break;
      if (COLLISION_MAP[nr][nc] === 0) {
        if (d < minDist) { minDist = d; facing = dir; }
        break;
      }
    }
  }
  return facing;
}

// --- BFS pathfinding ---

export function findPath(
  fromCol: number, fromRow: number,
  toCol: number, toRow: number,
): { col: number; row: number }[] | null {
  if (fromCol === toCol && fromRow === toRow) return [];

  const key = (c: number, r: number) => r * MAP_COLS + c;
  const visited = new Set<number>();
  const parent = new Map<number, number>();

  const startKey = key(fromCol, fromRow);
  const endKey = key(toCol, toRow);
  visited.add(startKey);

  const queue: number[] = [startKey];
  const DX = [0, 0, -1, 1];
  const DY = [-1, 1, 0, 0];

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur === endKey) break;
    const cr = Math.floor(cur / MAP_COLS);
    const cc = cur % MAP_COLS;
    for (let d = 0; d < 4; d++) {
      const nc = cc + DX[d];
      const nr = cr + DY[d];
      if (nc < 0 || nc >= MAP_COLS || nr < 0 || nr >= MAP_ROWS) continue;
      const nk = key(nc, nr);
      if (COLLISION_MAP[nr][nc] === 0 && nk !== endKey) continue;
      if (visited.has(nk)) continue;
      visited.add(nk);
      parent.set(nk, cur);
      queue.push(nk);
    }
    const stairTarget = STAIR_MAP[`${cc},${cr}`];
    if (stairTarget) {
      const sk = key(stairTarget.col, stairTarget.row);
      if (!visited.has(sk)) {
        visited.add(sk);
        parent.set(sk, cur);
        queue.push(sk);
      }
    }
  }

  if (!parent.has(endKey) && startKey !== endKey) return null;

  const path: { col: number; row: number }[] = [];
  let cur = endKey;
  while (cur !== startKey) {
    path.push({ col: cur % MAP_COLS, row: Math.floor(cur / MAP_COLS) });
    cur = parent.get(cur)!;
  }
  path.reverse();
  return path;
}

export function simplifyPath(path: { col: number; row: number }[]): { col: number; row: number }[] {
  if (path.length <= 1) return path;
  const result: { col: number; row: number }[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const next = path[i + 1];
    const dc1 = path[i].col - prev.col;
    const dr1 = path[i].row - prev.row;
    const dc2 = next.col - path[i].col;
    const dr2 = next.row - path[i].row;
    const isStair = !!STAIR_MAP[`${path[i].col},${path[i].row}`];
    if (dc1 !== dc2 || dr1 !== dr2 || isStair) result.push(path[i]);
  }
  result.push(path[path.length - 1]);
  return result;
}
