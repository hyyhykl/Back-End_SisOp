export type AvatarColor = 'pink' | 'blue' | 'orange' | 'yellow';

export interface User {
  id: string;
  name: string;
  avatarColor: AvatarColor;
  createdAt: Date;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  isPrivate: boolean;
  maxPlayers: number;
  status: 'waiting' | 'starting' | 'playing' | 'finished';
  hostId: string;
  currentMinigame: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomPlayer {
  id: string;
  roomId: string;
  userId: string;
  isHost: boolean;
  isReady: boolean;
  joinedAt: Date;
  // Joined fields
  name?: string;
  avatarColor?: AvatarColor;
}

export interface PublicRoomInfo {
  roomId: string;
  code: string;
  name: string;
  currentPlayers: number;
  maxPlayers: number;
}

export interface RoomState {
  room: {
    roomId: string;
    code: string;
    name: string;
    status: 'waiting';
    maxPlayers: 4;
  };
  players: RoomPlayerWithUser[];
  me: { userId: string; isHost: boolean };
}

export interface RoomPlayerWithUser extends RoomPlayer {
  name: string;
  avatarColor: AvatarColor;
}

export interface MinigameScore {
  id: string;
  roomId: string;
  userId: string;
  minigameNumber: number;
  score: number;
  metrics: Record<string, unknown>;
  createdAt: Date;
}

export interface GameHistory {
  id: string;
  roomId: string;
  winnerUserId: string | null;
  totalPlayers: number;
  durationSeconds: number;
  finishedAt: Date;
}

// Socket.io event types
export interface ServerToClientEvents {
  // Lobby events
  'room:state': (data: RoomState) => void;
  'room:player_joined': (data: RoomPlayerWithUser) => void;
  'room:player_left': (data: { userId: string; name: string; reason?: string }) => void;
  'room:player_ready': (data: { userId: string; isReady: boolean }) => void;
  'room:disbanded': (data: { reason: string }) => void;
  'room:kicked': (data: { reason: string }) => void;

  // Room list (sinyal saja, tanpa data — frontend lalu GET /api/rooms)
  'rooms:updated': () => void;

  // Tournament events
  'tournament:starting': (data: { countdown: number; firstMinigame: number }) => void;

  // Stick Brawl
  'stickbrawl:state': (data: StickBrawlSnapshot) => void;
  'stickbrawl:countdown': (data: StickBrawlCountdown) => void;
  'stickbrawl:round_start': (data: StickBrawlRoundStart) => void;
  'stickbrawl:tick': (data: StickBrawlTick) => void;
  'stickbrawl:chest_result': (data: StickBrawlChestResult) => void;
  'stickbrawl:queue_update': (data: StickBrawlChestSnapshot) => void;
  'stickbrawl:round_end': (data: StickBrawlRoundEnd) => void;
  'stickbrawl:game_summary': (data: StickBrawlGameSummary) => void;
  'stickbrawl:game_end': (data: StickBrawlGameEnd) => void;

  // Toast/Error
  toast: (data: { type: 'error' | 'info' | 'success'; message: string }) => void;
}

export interface ClientToServerEvents {
  // Auth
  'auth': (userId: string) => void;

  // Room events
  'room:join': (data: { code: string }) => void;
  'room:leave': (data: { code: string }) => void;
  'room:set_ready': (data: { code: string; isReady: boolean }) => void;
  'room:kick': (data: { code: string; targetUserId: string }) => void;

  // Tournament
  'tournament:start': (data: { code: string }) => void;

  // Gameplay (placeholder for minigame handlers)
  'game:input': (data: GameInputData) => void;
  'minigame:submit_score': (data: SubmitScoreData) => void;

  // Stick Brawl
  'stickbrawl:start': (data: { code: string; minigame?: number }) => void;
  'stickbrawl:join': (data: { code: string }) => void;
  'stickbrawl:sync': (data: { code: string }) => void;
  'stickbrawl:run': (data: { code: string }) => void;
  'stickbrawl:leave': (data: { code: string }) => void;
  'stickbrawl:abort': (data: { code: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  userName: string;
  avatarColor: AvatarColor;
}

export interface GameInputData {
  code: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  action: 'grab' | 'release' | null;
}

export interface SubmitScoreData {
  code: string;
  minigame: number;
  score: number;
  metrics: Record<string, unknown>;
}

// Stick Brawl
export type StickBrawlRoundMode = 'race' | 'mutex' | 'semaphore';
export type StickBrawlPhase = 'idle' | 'countdown' | 'running' | 'round_end' | 'finished';
export type StickBrawlPlayerStatus = 'idle' | 'running' | 'queued' | 'at_chest' | 'stunned';

export interface StickBrawlPlayerSnapshot {
  userId: string;
  name: string;
  avatarColor: AvatarColor;
  score: number;
  chests: number;
  explosions: number;
  status: StickBrawlPlayerStatus;
}

export interface StickBrawlStanding extends StickBrawlPlayerSnapshot {
  rank: number;
}

export interface StickBrawlChestSnapshot {
  mode: StickBrawlRoundMode;
  capacity: number;
  holders: string[];
  queue: string[];
}

export interface StickBrawlSnapshot {
  roomCode: string;
  round: number;
  totalRounds: number;
  mode: StickBrawlRoundMode | null;
  phase: StickBrawlPhase;
  timeLeft: number;
  roundDuration: number;
  players: StickBrawlPlayerSnapshot[];
  standings: StickBrawlStanding[];
  chest: StickBrawlChestSnapshot;
}

export interface StickBrawlCountdown {
  secondsLeft: number;
  nextRound: number;
  mode: StickBrawlRoundMode | null;
}

export interface StickBrawlRoundStart {
  round: number;
  mode: StickBrawlRoundMode;
  title: string;
  rules: string;
  duration: number;
  timeLeft: number;
  standings: StickBrawlStanding[];
  players: StickBrawlPlayerSnapshot[];
}

export interface StickBrawlTick {
  round: number;
  timeLeft: number;
  phase: StickBrawlPhase;
}

export interface StickBrawlChestResult {
  outcome: 'success' | 'explosion' | 'queued' | 'blocked';
  userIds: string[];
  points: number;
  message: string;
  standings: StickBrawlStanding[];
  chest: StickBrawlChestSnapshot;
}

export interface StickBrawlRoundEnd {
  round: number;
  mode: StickBrawlRoundMode;
  reason: 'TIME_UP' | 'ABORTED';
  timeLeft: number;
  standings: StickBrawlStanding[];
  players: StickBrawlPlayerSnapshot[];
  message: string;
}

export interface StickBrawlGameScore {
  userId: string;
  name: string;
  avatarColor: AvatarColor;
  score: number;
  roundScores: number[];
  chests: number;
  explosions: number;
}

export interface StickBrawlGameRanking extends StickBrawlGameScore {
  rank: number;
}

export interface StickBrawlGameSummary {
  roomCode: string;
  game: number;
  totalRounds: number;
  players: StickBrawlGameScore[];
  rankings: StickBrawlGameRanking[];
  message: string;
}

export interface StickBrawlGameEnd {
  roomCode: string;
  winnerUserId: string | null;
  standings: StickBrawlStanding[];
  reason: 'COMPLETED' | 'ABORTED';
  message: string;
}

export interface StickBrawlFinalResult {
  roomCode: string;
  roomId: string;
  winnerUserId: string | null;
  standings: StickBrawlStanding[];
  reason: 'COMPLETED' | 'ABORTED';
  roundsPlayed: number;
}

// REST API Types
export interface AuthGuestRequest {
  name: string;
  avatarColor: AvatarColor;
}

export interface AuthGuestResponse {
  userId: string;
  name: string;
  avatarColor: AvatarColor;
}

export interface CreateRoomRequest {
  name: string;
  isPrivate: boolean;
  userId: string;
}

export interface CreateRoomResponse {
  roomId: string;
  code: string;
  name: string;
  isPrivate: boolean;
  maxPlayers: number;
  hostId: string;
}

export interface RoomDetailResponse {
  roomId: string;
  code: string;
  name: string;
  status: string;
  currentPlayers: number;
  maxPlayers: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}