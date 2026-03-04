export interface TooltipData {
  html: string;
  x: number;
  y: number;
}

export interface StatsData {
  workingCount: number;
  totalCount: number;
}

export interface GameEventHandlers {
  onTooltip?: (data: TooltipData | null) => void;
  onStats?: (data: StatsData) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export const gameCallbacks: GameEventHandlers = {};
