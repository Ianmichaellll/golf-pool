export type Player = {
  name: string;
  position: string;
  score: string;
  thru: string;
  today: string;
  isBackup: boolean;
  isActive: boolean;
};

export type Team = {
  id: string;
  owner: string;
  players: Player[];
  totalScore: number;
  positionSum: number;
};

export type PoolConfig = {
  tournamentName: string;
  teams: { id: string; owner: string; players: string[] }[];
  createdAt: string;
};
