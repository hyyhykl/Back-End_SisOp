import type { TypedServer } from '../../socket/socket';
import {
  AvatarColor,
  RoomPlayerWithUser,
  ServerToClientEvents,
  StickBrawlChestResult,
  StickBrawlChestSnapshot,
  StickBrawlFinalResult,
  StickBrawlGameEnd,
  StickBrawlPhase,
  StickBrawlPlayerSnapshot,
  StickBrawlPlayerStatus,
  StickBrawlRoundEnd,
  StickBrawlRoundMode,
  StickBrawlRoundStart,
  StickBrawlSnapshot,
  StickBrawlStanding,
} from '../../types';
import {
  getRoundConfig,
  STICK_BRAWL_CONFIG,
  STICK_BRAWL_ROUNDS,
} from './stickbrawl.config';

interface StickBrawlPlayer {
  userId: string;
  name: string;
  avatarColor: AvatarColor;
  score: number;
  chests: number;
  explosions: number;
  status: StickBrawlPlayerStatus;
  socketId?: string;
  queuedAt?: number;
  cooldownUntil: number;
  stunUntil: number;
}

export class StickBrawlGame {
  private readonly players = new Map<string, StickBrawlPlayer>();
  private queue: string[] = [];
  private readonly holders = new Set<string>();
  private readonly pendingRace = new Set<string>();
  private readonly releaseTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private roundTimer: ReturnType<typeof setInterval> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private breakTimer: ReturnType<typeof setInterval> | null = null;
  private raceTimer: ReturnType<typeof setTimeout> | null = null;
  private round = 0;
  private mode: StickBrawlRoundMode | null = null;
  private phase: StickBrawlPhase = 'idle';
  private timeLeft = 0;
  private roundEndsAt = 0;
  private lastTick = -1;

  constructor(
    private readonly io: TypedServer,
    public readonly roomCode: string,
    public readonly roomId: string,
    private readonly hostId: string,
    players: RoomPlayerWithUser[],
    private readonly onFinished: (result: StickBrawlFinalResult) => void
  ) {
    for (const player of players) {
      this.players.set(player.userId, {
        userId: player.userId,
        name: player.name,
        avatarColor: player.avatarColor,
        score: 0,
        chests: 0,
        explosions: 0,
        status: 'idle',
        cooldownUntil: 0,
        stunUntil: 0,
      });
    }
  }

  get isActive(): boolean {
    return this.phase !== 'idle' && this.phase !== 'finished';
  }

  get currentPhase(): StickBrawlPhase {
    return this.phase;
  }

  isHost(userId: string): boolean {
    return this.hostId === userId;
  }

  hasPlayer(userId: string): boolean {
    return this.players.has(userId);
  }

  registerSocket(userId: string, socketId: string): void {
    const player = this.players.get(userId);
    if (player) player.socketId = socketId;
  }

  isBoundToSocket(userId: string, socketId: string): boolean {
    const player = this.players.get(userId);
    if (!player) return false;
    return !player.socketId || player.socketId === socketId;
  }

  start(): void {
    if (this.phase !== 'idle') return;

    const firstRound = getRoundConfig(1);
    this.phase = 'countdown';
    this.round = 0;
    this.timeLeft = 0;
    let secondsLeft = STICK_BRAWL_CONFIG.startCountdownSeconds;

    this.emit('stickbrawl:countdown', {
      secondsLeft,
      nextRound: 1,
      mode: firstRound.mode,
    });
    this.emitState();

    this.countdownTimer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.beginRound(1);
        return;
      }
      this.emit('stickbrawl:countdown', {
        secondsLeft,
        nextRound: 1,
        mode: firstRound.mode,
      });
    }, 1000);
  }

  run(userId: string): void {
    if (this.phase !== 'running') {
      this.emitBlocked(userId, 'Ronde belum berjalan.');
      return;
    }

    const player = this.players.get(userId);
    if (!player) return;

    const now = Date.now();
    if (player.status === 'at_chest' || this.holders.has(userId)) {
      this.emitBlocked(userId, 'Kamu masih berada di area peti.');
      return;
    }
    if (player.status === 'queued' || this.queue.includes(userId)) {
      this.emitBlocked(userId, 'Kamu sudah berada di antrean.');
      return;
    }
    if (player.stunUntil > now) {
      this.emitBlocked(userId, 'Kamu masih terkena efek ledakan.');
      return;
    }
    if (player.cooldownUntil > now) {
      this.emitBlocked(userId, 'Tunggu sebentar sebelum lari lagi.');
      return;
    }

    if (this.mode === 'race') {
      this.queueRaceAttempt(player);
      return;
    }

    this.enqueueOrAcquire(player);
  }

  removePlayer(userId: string): void {
    const player = this.players.get(userId);
    if (!player) return;

    const wasRunning = this.phase !== 'idle' && this.phase !== 'finished';

    const timer = this.releaseTimers.get(userId);
    if (timer) clearTimeout(timer);
    this.releaseTimers.delete(userId);
    this.queue = this.queue.filter((id) => id !== userId);
    this.pendingRace.delete(userId);
    this.holders.delete(userId);
    this.players.delete(userId);

    if (!wasRunning) return;

    const hostLeft = userId === this.hostId;
    const notEnoughPlayers = this.players.size < 2;

    if (hostLeft || notEnoughPlayers) {
      this.abort(
        hostLeft
          ? 'Host keluar. Permainan dibatalkan.'
          : 'Pemain kurang dari 2. Permainan dibatalkan.'
      );
      return;
    }

    this.processQueue();
    this.emitChestResult({
      outcome: 'blocked',
      userIds: [userId],
      points: 0,
      message: `${player.name} keluar dari permainan.`,
    });
    this.emitState();
  }

  abort(message = 'Permainan dibatalkan.'): void {
    if (this.phase === 'idle' || this.phase === 'finished') return;

    const round = this.round;
    const mode = this.mode ?? 'race';

    this.clearAllTimers();
    this.phase = 'finished';
    this.timeLeft = 0;
    this.queue = [];
    this.holders.clear();
    this.pendingRace.clear();

    for (const player of this.players.values()) {
      player.status = 'idle';
      player.queuedAt = undefined;
    }

    const standings = this.standings();
    const roundEnd: StickBrawlRoundEnd = {
      round,
      mode,
      reason: 'ABORTED',
      timeLeft: 0,
      standings,
      players: this.playerSnapshots(),
      message,
    };
    this.emit('stickbrawl:round_end', roundEnd);

    const gameEnd: StickBrawlGameEnd = {
      roomCode: this.roomCode,
      winnerUserId: standings[0]?.userId ?? null,
      standings,
      reason: 'ABORTED',
      message,
    };
    this.emit('stickbrawl:game_end', gameEnd);
    this.emitState();
    this.onFinished({
      roomCode: this.roomCode,
      roomId: this.roomId,
      winnerUserId: standings[0]?.userId ?? null,
      standings,
      reason: 'ABORTED',
      roundsPlayed: this.round,
    });
  }

  dispose(): void {
    this.clearAllTimers();
    this.phase = 'finished';
    this.queue = [];
    this.holders.clear();
    this.pendingRace.clear();
  }

  snapshot(): StickBrawlSnapshot {
    return {
      roomCode: this.roomCode,
      round: this.round,
      totalRounds: STICK_BRAWL_CONFIG.totalRounds,
      mode: this.mode,
      phase: this.phase,
      timeLeft: this.timeLeft,
      roundDuration: STICK_BRAWL_CONFIG.roundDurationSeconds,
      players: this.playerSnapshots(),
      standings: this.standings(),
      chest: this.chestSnapshot(),
    };
  }

  private beginRound(round: number): void {
    this.clearRoundTimers();

    const config = getRoundConfig(round);
    this.round = round;
    this.mode = config.mode;
    this.phase = 'running';
    this.timeLeft = STICK_BRAWL_CONFIG.roundDurationSeconds;
    this.roundEndsAt = Date.now() + STICK_BRAWL_CONFIG.roundDurationSeconds * 1000;
    this.lastTick = this.timeLeft;
    this.queue = [];
    this.holders.clear();
    this.pendingRace.clear();

    for (const player of this.players.values()) {
      player.status = 'idle';
      player.queuedAt = undefined;
      player.cooldownUntil = 0;
      player.stunUntil = 0;
    }

    const payload: StickBrawlRoundStart = {
      round: config.round,
      mode: config.mode,
      title: config.title,
      rules: config.rules,
      duration: STICK_BRAWL_CONFIG.roundDurationSeconds,
      timeLeft: this.timeLeft,
      standings: this.standings(),
      players: this.playerSnapshots(),
    };

    this.emit('stickbrawl:round_start', payload);
    this.emitState();

    this.roundTimer = setInterval(() => this.handleTick(), 1000);
  }

  private handleTick(): void {
    if (this.phase !== 'running') return;

    const remaining = Math.max(0, Math.ceil((this.roundEndsAt - Date.now()) / 1000));
    this.timeLeft = remaining;

    if (remaining !== this.lastTick) {
      this.lastTick = remaining;
      this.emit('stickbrawl:tick', {
        round: this.round,
        timeLeft: remaining,
        phase: this.phase,
      });
    }

    if (remaining <= 0) {
      this.endRound('TIME_UP');
    }
  }

  private queueRaceAttempt(player: StickBrawlPlayer): void {
    this.pendingRace.add(player.userId);
    player.status = 'running';
    this.emitState();

    if (this.raceTimer) return;

    this.raceTimer = setTimeout(() => {
      this.raceTimer = null;
      this.resolveRace();
    }, STICK_BRAWL_CONFIG.raceWindowMs);
  }

  private resolveRace(): void {
    if (this.phase !== 'running') {
      this.pendingRace.clear();
      return;
    }

    const userIds = [...this.pendingRace];
    this.pendingRace.clear();
    if (userIds.length === 0) return;

    if (userIds.length === 1) {
      const player = this.players.get(userIds[0]);
      if (player) this.awardChest(player, false);
      return;
    }

    const now = Date.now();
    for (const userId of userIds) {
      const player = this.players.get(userId);
      if (!player) continue;
      player.explosions += 1;
      player.score = Math.max(0, player.score - STICK_BRAWL_CONFIG.explosionPenalty);
      player.status = 'stunned';
      player.stunUntil = now + STICK_BRAWL_CONFIG.stunMs;
      player.cooldownUntil = now + STICK_BRAWL_CONFIG.stunMs;
    }

    const names = userIds
      .map((userId) => this.players.get(userId)?.name)
      .filter((name): name is string => Boolean(name));

    this.emitChestResult({
      outcome: 'explosion',
      userIds,
      points: -STICK_BRAWL_CONFIG.explosionPenalty,
      message: `Ledakan! ${names.join(', ')} masuk bersamaan. Race condition terdeteksi.`,
    });
    this.emitState();
  }

  private enqueueOrAcquire(player: StickBrawlPlayer): void {
    const config = getRoundConfig(this.round);

    if (this.holders.size < config.capacity) {
      this.awardChest(player, false);
      return;
    }

    this.queue.push(player.userId);
    player.status = 'queued';
    player.queuedAt = Date.now();

    this.emitChestResult({
      outcome: 'queued',
      userIds: [player.userId],
      points: 0,
      message: `${player.name} masuk antrean (posisi ${this.queue.length}).`,
    });
    this.emit('stickbrawl:queue_update', this.chestSnapshot());
    this.emitState();
  }

  private awardChest(player: StickBrawlPlayer, fromQueue: boolean): void {
    this.holders.add(player.userId);
    player.status = 'at_chest';
    player.chests += 1;
    player.score += STICK_BRAWL_CONFIG.successPoints;
    player.queuedAt = undefined;

    const timer = setTimeout(() => this.releaseChest(player.userId), STICK_BRAWL_CONFIG.grabHoldMs);
    this.releaseTimers.set(player.userId, timer);

    this.emitChestResult({
      outcome: 'success',
      userIds: [player.userId],
      points: STICK_BRAWL_CONFIG.successPoints,
      message: fromQueue
        ? `${player.name} mendapat giliran dan mengambil peti (+${STICK_BRAWL_CONFIG.successPoints}).`
        : `${player.name} berhasil mengambil peti (+${STICK_BRAWL_CONFIG.successPoints}).`,
    });
    this.emit('stickbrawl:queue_update', this.chestSnapshot());
    this.emitState();
  }

  private releaseChest(userId: string): void {
    this.holders.delete(userId);
    this.releaseTimers.delete(userId);

    const player = this.players.get(userId);
    if (player) {
      player.status = 'idle';
      player.cooldownUntil = Date.now() + STICK_BRAWL_CONFIG.cooldownMs;
    }

    this.processQueue();
    this.emit('stickbrawl:queue_update', this.chestSnapshot());
    this.emitState();
  }

  private processQueue(): void {
    if (this.phase !== 'running') return;

    const config = getRoundConfig(this.round);
    while (this.holders.size < config.capacity && this.queue.length > 0) {
      const nextUserId = this.queue.shift();
      if (!nextUserId) break;
      const player = this.players.get(nextUserId);
      if (!player) continue;
      player.queuedAt = undefined;
      this.awardChest(player, true);
    }
  }

  private endRound(reason: 'TIME_UP' | 'ABORTED'): void {
    if (this.phase !== 'running') return;

    this.clearRoundTimers();
    this.phase = 'round_end';
    this.timeLeft = 0;
    this.queue = [];
    this.holders.clear();
    this.pendingRace.clear();

    for (const player of this.players.values()) {
      player.status = 'idle';
      player.queuedAt = undefined;
    }

    const payload: StickBrawlRoundEnd = {
      round: this.round,
      mode: this.mode ?? 'race',
      reason,
      timeLeft: 0,
      standings: this.standings(),
      players: this.playerSnapshots(),
      message: reason === 'TIME_UP' ? `Waktu ronde ${this.round} habis.` : 'Ronde dibatalkan.',
    };
    this.emit('stickbrawl:round_end', payload);
    this.emitState();

    if (this.round >= STICK_BRAWL_CONFIG.totalRounds) {
      this.finish();
      return;
    }

    this.scheduleNextRound(this.round + 1);
  }

  private scheduleNextRound(nextRound: number): void {
    const config = getRoundConfig(nextRound);
    let secondsLeft = STICK_BRAWL_CONFIG.roundBreakSeconds;

    this.emit('stickbrawl:countdown', {
      secondsLeft,
      nextRound,
      mode: config.mode,
    });

    this.breakTimer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        if (this.breakTimer) clearInterval(this.breakTimer);
        this.breakTimer = null;
        this.beginRound(nextRound);
        return;
      }
      this.emit('stickbrawl:countdown', {
        secondsLeft,
        nextRound,
        mode: config.mode,
      });
    }, 1000);
  }

  private finish(): void {
    this.clearAllTimers();
    this.phase = 'finished';
    this.timeLeft = 0;
    this.queue = [];
    this.holders.clear();
    this.pendingRace.clear();

    const standings = this.standings();
    const winner = standings[0];

    const payload: StickBrawlGameEnd = {
      roomCode: this.roomCode,
      winnerUserId: winner?.userId ?? null,
      standings,
      reason: 'COMPLETED',
      message: winner ? `${winner.name} memenangkan Stick Brawl!` : 'Permainan selesai.',
    };
    this.emit('stickbrawl:game_end', payload);
    this.emitState();
    this.onFinished({
      roomCode: this.roomCode,
      roomId: this.roomId,
      winnerUserId: payload.winnerUserId,
      standings,
      reason: 'COMPLETED',
      roundsPlayed: this.round,
    });
  }

  private playerSnapshots(): StickBrawlPlayerSnapshot[] {
    return [...this.players.values()].map((player) => this.toSnapshot(player));
  }

  private standings(): StickBrawlStanding[] {
    return [...this.players.values()]
      .map((player) => this.toSnapshot(player))
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.chests - a.chests ||
          a.name.localeCompare(b.name)
      )
      .map((player, index) => ({ ...player, rank: index + 1 }));
  }

  private toSnapshot(player: StickBrawlPlayer): StickBrawlPlayerSnapshot {
    if (player.status === 'stunned' && player.stunUntil <= Date.now()) {
      player.status = 'idle';
    }
    return {
      userId: player.userId,
      name: player.name,
      avatarColor: player.avatarColor,
      score: player.score,
      chests: player.chests,
      explosions: player.explosions,
      status: player.status,
    };
  }

  private chestSnapshot(): StickBrawlChestSnapshot {
    const config = this.round > 0 ? getRoundConfig(this.round) : STICK_BRAWL_ROUNDS[0];
    return {
      mode: this.mode ?? config.mode,
      capacity: config.capacity,
      holders: [...this.holders],
      queue: [...this.queue],
    };
  }

  private emitChestResult(result: Omit<StickBrawlChestResult, 'standings' | 'chest'>): void {
    this.emit('stickbrawl:chest_result', {
      ...result,
      standings: this.standings(),
      chest: this.chestSnapshot(),
    });
  }

  private emitBlocked(userId: string, message: string): void {
    this.emitChestResult({
      outcome: 'blocked',
      userIds: [userId],
      points: 0,
      message,
    });
  }

  private emitState(): void {
    this.emit('stickbrawl:state', this.snapshot());
  }

  private emit<K extends keyof ServerToClientEvents>(
    event: K,
    payload: Parameters<ServerToClientEvents[K]>[0]
  ): void {
    (this.io.to(this.roomCode) as any).emit(event, payload);
  }

  private clearRoundTimers(): void {
    if (this.roundTimer) clearInterval(this.roundTimer);
    this.roundTimer = null;
    if (this.raceTimer) clearTimeout(this.raceTimer);
    this.raceTimer = null;
    for (const timer of this.releaseTimers.values()) clearTimeout(timer);
    this.releaseTimers.clear();
  }

  private clearAllTimers(): void {
    this.clearRoundTimers();
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
    if (this.breakTimer) clearInterval(this.breakTimer);
    this.breakTimer = null;
  }
}

export function createIdleStickBrawlSnapshot(
  roomCode: string,
  players: RoomPlayerWithUser[]
): StickBrawlSnapshot {
  const snapshots: StickBrawlPlayerSnapshot[] = players.map((player) => ({
    userId: player.userId,
    name: player.name,
    avatarColor: player.avatarColor,
    score: 0,
    chests: 0,
    explosions: 0,
    status: 'idle' as const,
  }));

  return {
    roomCode,
    round: 0,
    totalRounds: STICK_BRAWL_CONFIG.totalRounds,
    mode: null,
    phase: 'idle',
    timeLeft: 0,
    roundDuration: STICK_BRAWL_CONFIG.roundDurationSeconds,
    players: snapshots,
    standings: snapshots.map((player, index) => ({ ...player, rank: index + 1 })),
    chest: {
      mode: STICK_BRAWL_ROUNDS[0].mode,
      capacity: STICK_BRAWL_ROUNDS[0].capacity,
      holders: [],
      queue: [],
    },
  };
}
