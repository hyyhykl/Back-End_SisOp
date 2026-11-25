import { REQUIRED_PLAYERS } from '../../config/gameRules';
import type { TypedServer } from '../../socket/socket';
import {
  AvatarColor,
  JellyfishAlgorithm,
  JellyfishDeadlock,
  JellyfishFinalResult,
  JellyfishFinalStanding,
  JellyfishGameEnd,
  JellyfishJellySnapshot,
  JellyfishPlayerKey,
  JellyfishPlayerSnapshot,
  JellyfishRequestReason,
  JellyfishRequestResult,
  JellyfishRoundEnd,
  JellyfishRoundStart,
  JellyfishSnapshot,
  JellyfishStatus,
  RoomPlayerWithUser,
} from '../../types';
import {
  ARENA_H,
  ARENA_W,
  CATCH_RADIUS,
  calcJellyfishRoundScore,
  clamp,
  DEADLOCK_RECOVERY_MS,
  distance,
  EXIT_POS,
  EXIT_RADIUS,
  getRoundConfig,
  JELLYFISH_MINIGAME_NUMBER,
  JELLYFISH_ROUNDS,
  JELLY_MOVE_MARGIN_X,
  JELLY_MOVE_MARGIN_Y,
  makeScenario,
  MAX_JELLY_SPEED,
  MAX_MOVE_EVENT_MS,
  MAX_PLAYER_SPEED_PX_PER_SEC,
  PLAYER_DEFS,
  PLAYER_KEY_BY_COLOR,
  PLAYER_MOVE_MARGIN,
  RESOURCE_COUNT,
  RESOURCES_PER_PLAYER,
  ROUND_SECONDS,
  SCENARIO_ID,
  SCENARIO_SEED,
  TICK_MS,
} from './jellyfish.config';
import type { JellyfishJellyDef, JellyfishPlayerDef } from './jellyfish.config';

interface JellyfishPlayer {
  userId: string;
  playerKey: JellyfishPlayerKey;
  name: string;
  avatarColor: AvatarColor;
  targets: number[];
  socketId?: string;
  connected: boolean;
  x: number;
  y: number;
  held: number[];
  score: number;
  exited: boolean;
  exitTimeSec: number | null;
  deadlocksInvolved: number;
  deadlocksThisRound: number;
  rejectedRequests: number;
  rejectedThisRound: number;
  wants: number | null;
  blockedBy: string | null;
  lastMoveAt: number;
  roundScores: number[];
}

interface JellyfishJellyState extends JellyfishJellyDef {
  owner: string | null;
}

interface JellyfishDeadlockRuntime {
  cycleIds: string[];
  endsAt: number;
}

type RoundEndReason = 'TIME_UP' | 'COMPLETE' | 'ABORTED';

export class JellyfishGame {
  private readonly players = new Map<string, JellyfishPlayer>();
  private jellies: JellyfishJellyState[] = [];
  private readonly finishOrder: string[] = [];
  private readonly roundResults: JellyfishRoundEnd[] = [];

  private status: JellyfishStatus = 'idle';
  private round = 0;
  private timeLeft = ROUND_SECONDS;
  private roundEndsAt = 0;
  private lastTick = -1;
  private tickCount = 0;
  private deadlock: JellyfishDeadlockRuntime | null = null;

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEmitAt = 0;
  private finalized = false;

  constructor(
    private readonly io: TypedServer,
    public readonly roomCode: string,
    public readonly roomId: string,
    private readonly hostId: string,
    roomPlayers: RoomPlayerWithUser[],
    private readonly onFinished: (result: JellyfishFinalResult) => void
  ) {
    roomPlayers.slice(0, PLAYER_DEFS.length).forEach((roomPlayer, index) => {
      const def =
        PLAYER_DEFS.find(
          (candidate) => candidate.id === PLAYER_KEY_BY_COLOR[roomPlayer.avatarColor],
        ) || PLAYER_DEFS[index];
      this.players.set(roomPlayer.userId, {
        userId: roomPlayer.userId,
        playerKey: def.id,
        name: roomPlayer.name,
        avatarColor: roomPlayer.avatarColor,
        targets: [...def.targets],
        connected: true,
        x: def.start.x,
        y: def.start.y,
        held: [],
        score: 0,
        exited: false,
        exitTimeSec: null,
        deadlocksInvolved: 0,
        deadlocksThisRound: 0,
        rejectedRequests: 0,
        rejectedThisRound: 0,
        wants: null,
        blockedBy: null,
        lastMoveAt: 0,
        roundScores: [],
      });
    });

    this.jellies = this.buildScenario();
  }

  get isActive(): boolean {
    return this.status !== 'idle' && this.status !== 'game_end';
  }

  get currentRound(): number {
    return this.round;
  }

  get currentStatus(): JellyfishStatus {
    return this.status;
  }

  isHost(userId: string): boolean {
    return this.hostId === userId;
  }

  hasPlayer(userId: string): boolean {
    return this.players.has(userId);
  }

  registerSocket(userId: string, socketId: string): void {
    const player = this.players.get(userId);
    if (!player) return;
    player.socketId = socketId;
    player.connected = true;
  }

  isBoundToSocket(userId: string, socketId: string): boolean {
    const player = this.players.get(userId);
    if (!player) return false;
    return !player.socketId || player.socketId === socketId;
  }

  /** Enters the briefing state for round 1; no timer runs yet. */
  start(): void {
    if (this.status !== 'idle' || this.finalized) return;
    this.prepareRound(1);
    this.status = 'briefing';
    this.timeLeft = ROUND_SECONDS;
    this.emitState(true);
  }

  /** Host-triggered: begin a round, or continue after round_end. */
  startRound(round: number): void {
    if (this.finalized || round < 1 || round > 3) return;
    if (this.status === 'playing' || this.status === 'deadlock_recovery') return;
    if (this.status === 'round_end' && round !== this.round + 1) return;
    if (this.status === 'briefing' && round !== this.round) return;

    this.prepareRound(round);
    this.status = 'playing';
    this.roundEndsAt = Date.now() + ROUND_SECONDS * 1000;

    const config = getRoundConfig(round);
    const payload: JellyfishRoundStart = {
      code: this.roomCode,
      round: config.round,
      algorithm: config.algorithm,
      duration: ROUND_SECONDS,
      timeLeft: ROUND_SECONDS,
      seed: SCENARIO_SEED,
      scenarioId: SCENARIO_ID,
    };
    // Publish the live state first so the round view never renders with a
    // stale/empty snapshot. The start event only switches the client view.
    this.emitState(true);
    this.emit('jellyfish:round_start', payload);

    this.tickTimer = setInterval(() => this.handleTick(), TICK_MS);
  }

  advanceRound(): void {
    if (this.status !== 'round_end' || this.round >= 3) return;
    this.startRound(this.round + 1);
  }

  handleNextRound(userId: string): void {
    if (!this.isHost(userId)) return;
    if (this.status === 'round_end') {
      if (this.round < 3) this.advanceRound();
      else this.finish('COMPLETED');
      return;
    }
    if (this.status === 'briefing') this.startRound(this.round);
  }

  handleMove(userId: string, x: number, y: number): void {
    const player = this.players.get(userId);
    if (!player || !player.connected || player.exited || this.isFrozen(player)) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (this.status !== 'playing' && this.status !== 'deadlock_recovery') return;

    const targetX = clamp(x, PLAYER_MOVE_MARGIN, ARENA_W - PLAYER_MOVE_MARGIN);
    const targetY = clamp(y, PLAYER_MOVE_MARGIN, ARENA_H - PLAYER_MOVE_MARGIN);

    const now = Date.now();
    const elapsed = clamp(
      player.lastMoveAt ? now - player.lastMoveAt : MAX_MOVE_EVENT_MS,
      0,
      MAX_MOVE_EVENT_MS
    );
    player.lastMoveAt = now;

    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const requested = Math.hypot(dx, dy);
    const maxStep = MAX_PLAYER_SPEED_PX_PER_SEC * (elapsed / 1000);

    // Reject impossible jumps: clamp the movement to the server speed budget.
    if (requested > maxStep && requested > 0) {
      const ratio = maxStep / requested;
      player.x += dx * ratio;
      player.y += dy * ratio;
    } else {
      player.x = targetX;
      player.y = targetY;
    }

    this.checkExit(player);
    // State is broadcast on the server tick to avoid move-event broadcast storms.
  }

  handleRequestResource(userId: string, resourceId: number): void {
    const player = this.players.get(userId);
    if (!player || !player.connected || player.exited || this.isFrozen(player)) return;
    if (!Number.isInteger(resourceId) || resourceId < 1 || resourceId > RESOURCE_COUNT) return;
    if (this.status !== 'playing' && this.status !== 'deadlock_recovery') {
      this.emitRequestResult(player, resourceId, false, 'round_over', 'Ronde sudah berakhir.');
      return;
    }

    const jelly = this.jellies.find((item) => item.id === resourceId);
    if (!jelly || !player.targets.includes(resourceId) || player.held.length >= RESOURCES_PER_PLAYER) {
      this.emitRequestResult(player, resourceId, false, 'not_target', 'Bukan resource misi kamu.');
      return;
    }
    if (jelly.owner === userId) {
      this.emitRequestResult(player, resourceId, false, 'already_owned', 'Resource sudah kamu pegang.');
      return;
    }

    if (jelly.owner) {
      // Circular-wait input: only the server builds/uses the wait-for graph.
      player.wants = resourceId;
      player.blockedBy = jelly.owner;
      this.emitRequestResult(
        player,
        resourceId,
        false,
        'blocked',
        `Resource dipegang ${this.players.get(jelly.owner)?.name ?? 'pemain lain'}.`
      );
      this.detectDeadlock();
      this.emitState();
      return;
    }

    if (distance(player, jelly) > CATCH_RADIUS) {
      this.emitRequestResult(player, resourceId, false, 'too_far', 'Resource masih terlalu jauh.');
      return;
    }

    const algorithm = getRoundConfig(this.round).algorithm;
    if (algorithm === 'resource_ordering') {
      const nextTarget = player.targets
        .filter((target) => !player.held.includes(target))
        .sort((a, b) => a - b)[0];
      if (nextTarget !== undefined && resourceId !== nextTarget) {
        this.reject(player, resourceId, 'rejected_order', 'Ambil resource nomor terkecil terlebih dahulu.');
        return;
      }
    } else if (algorithm === 'banker' && !this.isBankerSafe(player, resourceId)) {
      this.reject(player, resourceId, 'rejected_unsafe', 'Alokasi membuat state tidak aman.');
      return;
    }

    jelly.owner = userId;
    jelly.vx = 0;
    jelly.vy = 0;
    player.held.push(resourceId);
    player.wants = null;
    player.blockedBy = null;
    this.emitRequestResult(player, resourceId, true, 'accepted', 'Resource didapat.');
    this.checkExit(player);
    this.emitState();
  }

  handleRelease(userId: string): void {
    const player = this.players.get(userId);
    if (!player || !player.connected || player.exited) return;
    if (this.status !== 'playing' && this.status !== 'deadlock_recovery') return;

    if (this.deadlock?.cycleIds.includes(userId)) {
      // Manual release is an allowed recovery shortcut; still server-decided.
      this.resolveDeadlock();
      return;
    }

    this.releaseResources(player);
    this.clearWaitersFor(player);
    this.emitState();
  }

  removePlayer(userId: string): void {
    const player = this.players.get(userId);
    if (!player) return;

    player.connected = false;
    player.socketId = undefined;
    if (!this.isActive) return;

    if (userId === this.hostId) {
      this.abort('Host keluar. Permainan dibatalkan.');
      return;
    }

    const connected = [...this.players.values()].filter((item) => item.connected).length;
    if (connected < REQUIRED_PLAYERS) {
      this.abort(`Pemain kurang dari ${REQUIRED_PLAYERS}. Permainan dibatalkan.`);
      return;
    }

    this.releaseResources(player);
    this.clearWaitersFor(player);
    this.emitState();
  }

  abort(message: string): void {
    if (!this.isActive || this.finalized) return;
    this.finalized = true;
    this.clearAllTimers();
    this.deadlock = null;
    this.status = 'game_end';
    this.timeLeft = 0;

    const finalStandings = this.finalStandings();
    const payload: JellyfishGameEnd = {
      code: this.roomCode,
      minigame: JELLYFISH_MINIGAME_NUMBER,
      finalStandings,
      roundResults: [...this.roundResults],
      metricsByAlgorithm: [],
      reason: 'ABORTED',
    };
    this.emit('jellyfish:game_end', payload);
    this.emit('toast', {
      type: 'error',
      message,
    });
    this.emit('jellyfish:state', this.snapshot());
    this.onFinished({
      code: this.roomCode,
      roomId: this.roomId,
      minigame: JELLYFISH_MINIGAME_NUMBER,
      finalStandings,
      roundResults: [...this.roundResults],
      metricsByAlgorithm: [],
      reason: 'ABORTED',
    });
  }

  dispose(): void {
    this.clearAllTimers();
    this.finalized = true;
    this.status = 'game_end';
    this.deadlock = null;
  }

  snapshot(): JellyfishSnapshot {
    const algorithm: JellyfishAlgorithm | null =
      this.round > 0 ? getRoundConfig(this.round).algorithm : null;

    return {
      code: this.roomCode,
      minigame: JELLYFISH_MINIGAME_NUMBER,
      round: this.round,
      algorithm,
      status: this.status,
      timeLeft: this.timeLeft,
      seed: SCENARIO_SEED,
      scenarioId: SCENARIO_ID,
      jellies: this.jellySnapshots(),
      players: this.playerSnapshots(),
      deadlock: this.deadlock
        ? {
            cycleIds: [...this.deadlock.cycleIds],
            recoveryMsRemaining: Math.max(0, this.deadlock.endsAt - Date.now()),
          }
        : null,
      finishOrder: [...this.finishOrder],
    };
  }

  private prepareRound(round: number): void {
    this.clearRoundTimers();
    this.round = round;
    this.timeLeft = ROUND_SECONDS;
    this.roundEndsAt = 0;
    this.lastTick = -1;
    this.tickCount = 0;
    this.deadlock = null;
    this.finishOrder.length = 0;
    this.jellies = this.buildScenario();

    const now = Date.now();
    for (const player of this.players.values()) {
      const def = this.playerDef(player);
      player.x = def.start.x;
      player.y = def.start.y;
      player.held = [];
      player.exited = false;
      player.exitTimeSec = null;
      player.deadlocksThisRound = 0;
      player.rejectedThisRound = 0;
      player.wants = null;
      player.blockedBy = null;
      player.lastMoveAt = now;
    }
  }

  private handleTick(): void {
    if (this.status !== 'playing' && this.status !== 'deadlock_recovery') return;

    const now = Date.now();
    this.timeLeft = Math.max(0, Math.ceil((this.roundEndsAt - now) / 1000));
    this.tickCount += 1;
    this.updateJellies();

    for (const player of this.players.values()) {
      if (!player.exited) this.checkExit(player);
    }

    if (this.timeLeft <= 0) {
      this.endRound('TIME_UP');
      return;
    }
    if (this.allPlayersExited()) {
      this.endRound('COMPLETE');
      return;
    }

    if (this.lastTick !== this.timeLeft) this.lastTick = this.timeLeft;
    this.emitState();
  }

  private updateJellies(): void {
    // Scale the frontend's per-120ms drift to the server tick length.
    const step = TICK_MS / 120;
    for (const jelly of this.jellies) {
      if (jelly.owner) continue;

      let vx = jelly.vx + Math.sin(this.tickCount / 5 + jelly.id) * 0.03;
      let vy = jelly.vy + Math.cos(this.tickCount / 6 + jelly.id * 1.3) * 0.03;
      const speed = Math.hypot(vx, vy) || 1;
      if (speed > MAX_JELLY_SPEED) {
        vx = (vx / speed) * MAX_JELLY_SPEED;
        vy = (vy / speed) * MAX_JELLY_SPEED;
      }

      let x = jelly.x + vx * step;
      let y = jelly.y + vy * step;
      const minX = JELLY_MOVE_MARGIN_X;
      const maxX = ARENA_W - JELLY_MOVE_MARGIN_X;
      const minY = JELLY_MOVE_MARGIN_Y;
      const maxY = ARENA_H - JELLY_MOVE_MARGIN_Y;

      if (x < minX || x > maxX) {
        vx = -vx;
        x = clamp(x, minX, maxX);
      }
      if (y < minY || y > maxY) {
        vy = -vy;
        y = clamp(y, minY, maxY);
      }

      jelly.x = x;
      jelly.y = y;
      jelly.vx = vx;
      jelly.vy = vy;
    }
  }

  private checkExit(player: JellyfishPlayer): void {
    if (player.exited || player.held.length < RESOURCES_PER_PLAYER) return;
    if (distance(player, EXIT_POS) >= EXIT_RADIUS) return;

    player.exited = true;
    player.exitTimeSec = Math.round((ROUND_SECONDS - this.timeLeft) * 10) / 10;
    this.finishOrder.push(player.userId);
    // Return the jellies to the arena so other players can still complete,
    // but keep `held` for the round-end score (resources held at the gate).
    this.freeJelliesOf(player);
    this.clearWaitersFor(player);
    this.toast(player.userId, 'Exit gate tercapai!', 'success');
  }

  private allPlayersExited(): boolean {
    return [...this.players.values()].every((player) => player.exited);
  }

  private reject(
    player: JellyfishPlayer,
    resourceId: number,
    reason: JellyfishRequestReason,
    message: string
  ): void {
    player.rejectedRequests += 1;
    player.rejectedThisRound += 1;
    this.emitRequestResult(player, resourceId, false, reason, message);
    this.emitState();
  }

  /** Banker's algorithm: simulate the grant, then search for a safe sequence. */
  private isBankerSafe(player: JellyfishPlayer, resourceId: number): boolean {
    const available = new Set(
      this.jellies.filter((jelly) => !jelly.owner).map((jelly) => jelly.id)
    );
    available.delete(resourceId);

    const allocation = new Map<string, Set<number>>();
    for (const item of this.players.values()) {
      allocation.set(item.userId, new Set(item.held));
    }
    allocation.get(player.userId)?.add(resourceId);

    const need = new Map<string, Set<number>>();
    for (const item of this.players.values()) {
      const held = allocation.get(item.userId) ?? new Set<number>();
      need.set(item.userId, new Set(item.targets.filter((target) => !held.has(target))));
    }

    const work = new Set(available);
    const finished = new Set<string>();
    let progressed = true;

    while (progressed) {
      progressed = false;
      for (const item of this.players.values()) {
        if (finished.has(item.userId)) continue;

        const remaining = need.get(item.userId) ?? new Set<number>();
        let canFinish = true;
        for (const target of remaining) {
          if (!work.has(target)) {
            canFinish = false;
            break;
          }
        }
        if (!canFinish) continue;

        for (const target of allocation.get(item.userId) ?? []) work.add(target);
        finished.add(item.userId);
        progressed = true;
      }
    }

    return finished.size === this.players.size;
  }

  private detectDeadlock(): void {
    if (getRoundConfig(this.round).algorithm !== 'no_prevention') return;
    if (this.deadlock || this.status !== 'playing') return;

    // Wait-for graph: player -> owner of the resource they are waiting for.
    const graph = new Map<string, string>();
    for (const player of this.players.values()) {
      if (player.exited || player.wants === null || !player.blockedBy) continue;
      const jelly = this.jellies.find((item) => item.id === player.wants);
      if (jelly?.owner === player.blockedBy) graph.set(player.userId, player.blockedBy);
    }

    const cycleIds = this.findCycle(graph);
    if (cycleIds && cycleIds.length > 1) this.triggerDeadlock(cycleIds);
  }

  /** DFS over the wait-for graph; returns the circular-wait member IDs. */
  private findCycle(graph: Map<string, string>): string[] | null {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const path: string[] = [];

    const visit = (node: string): string[] | null => {
      if (stack.has(node)) {
        const index = path.indexOf(node);
        return index >= 0 ? path.slice(index) : [node];
      }
      if (visited.has(node) || !graph.has(node)) return null;

      visited.add(node);
      stack.add(node);
      path.push(node);
      const cycle = visit(graph.get(node) ?? '');
      path.pop();
      stack.delete(node);
      return cycle;
    };

    for (const node of graph.keys()) {
      const cycle = visit(node);
      if (cycle && cycle.length > 1) return cycle;
    }
    return null;
  }

  private triggerDeadlock(cycleIds: string[]): void {
    if (this.deadlock || cycleIds.length < 2 || this.status !== 'playing') return;

    const endsAt = Date.now() + DEADLOCK_RECOVERY_MS;
    this.deadlock = { cycleIds: [...cycleIds], endsAt };
    this.status = 'deadlock_recovery';

    const payload: JellyfishDeadlock = {
      code: this.roomCode,
      cycleIds: [...cycleIds],
      recoveryMs: DEADLOCK_RECOVERY_MS,
    };
    this.emit('jellyfish:deadlock', payload);
    this.emitState(true);

    this.recoveryTimer = setTimeout(() => this.resolveDeadlock(), DEADLOCK_RECOVERY_MS);
  }

  private resolveDeadlock(): void {
    const cycleIds = this.deadlock?.cycleIds ?? [];
    this.clearRecoveryTimer();
    this.deadlock = null;

    for (const userId of cycleIds) {
      const player = this.players.get(userId);
      if (!player) continue;
      player.deadlocksInvolved += 1;
      player.deadlocksThisRound += 1;
      this.releaseResources(player);
    }

    for (const player of this.players.values()) {
      if (player.wants !== null && player.blockedBy && cycleIds.includes(player.blockedBy)) {
        player.wants = null;
        player.blockedBy = null;
      }
    }

    if (this.status === 'deadlock_recovery') this.status = 'playing';
    this.emitState(true);
  }

  private freeJelliesOf(player: JellyfishPlayer): void {
    const released = new Set(player.held);
    for (const jelly of this.jellies) {
      if (!released.has(jelly.id) || jelly.owner !== player.userId) continue;
      jelly.owner = null;
      jelly.vx = Math.cos(jelly.id) * 1.4;
      jelly.vy = Math.sin(jelly.id) * 1.4;
    }
  }

  private releaseResources(player: JellyfishPlayer): void {
    this.freeJelliesOf(player);
    player.held = [];
    player.wants = null;
    player.blockedBy = null;
  }

  private clearWaitersFor(player: JellyfishPlayer): void {
    for (const item of this.players.values()) {
      if (item.blockedBy === player.userId) {
        item.wants = null;
        item.blockedBy = null;
      }
    }
  }

  private isFrozen(player: JellyfishPlayer): boolean {
    return Boolean(this.deadlock?.cycleIds.includes(player.userId));
  }

  private endRound(reason: RoundEndReason): void {
    if (this.status !== 'playing' && this.status !== 'deadlock_recovery') return;

    this.clearRoundTimers();
    this.deadlock = null;
    this.status = 'round_end';
    this.timeLeft = 0;

    const algorithm = getRoundConfig(this.round).algorithm;
    const standings = [...this.players.values()]
      .map((player) => {
        const roundScore = calcJellyfishRoundScore({
          heldCount: player.held.length,
          exited: player.exited,
          deadlocksThisRound: player.deadlocksThisRound,
          finishRankIndex: this.finishOrder.indexOf(player.userId),
        });
        player.roundScores[this.round - 1] = roundScore;
        player.score += roundScore;

        return {
          userId: player.userId,
          playerKey: player.playerKey,
          name: player.name,
          avatarColor: player.avatarColor,
          roundScore,
          totalScore: player.score,
          deadlocksInvolved: player.deadlocksThisRound,
          rejectedRequests: player.rejectedThisRound,
          finished: player.exited,
          finishTimeSec: player.exitTimeSec,
        };
      })
      .sort((a, b) => b.roundScore - a.roundScore || b.totalScore - a.totalScore);

    const payload: JellyfishRoundEnd = {
      code: this.roomCode,
      round: this.round,
      algorithm,
      reason,
      standings,
      metrics: this.roundMetrics(),
    };
    this.roundResults.push(payload);
    this.emit('jellyfish:round_end', payload);
    this.emitState(true);

    if (this.round >= 3) this.finish('COMPLETED');
  }

  private roundMetrics() {
    const players = [...this.players.values()];
    const finishTimes = players
      .filter((player) => player.exited && player.exitTimeSec !== null)
      .map((player) => player.exitTimeSec as number);

    return {
      deadlocks: players.reduce((total, player) => total + player.deadlocksThisRound, 0),
      finishedPlayers: finishTimes.length,
      avgFinishTimeSec:
        finishTimes.length > 0
          ? Math.round((finishTimes.reduce((a, b) => a + b, 0) / finishTimes.length) * 10) / 10
          : null,
      rejectedRequests: players.reduce((total, player) => total + player.rejectedThisRound, 0),
    };
  }

  private finish(reason: 'COMPLETED' | 'ABORTED'): void {
    if (this.finalized) return;
    this.finalized = true;
    this.clearAllTimers();
    this.deadlock = null;
    this.status = 'game_end';
    this.timeLeft = 0;

    const finalStandings = this.finalStandings();
    const metricsByAlgorithm = this.metricsByAlgorithm();
    const payload: JellyfishGameEnd = {
      code: this.roomCode,
      minigame: JELLYFISH_MINIGAME_NUMBER,
      finalStandings,
      roundResults: [...this.roundResults],
      metricsByAlgorithm,
      reason,
    };

    console.info('[jellyfish] emit game_end', {
      code: this.roomCode,
      reason,
      finalStandingsCount: finalStandings.length,
      finalStandings: finalStandings.map((s) => ({
        userId: s.userId,
        playerKey: s.playerKey,
        r1: s.r1,
        r2: s.r2,
        r3: s.r3,
        total: s.total,
        rank: s.rank,
      })),
      rounds: this.roundResults.map((r) => ({
        round: r.round,
        algorithm: r.algorithm,
        standings: r.standings.length,
      })),
    });

    this.emit('jellyfish:game_end', payload);
    this.emit('jellyfish:state', this.snapshot());
    this.onFinished({
      code: this.roomCode,
      roomId: this.roomId,
      minigame: JELLYFISH_MINIGAME_NUMBER,
      finalStandings,
      roundResults: [...this.roundResults],
      metricsByAlgorithm,
      reason,
    });
  }

  private finalStandings(): JellyfishFinalStanding[] {
    return [...this.players.values()]
      .map((player) => ({
        userId: player.userId,
        playerKey: player.playerKey,
        name: player.name,
        avatarColor: player.avatarColor,
        r1: player.roundScores[0] ?? 0,
        r2: player.roundScores[1] ?? 0,
        r3: player.roundScores[2] ?? 0,
        total: player.roundScores.reduce((sum, score) => sum + score, 0),
        deadlocks: player.deadlocksInvolved,
        rejectedRequests: player.rejectedRequests,
        completedRounds: player.roundScores.filter((score) => score > 0).length,
      }))
      .sort((a, b) => b.total - a.total || a.playerKey.localeCompare(b.playerKey))
      .map((standing, index) => ({ ...standing, rank: index + 1 }));
  }

  private metricsByAlgorithm() {
    if (this.roundResults.length === 0) return [];

    return JELLYFISH_ROUNDS.map((config) => {
      const results = this.roundResults.filter((result) => result.algorithm === config.algorithm);
      const finishedPlayers = results.reduce(
        (total, result) => total + result.metrics.finishedPlayers,
        0
      );
      const timed = results.filter((result) => result.metrics.avgFinishTimeSec !== null);
      const avgFinishTimeSec =
        timed.length > 0
          ? Math.round(
              (timed.reduce((sum, result) => sum + (result.metrics.avgFinishTimeSec ?? 0), 0) /
                timed.length) *
                10
            ) / 10
          : null;

      return {
        algorithm: config.algorithm,
        deadlocks: results.reduce((total, result) => total + result.metrics.deadlocks, 0),
        finishedPlayers,
        avgFinishTimeSec,
        rejectedRequests: results.reduce(
          (total, result) => total + result.metrics.rejectedRequests,
          0
        ),
      };
    }).filter((metric) => this.roundResults.some((result) => result.algorithm === metric.algorithm));
  }

  private buildScenario(): JellyfishJellyState[] {
    return makeScenario().map((jelly) => ({ ...jelly, owner: null }));
  }

  private playerDef(player: JellyfishPlayer): JellyfishPlayerDef {
    return PLAYER_DEFS.find((def) => def.id === player.playerKey) ?? PLAYER_DEFS[0];
  }

  private jellySnapshots(): JellyfishJellySnapshot[] {
    return this.jellies.map((jelly) => ({
      id: jelly.id,
      x: jelly.x,
      y: jelly.y,
      owner: jelly.owner,
      vx: jelly.vx,
      vy: jelly.vy,
    }));
  }

  private playerSnapshots(): JellyfishPlayerSnapshot[] {
    return [...this.players.values()].map((player) => ({
      userId: player.userId,
      playerKey: player.playerKey,
      name: player.name,
      avatarColor: player.avatarColor,
      x: player.x,
      y: player.y,
      held: [...player.held],
      score: player.score,
      exited: player.exited,
      deadlocksInvolved: player.deadlocksInvolved,
      rejectedRequests: player.rejectedRequests,
      connected: player.connected,
      wants: player.wants,
      blockedBy: player.blockedBy,
    }));
  }

  private emitRequestResult(
    player: JellyfishPlayer,
    resourceId: number,
    ok: boolean,
    reason: JellyfishRequestReason,
    message?: string
  ): void {
    const payload: JellyfishRequestResult = {
      code: this.roomCode,
      userId: player.userId,
      resourceId,
      ok,
      reason,
      message,
    };
    this.emit('jellyfish:request_result', payload);
  }

  private emitState(force = false): void {
    if (this.finalized) return;

    const now = Date.now();
    const minInterval = 100; // max 10 state broadcasts/sec as a safety net

    if (!force) {
      const elapsed = now - this.lastEmitAt;
      if (elapsed < minInterval) {
        if (!this.emitTimer) {
          this.emitTimer = setTimeout(() => {
            this.emitTimer = null;
            this.emitState(true);
          }, minInterval - elapsed);
        }
        return;
      }
    }

    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = null;
    }
    this.lastEmitAt = now;
    this.emit('jellyfish:state', this.snapshot());
  }

  private toast(
    userId: string,
    message: string,
    type: 'error' | 'info' | 'success' = 'info'
  ): void {
    const socketId = this.players.get(userId)?.socketId;
    if (socketId) (this.io.to(socketId) as any).emit('toast', { type, message });
  }

  private emit<K extends keyof import('../../types').ServerToClientEvents>(
    event: K,
    payload: Parameters<import('../../types').ServerToClientEvents[K]>[0]
  ): void {
    (this.io.to(this.roomCode) as any).emit(event, payload);
  }

  private clearRoundTimers(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.clearRecoveryTimer();
    // Reset the throttle so a new round always publishes its initial state.
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = null;
    this.lastEmitAt = 0;
  }

  private clearRecoveryTimer(): void {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
  }

  private clearAllTimers(): void {
    this.clearRoundTimers();
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = null;
  }
}

export function createIdleJellyfishSnapshot(
  roomCode: string,
  roomPlayers: RoomPlayerWithUser[]
): JellyfishSnapshot {
  const players: JellyfishPlayerSnapshot[] = roomPlayers
    .slice(0, PLAYER_DEFS.length)
    .map((roomPlayer, index) => {
      const def =
        PLAYER_DEFS.find(
          (candidate) => candidate.id === PLAYER_KEY_BY_COLOR[roomPlayer.avatarColor],
        ) || PLAYER_DEFS[index];
      return {
        userId: roomPlayer.userId,
        playerKey: def.id,
        name: roomPlayer.name,
        avatarColor: roomPlayer.avatarColor,
        x: def.start.x,
        y: def.start.y,
        held: [],
        score: 0,
        exited: false,
        deadlocksInvolved: 0,
        rejectedRequests: 0,
        connected: true,
        wants: null,
        blockedBy: null,
      };
    });

  return {
    code: roomCode,
    minigame: JELLYFISH_MINIGAME_NUMBER,
    round: 0,
    algorithm: null,
    status: 'idle',
    timeLeft: ROUND_SECONDS,
    seed: SCENARIO_SEED,
    scenarioId: SCENARIO_ID,
    jellies: makeScenario().map((jelly) => ({
      id: jelly.id,
      x: jelly.x,
      y: jelly.y,
      owner: null,
      vx: jelly.vx,
      vy: jelly.vy,
    })),
    players,
    deadlock: null,
    finishOrder: [],
  };
}
