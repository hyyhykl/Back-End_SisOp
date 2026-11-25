import { REQUIRED_PLAYERS } from '../../config/gameRules';
import { AVATAR_COLORS } from '../../config/playerColors';
import type { Minigame1SnapshotState } from '../../types';
import type { TypedServer } from '../../socket/socket';

/**
 * Server-authoritative replacement for the old host-browser simulator.
 *
 * It reproduces the exact snapshot shape and timing that PurpleGame used to
 * generate locally. Node owns every timer, so a hidden/throttled host window
 * can no longer slow the game down. Only the host UI sends commands; all
 * clients render the same `minigame:state` stream.
 */
const SEAT_KEYS = AVATAR_COLORS;
type SeatKey = (typeof SEAT_KEYS)[number];

const STEP_MS = 60;
const HIT_PAUSE_MS = 180;
const RETURN_STEPS = 6;
const RETURN_MS = RETURN_STEPS * STEP_MS;
const GATE_STEP = 2;
const GATE_WAIT_MS = 320;
const WAIT_ICON_MS = 1000;
const LOCK_HOLD_MS = 1200;
const ROUND_FADE_MS = 650;
const TIMEUP_HOLD_MS = 1800;
const STUN_MS = 2400;
const SEMAPHORE_SLOTS = 2;
const MINIGAME_NUMBER = 1;

type Mode = 'tanpa-aturan' | 'mutex' | 'semaphore';
type Phase = Minigame1SnapshotState['phase'];

interface RoundConfig {
  round: number;
  mode: Mode;
  title: string;
  badge: string;
  nextLabel: string | null;
  duration: number;
}

const ROUNDS: RoundConfig[] = [
  {
    round: 1,
    mode: 'tanpa-aturan',
    title: 'TANPA ATURAN',
    badge: 'Ronde 1/3',
    nextLabel: 'MUTEX',
    duration: 20,
  },
  {
    round: 2,
    mode: 'mutex',
    title: 'MUTEX',
    badge: 'Ronde 2/3',
    nextLabel: 'SEMAPHORE',
    duration: 20,
  },
  {
    round: 3,
    mode: 'semaphore',
    title: 'SEMAPHORE',
    badge: 'Ronde 3/3',
    nextLabel: null,
    duration: 20,
  },
];

export interface Minigame1Player {
  userId: string;
  name: string;
  key: SeatKey;
}

export interface Minigame1ScoreEntry {
  userId: string;
  score: number;
  metrics: Record<string, unknown>;
}

export interface Minigame1FinalResult {
  roomId: string;
  entries: Minigame1ScoreEntry[];
  roundsPlayed: number;
}

const emptyScores = (): Record<string, number> =>
  SEAT_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as Record<string, number>);

const emptyRoundScores = (): Record<string, number[]> =>
  SEAT_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: [0, 0, 0] }),
    {} as Record<string, number[]>,
  );

const emptyFighters = (): Minigame1SnapshotState['fighters'] =>
  SEAT_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: { step: 0, walking: true } }),
    {} as Minigame1SnapshotState['fighters'],
  );

const seatName = (key: string): string =>
  SEAT_KEYS.includes(key as SeatKey) ? key.toUpperCase() : key;

export class Minigame1Game {
  private phase: Phase = 'intro';
  private roundIndex = 0;
  private timeLeft = ROUNDS[0].duration;
  private duration = ROUNDS[0].duration;
  private scores = emptyScores();
  private roundScores = emptyRoundScores();
  private boomCount = 0;
  private boomByRound = [0, 0, 0];
  private boomByPlayer = emptyScores();
  private toast = '';
  private inRing: string[] = [];
  private boom = false;
  private heldSlots: string[] = [];
  private waiting: string[] = [];
  private stunned: string[] = [];
  private fighters = emptyFighters();
  private timeUpActive = false;
  private eventLog: Minigame1SnapshotState['eventLog'] = [];
  private logStep = 0;

  private readonly runId: Record<string, number> = {};
  private readonly lock: Record<string, boolean> = {};
  private readonly hitLock: Record<string, boolean> = {};
  private pendingHits: string[] = [];
  private reservedSlots: string[] = [];
  private hitTimer: ReturnType<typeof setTimeout> | null = null;
  private timeouts = new Set<ReturnType<typeof setTimeout>>();
  private roundTimer: ReturnType<typeof setInterval> | null = null;
  private finished = false;

  constructor(
    private readonly io: TypedServer,
    private readonly code: string,
    private readonly roomId: string,
    private readonly hostId: string,
    private readonly players: Minigame1Player[],
    private readonly onFinished: (result: Minigame1FinalResult) => void,
  ) {}

  get currentPhase(): Phase {
    return this.phase;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  hasPlayer(userId: string): boolean {
    return this.players.some((player) => player.userId === userId);
  }

  keyFor(userId: string): string | null {
    return this.players.find((player) => player.userId === userId)?.key ?? null;
  }

  isHost(userId: string): boolean {
    return userId === this.hostId;
  }

  private schedule(fn: () => void, delay: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      fn();
    }, Math.max(0, delay));
    this.timeouts.add(id);
    return id;
  }

  private clearScheduled(): void {
    this.timeouts.forEach((id) => clearTimeout(id));
    this.timeouts.clear();
    if (this.roundTimer) {
      clearInterval(this.roundTimer);
      this.roundTimer = null;
    }
    this.hitTimer = null;
    Object.keys(this.hitLock).forEach((key) => delete this.hitLock[key]);
  }

  private resetRoundState(): void {
    this.clearScheduled();
    this.timeLeft = this.duration;
    this.timeUpActive = false;
    this.fighters = emptyFighters();
    this.inRing = [];
    this.heldSlots = [];
    this.reservedSlots = [];
    this.waiting = [];
    this.stunned = [];
    this.boom = false;
    this.toast = '';
    this.eventLog = [];
    this.logStep = 0;
    for (const key of SEAT_KEYS) {
      this.runId[key] = 0;
      delete this.lock[key];
      delete this.hitLock[key];
    }
    this.pendingHits = [];
  }

  private resetAllFighters(): void {
    this.fighters = emptyFighters();
    this.inRing = [];
    this.heldSlots = [];
    this.reservedSlots = [];
    this.pendingHits = [];
  }

  private logEvent(message: string): void {
    this.logStep += 1;
    this.eventLog = [
      ...this.eventLog.slice(-3),
      {
        time: `00:${String(this.timeLeft).padStart(2, '0')}`,
        message,
      },
    ];
  }

  private showToast(message: string): void {
    this.toast = message;
    this.schedule(() => {
      this.toast = '';
      this.emitState();
    }, 1500);
  }

  private stunPlayers(keys: string[]): void {
    this.stunned = [...new Set(keys)];
    this.schedule(() => this.clearStun(), STUN_MS);
  }

  private clearStun(): void {
    this.stunned = [];
  }

  private recordScore(key: string, delta: number): void {
    this.scores[key] = (this.scores[key] || 0) + delta;
    const current = this.roundScores[key]?.[this.roundIndex] || 0;
    this.roundScores[key][this.roundIndex] = Math.max(0, current + delta);
  }

  private updateWaiting(keys: string[]): void {
    this.waiting = [...new Set(keys)];
  }

  private addWaiting(key: string): void {
    this.updateWaiting([...this.waiting, key]);
  }

  private removeWaiting(key: string): void {
    this.updateWaiting(this.waiting.filter((item) => item !== key));
  }

  private setFighter(key: string, step: number, walking: boolean): void {
    this.fighters = {
      ...this.fighters,
      [key]: { step, walking },
    };
    this.emitState();
  }

  snapshot(): { code: string; minigame: number; state: Minigame1SnapshotState } {
    return {
      code: this.code,
      minigame: MINIGAME_NUMBER,
      state: {
        phase: this.phase,
        roundIndex: this.roundIndex,
        timeLeft: this.timeLeft,
        scores: { ...this.scores },
        roundScores: Object.fromEntries(
          SEAT_KEYS.map((key) => [key, [...this.roundScores[key]]]),
        ),
        boomCount: this.boomCount,
        boomByRound: [...this.boomByRound],
        boomByPlayer: { ...this.boomByPlayer },
        toast: this.toast,
        inRing: [...this.inRing],
        boom: this.boom,
        heldSlots: [...this.heldSlots],
        waiting: [...this.waiting],
        stunned: [...this.stunned],
        fighters: Object.fromEntries(
          SEAT_KEYS.map((key) => [key, { ...this.fighters[key] }]),
        ),
        walkFrame: 1,
        timeUpActive: this.timeUpActive,
        eventLog: this.eventLog.map((entry) => ({ ...entry })),
        logStep: this.logStep,
      },
    };
  }

  emitState(): void {
    if (this.finished && this.phase === 'intro') return;
    (this.io.to(this.code) as unknown as { emit: (event: string, data: unknown) => void }).emit(
      'minigame:state',
      this.snapshot(),
    );
  }

  syncTo(_userId: string): void {
    this.emitState();
  }

  start(duration?: number): void {
    if (this.phase !== 'intro' || this.finished) return;
    if (typeof duration === 'number' && duration >= 5 && duration <= 60) {
      this.duration = Math.trunc(duration);
    }
    this.phase = 'rule';
    this.emitState();
  }

  beginRound(): void {
    if (this.phase !== 'rule') return;
    this.resetRoundState();
    this.phase = 'arena';
    const round = ROUNDS[this.roundIndex];
    this.logEvent(`Ronde ${round.round} · ${round.title} mulai`);
    this.emitState();
    this.roundTimer = setInterval(() => this.handleTick(), 1000);
  }

  calculated(): void {
    if (this.phase !== 'calculating') return;
    this.phase = 'result';
    this.clearScheduled();
    this.onFinished({
      roomId: this.roomId,
      roundsPlayed: 3,
      entries: SEAT_KEYS.map((key) => {
        const player = this.players.find((item) => item.key === key);
        return {
          userId: player?.userId || key,
          score: this.scores[key] || 0,
          metrics: {
            game: 'stick_brawl',
            roundScores: [...this.roundScores[key]],
            boomCount: this.boomByPlayer[key] || 0,
            roundsPlayed: 3,
            key,
          },
        };
      }),
    });
    this.emitState();
  }

  showSummary(): void {
    if (this.phase !== 'result') return;
    this.phase = 'summary';
    this.emitState();
  }

  backToResult(): void {
    if (this.phase !== 'summary') return;
    this.phase = 'result';
    this.emitState();
  }

  removePlayer(userId: string): void {
    if (!this.hasPlayer(userId)) return;
    if (this.players.length - 1 < REQUIRED_PLAYERS) {
      this.abort(`Pemain kurang dari ${REQUIRED_PLAYERS}. Permainan dibatalkan.`);
      return;
    }
    this.emitState();
  }

  abort(message = 'Permainan dibatalkan.'): void {
    if (this.phase === 'intro' || this.finished) return;
    this.clearScheduled();
    this.phase = 'intro';
    this.toast = message;
    this.emitState();
  }

  dispose(): void {
    this.clearScheduled();
    this.finished = true;
  }

  punch(key: SeatKey): void {
    if (this.phase !== 'arena' || this.timeUpActive) return;
    if (this.stunned.includes(key) || this.lock[key]) return;

    const current = this.fighters[key] || { step: 0, walking: true };
    if (current.step !== 0 || !current.walking) return;

    this.removeWaiting(key);
    const runId = (this.runId[key] || 0) + 1;
    this.runId[key] = runId;
    this.lock[key] = true;
    this.setFighter(key, 0, false);

    const stepMs = STEP_MS;
    const pauseMs = HIT_PAUSE_MS;
    const isActive = () => this.runId[key] === runId;
    let blocked = false;
    const canMove = () => isActive() && !blocked;
    const round = ROUNDS[this.roundIndex];
    const hasGate = round.mode === 'mutex' || round.mode === 'semaphore';
    const capacity = round.mode === 'mutex' ? 1 : SEMAPHORE_SLOTS;

    const moveTo = (step: number, walking: boolean) => {
      if (canMove()) this.setFighter(key, step, walking);
    };

    const walkHome = (fromStep: number, delay: number) => {
      for (let back = 1; back <= fromStep; back += 1) {
        this.schedule(() => {
          if (!canMove()) return;
          const nextStep = fromStep - back;
          moveTo(nextStep, nextStep === 0);
          if (nextStep === 0) {
            this.removeWaiting(key);
            delete this.lock[key];
          }
        }, delay + back * stepMs);
      }
    };

    const blockedAtGate = () => {
      blocked = true;
      this.addWaiting(key);
      this.logEvent(`${seatName(key)} minta kunci → MENUNGGU`);
      this.showToast(
        round.mode === 'mutex'
          ? 'Kunci sedang dipakai! Tunggu.'
          : 'Gerbang penuh! Tunggu giliran.',
      );
      this.schedule(() => {
        if (!isActive()) return;
        this.setFighter(key, 0, true);
        delete this.lock[key];
      }, GATE_WAIT_MS);
      this.schedule(() => {
        if (!isActive()) return;
        this.removeWaiting(key);
        this.emitState();
      }, GATE_WAIT_MS + WAIT_ICON_MS);
      this.emitState();
    };

    const enterAndHold = () => {
      this.reservedSlots = this.reservedSlots.filter((item) => item !== key);
      this.heldSlots = [...new Set([...this.heldSlots, key])];
      this.inRing = [...this.heldSlots];
      this.recordScore(key, 1);
      this.removeWaiting(key);
      this.logEvent(`${seatName(key)} memukul piala`);
      this.emitState();

      this.schedule(() => {
        if (!isActive()) return;
        this.heldSlots = this.heldSlots.filter((item) => item !== key);
        this.inRing = [...this.heldSlots];
        this.logEvent(`${seatName(key)} lepas kunci → kunci bebas`);
        this.emitState();
        walkHome(RETURN_STEPS, 0);
      }, LOCK_HOLD_MS);
    };

    const registerHit = (hitKey: string) => {
      if (this.hitLock[hitKey]) return;
      this.hitLock[hitKey] = true;
      this.inRing = this.inRing.includes(hitKey)
        ? this.inRing
        : [...this.inRing, hitKey];
      this.pendingHits = [...new Set([...this.pendingHits, hitKey])];
      this.emitState();
      if (!this.hitTimer) {
        this.hitTimer = this.schedule(() => this.resolveHits(), HIT_PAUSE_MS);
      }
    };

    for (let step = 1; step <= RETURN_STEPS; step += 1) {
      this.schedule(() => {
        if (!canMove()) return;

        if (hasGate && step === GATE_STEP + 1) {
          const occupied =
            this.reservedSlots.length + this.heldSlots.length;
          if (occupied >= capacity) {
            blockedAtGate();
            return;
          }
          this.reservedSlots = [...this.reservedSlots, key];
          this.logEvent(`${seatName(key)} minta kunci → DIBERI, masuk ring`);
        }

        moveTo(step, false);
        if (step !== RETURN_STEPS) return;

        if (hasGate) {
          enterAndHold();
          return;
        }

        registerHit(key);
        for (let back = 1; back <= RETURN_STEPS; back += 1) {
          this.schedule(() => {
            const nextStep = RETURN_STEPS - back;
            moveTo(nextStep, nextStep === 0);
            if (nextStep === 0) delete this.lock[key];
          }, pauseMs + back * stepMs);
        }
      }, step * stepMs);
    }
  }

  private resolveHits(): void {
    this.hitTimer = null;
    const hits = this.pendingHits.slice();
    this.pendingHits = [];
    if (!hits.length) return;

    if (hits.length >= 2) {
      this.resetAllFighters();
      this.stunPlayers(hits);
      this.boom = true;
      this.boomCount += 1;
      this.boomByRound[this.roundIndex] += 1;
      hits.forEach((key) => {
        this.boomByPlayer[key] = (this.boomByPlayer[key] || 0) + 1;
      });
      this.showToast('RACE CONDITION! BOOM!');
      this.logEvent(`BOOM! ${hits.map((key) => seatName(key)).join(' + ')} tabrakan`);
      this.schedule(() => {
        this.boom = false;
        this.emitState();
      }, 850);
      this.emitState();
      return;
    }

    const key = hits[0];
    delete this.hitLock[key];
    this.recordScore(key, 1);
    this.logEvent(`${seatName(key)} memukul piala +1`);
    this.emitState();
  }

  private handleTick(): void {
    if (this.phase !== 'arena' || this.timeUpActive) return;
    if (this.timeLeft <= 1) {
      this.timeLeft = 0;
      this.timeUpActive = true;
      this.emitState();
      this.schedule(
        () => this.advanceFromTimeUp(),
        ROUND_FADE_MS + TIMEUP_HOLD_MS,
      );
      if (this.roundTimer) {
        clearInterval(this.roundTimer);
        this.roundTimer = null;
      }
      return;
    }
    this.timeLeft -= 1;
    this.emitState();
  }

  private advanceFromTimeUp(): void {
    if (this.roundIndex < ROUNDS.length - 1) {
      this.roundIndex += 1;
      this.resetRoundState();
      this.phase = 'rule';
      this.emitState();
      return;
    }
    this.resetRoundState();
    this.phase = 'calculating';
    this.emitState();
  }
}
