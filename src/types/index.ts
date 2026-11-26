export type AvatarColor = 'merah' | 'hijau' | 'biru' | 'kuning';

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


export interface MinigameInputData {
  code: string;
  minigame: number;
  userId: string;
  key: string;
  
  type?: string;
}


export interface MinigameCommandData {
  code: string;
  minigame: number;
  type: 'sync' | 'start' | 'begin_round' | 'calculated' | 'summary' | 'result';
  duration?: number;
}

export interface Minigame1FighterSnapshot {
  step: number;
  walking: boolean;
}

export interface Minigame1LogSnapshot {
  time: string;
  message: string;
}

export interface Minigame1SnapshotState {
  phase: 'intro' | 'rule' | 'arena' | 'calculating' | 'result' | 'summary';
  roundIndex: number;
  timeLeft: number;
  scores: Record<string, number>;
  roundScores: Record<string, number[]>;
  boomCount: number;
  boomByRound: number[];
  boomByPlayer: Record<string, number>;
  toast: string;
  inRing: string[];
  boom: boolean;
  heldSlots: string[];
  waiting: string[];
  stunned: string[];
  fighters: Record<string, Minigame1FighterSnapshot>;
  walkFrame: number;
  timeUpActive: boolean;
  eventLog: Minigame1LogSnapshot[];
  logStep: number;
}

export interface MinigameStateData {
  code: string;
  minigame: number;
  [key: string]: unknown;
}

export interface MinigameCompleteData {
  code: string;
  minigame: number;
  scores: Array<{
    userId: string;
    score: number;
    metrics?: Record<string, unknown>;
  }>;
}

export interface ServerToClientEvents {
  
  'room:state': (data: RoomState) => void;
  'room:player_joined': (data: RoomPlayerWithUser) => void;
  'room:player_left': (data: { userId: string; name: string; reason?: string }) => void;
  'room:player_ready': (data: { userId: string; isReady: boolean }) => void;
  'room:disbanded': (data: { reason: string }) => void;
  'room:kicked': (data: { reason: string }) => void;

  
  'rooms:updated': () => void;

  
  'tournament:starting': (data: { countdown: number; firstMinigame: number }) => void;

  
  'minigame:input': (data: MinigameInputData) => void;
  'minigame:state': (data: MinigameStateData) => void;

  
  'stickbrawl:state': (data: StickBrawlSnapshot) => void;
  'stickbrawl:countdown': (data: StickBrawlCountdown) => void;
  'stickbrawl:round_start': (data: StickBrawlRoundStart) => void;
  'stickbrawl:tick': (data: StickBrawlTick) => void;
  'stickbrawl:chest_result': (data: StickBrawlChestResult) => void;
  'stickbrawl:queue_update': (data: StickBrawlChestSnapshot) => void;
  'stickbrawl:round_end': (data: StickBrawlRoundEnd) => void;
  'stickbrawl:game_summary': (data: StickBrawlGameSummary) => void;
  'stickbrawl:game_end': (data: StickBrawlGameEnd) => void;

  
  'jellyfish:state': (data: JellyfishSnapshot) => void;
  'jellyfish:round_start': (data: JellyfishRoundStart) => void;
  'jellyfish:round_end': (data: JellyfishRoundEnd) => void;
  'jellyfish:game_end': (data: JellyfishGameEnd) => void;
  'jellyfish:request_result': (data: JellyfishRequestResult) => void;
  'jellyfish:deadlock': (data: JellyfishDeadlock) => void;

  
  'jellyfish:briefing_r1:show': (data: JellyfishTransition) => void;
  'jellyfish:round1:start': (data: JellyfishTransition) => void;
  'jellyfish:briefing_r2:show': (data: JellyfishTransition) => void;
  'jellyfish:round2:start': (data: JellyfishTransition) => void;
  'jellyfish:briefing_r3:show': (data: JellyfishTransition) => void;
  'jellyfish:round3:start': (data: JellyfishTransition) => void;
  'jellyfish:hasil:show': (data: JellyfishTransition) => void;

  
  'final:score_show': (data: FinalScorePayload) => void;
  'final:lobby': (data: JellyfishTransition) => void;

  
  toast: (data: { type: 'error' | 'info' | 'success'; message: string }) => void;
}

export interface ClientToServerEvents {
  
  'auth': (userId: string) => void;

  
  'room:join': (data: { code: string }) => void;
  'room:leave': (data: { code: string }) => void;
  'room:set_ready': (data: { code: string; isReady: boolean }) => void;
  'room:kick': (data: { code: string; targetUserId: string }) => void;

  
  'tournament:start': (data: { code: string }) => void;

  
  'game:input': (data: GameInputData) => void;
  'minigame:submit_score': (data: SubmitScoreData) => void;
  'minigame:input': (data: MinigameInputData) => void;
  'minigame:state': (data: MinigameStateData) => void;
  'minigame:complete': (data: MinigameCompleteData) => void;
  'minigame:command': (data: MinigameCommandData) => void;

  
  'stickbrawl:start': (data: { code: string; minigame?: number }) => void;
  'stickbrawl:join': (data: { code: string }) => void;
  'stickbrawl:sync': (data: { code: string }) => void;
  'stickbrawl:run': (data: { code: string }) => void;
  'stickbrawl:leave': (data: { code: string }) => void;
  'stickbrawl:abort': (data: { code: string }) => void;

  
  'jellyfish:join': (data: JellyfishCodeData) => void;
  'jellyfish:start': (data: JellyfishCodeData) => void;
  'jellyfish:move': (data: JellyfishMoveData) => void;
  'jellyfish:request_resource': (data: JellyfishRequestResourceData) => void;
  'jellyfish:release': (data: JellyfishReleaseData) => void;
  'jellyfish:next_round': (data: JellyfishCodeData) => void;
  'jellyfish:leave': (data: JellyfishCodeData) => void;

  
  'jellyfish:briefing_r1:show': (data: JellyfishTransition) => void;
  'jellyfish:round1:start': (data: JellyfishTransition) => void;
  'jellyfish:briefing_r2:show': (data: JellyfishTransition) => void;
  'jellyfish:round2:start': (data: JellyfishTransition) => void;
  'jellyfish:briefing_r3:show': (data: JellyfishTransition) => void;
  'jellyfish:round3:start': (data: JellyfishTransition) => void;
  'jellyfish:hasil:show': (data: JellyfishTransition) => void;

  
  'final:score_show': (data: JellyfishTransition) => void;
  'final:lobby': (data: JellyfishTransition) => void;
  'final:play_again': (data: JellyfishTransition) => void;
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


export type JellyfishPlayerKey = 'P1' | 'P2' | 'P3' | 'P4';
export type JellyfishAlgorithm = 'no_prevention' | 'resource_ordering' | 'banker';
export type JellyfishStatus =
  | 'idle'
  | 'briefing'
  | 'playing'
  | 'deadlock_recovery'
  | 'round_end'
  | 'game_end';
export type JellyfishRequestReason =
  | 'accepted'
  | 'rejected_order'
  | 'rejected_unsafe'
  | 'already_owned'
  | 'not_target'
  | 'too_far'
  | 'round_over'
  | 'blocked';

export interface JellyfishCodeData {
  code: string;
}

export interface JellyfishTransition {
  code: string;
}


export interface FinalScorePlayer {
  userId: string;
  name: string;
  avatarColor: AvatarColor;
  playerKey?: JellyfishPlayerKey;
  rank: number;
  game1Score: number;
  game2Score: number;
  totalScore: number;
  game1Rounds: number[];
  game2Rounds: number[];
}

export interface FinalScorePayload {
  code: string;
  players: FinalScorePlayer[];
}

export interface JellyfishMoveData extends JellyfishCodeData {
  x: number;
  y: number;
}

export interface JellyfishRequestResourceData extends JellyfishCodeData {
  resourceId: number;
}

export interface JellyfishReleaseData extends JellyfishCodeData {}

export interface JellyfishJellySnapshot {
  id: number;
  x: number;
  y: number;
  owner: string | null;
  vx: number;
  vy: number;
}

export interface JellyfishPlayerSnapshot {
  userId: string;
  playerKey: JellyfishPlayerKey;
  name: string;
  avatarColor: AvatarColor;
  x: number;
  y: number;
  held: number[];
  score: number;
  exited: boolean;
  deadlocksInvolved: number;
  rejectedRequests: number;
  connected: boolean;
  wants: number | null;
  blockedBy: string | null;
}

export interface JellyfishDeadlockState {
  cycleIds: string[];
  recoveryMsRemaining: number;
}

export interface JellyfishSnapshot {
  code: string;
  minigame: 2;
  round: number;
  algorithm: JellyfishAlgorithm | null;
  status: JellyfishStatus;
  timeLeft: number;
  seed: number;
  scenarioId: string;
  jellies: JellyfishJellySnapshot[];
  players: JellyfishPlayerSnapshot[];
  deadlock: JellyfishDeadlockState | null;
  finishOrder: string[];
}

export interface JellyfishRoundStart {
  code: string;
  round: number;
  algorithm: JellyfishAlgorithm;
  duration: number;
  timeLeft: number;
  seed: number;
  scenarioId: string;
}

export interface JellyfishRequestResult {
  code: string;
  userId: string;
  resourceId: number;
  ok: boolean;
  reason: JellyfishRequestReason;
  message?: string;
}

export interface JellyfishDeadlock {
  code: string;
  cycleIds: string[];
  recoveryMs: number;
}

export interface JellyfishRoundStanding {
  userId: string;
  playerKey: JellyfishPlayerKey;
  name: string;
  avatarColor: AvatarColor;
  roundScore: number;
  totalScore: number;
  deadlocksInvolved: number;
  rejectedRequests: number;
  finished: boolean;
  finishTimeSec: number | null;
}

export interface JellyfishRoundMetrics {
  deadlocks: number;
  finishedPlayers: number;
  avgFinishTimeSec: number | null;
  rejectedRequests: number;
}

export interface JellyfishRoundEnd {
  code: string;
  round: number;
  algorithm: JellyfishAlgorithm;
  reason: 'TIME_UP' | 'COMPLETE' | 'ABORTED';
  standings: JellyfishRoundStanding[];
  metrics: JellyfishRoundMetrics;
}

export interface JellyfishFinalStanding {
  userId: string;
  playerKey: JellyfishPlayerKey;
  name: string;
  avatarColor: AvatarColor;
  r1: number;
  r2: number;
  r3: number;
  total: number;
  deadlocks: number;
  rejectedRequests: number;
  completedRounds: number;
  rank: number;
}

export interface JellyfishAlgorithmMetrics extends JellyfishRoundMetrics {
  algorithm: JellyfishAlgorithm;
}

export interface JellyfishGameEnd {
  code: string;
  minigame: 2;
  finalStandings: JellyfishFinalStanding[];
  roundResults: JellyfishRoundEnd[];
  metricsByAlgorithm: JellyfishAlgorithmMetrics[];
  reason: 'COMPLETED' | 'ABORTED';
}

export interface JellyfishFinalResult {
  code: string;
  roomId: string;
  minigame: 2;
  finalStandings: JellyfishFinalStanding[];
  roundResults: JellyfishRoundEnd[];
  metricsByAlgorithm: JellyfishAlgorithmMetrics[];
  reason: 'COMPLETED' | 'ABORTED';
}


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