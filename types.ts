
export enum Side {
  LEFT = 'LEFT',
  RIGHT = 'RIGHT'
}

export enum PlayerPosition {
  PLAYER_1 = 'PLAYER_1',
  PLAYER_2 = 'PLAYER_2',
  PLAYER_3 = 'PLAYER_3',
  PLAYER_4 = 'PLAYER_4'
}

export interface Player {
  id: string;
  name: string;
  level: number; // 1-10
  matchesPlayed: number;
  isActive: boolean; // 目前是否在場上
}

export interface MatchState {
  score1: number;
  score2: number;
  server: PlayerPosition;
  servingSide: Side;
  history: HistoryEntry[];
  gameTo: number;
  matchType: 'Singles' | 'Doubles';
  team1: Player[];
  team2: Player[];
}

export interface HistoryEntry {
  score1: number;
  score2: number;
  server: PlayerPosition;
}
