import type {
  AvatarColor,
  JellyfishAlgorithm,
  JellyfishPlayerKey,
} from '../../types';

export const JELLYFISH_MINIGAME_NUMBER = 2;

export const SCENARIO_SEED = 48213;
export const SCENARIO_ID = `jellyfish-${SCENARIO_SEED}`;
export const ROUND_SECONDS = 30;
export const TICK_MS = 200;
export const DEADLOCK_RECOVERY_MS = 2000;

export const ARENA_W = 374;
export const ARENA_H = 547.36;
export const CATCH_RADIUS = 34;
export const EXIT_POS = { x: 185, y: 273 };
export const EXIT_RADIUS = 34;

export const PLAYER_MOVE_MARGIN = 20;
export const MAX_PLAYER_SPEED_PX_PER_SEC = 360;
export const MAX_MOVE_EVENT_MS = 300;

export const JELLY_MOVE_MARGIN_X = 36;
export const JELLY_MOVE_MARGIN_Y = 52;
export const MAX_JELLY_SPEED = 2.8;

export const RESOURCE_COUNT = 12;
export const RESOURCES_PER_PLAYER = 6;

export interface JellyfishPlayerDef {
  id: JellyfishPlayerKey;
  name: string;
  color: string;
  text: string;
  start: { x: number; y: number };
  targets: number[];
}

export interface JellyfishJellyDef {
  id: number;
  x: number;
  y: number;
  color: string;
  vx: number;
  vy: number;
}

export interface JellyfishRoundConfig {
  round: number;
  algorithm: JellyfishAlgorithm;
  title: string;
  rules: string;
}

export const PLAYER_DEFS: JellyfishPlayerDef[] = [
  {
    id: 'P1',
    name: 'Merah',
    color: '#FF5A5F',
    text: '#fff',
    start: { x: 139, y: 426 },
    targets: [2, 3, 4, 5, 6, 7],
  },
  {
    id: 'P2',
    name: 'Hijau',
    color: '#2FD07A',
    text: '#fff',
    start: { x: 214, y: 426 },
    targets: [4, 5, 6, 7, 8, 9],
  },
  {
    id: 'P3',
    name: 'Biru',
    color: '#4d8dff',
    text: '#fff',
    start: { x: 139, y: 102 },
    targets: [7, 8, 9, 10, 11, 12],
  },
  {
    id: 'P4',
    name: 'Kuning',
    color: '#ffc22e',
    text: '#06203a',
    start: { x: 289, y: 264 },
    targets: [10, 11, 12, 1, 2, 3],
  },
];

export const PLAYER_KEY_BY_COLOR: Record<AvatarColor, JellyfishPlayerKey> = {
  merah: 'P1',
  hijau: 'P2',
  biru: 'P3',
  kuning: 'P4',
};

export const JELLY_COLORS: Record<number, string> = {
  1: '#4f8cff', 2: '#4f8cff', 3: '#4f8cff', 4: '#4f8cff',
  5: '#ff6b6b', 6: '#ff6b6b', 7: '#3ddc84', 8: '#3ddc84',
  9: '#3ddc84', 10: '#ffc93c', 11: '#ffc93c', 12: '#ffc93c',
};

export const JELLYFISH_ROUNDS: JellyfishRoundConfig[] = [
  {
    round: 1,
    algorithm: 'no_prevention',
    title: 'Ronde 1 - Tanpa Pencegahan',
    rules: 'Ambil resource bebas. Deadlock dideteksi dari circular wait, lalu recovery otomatis setelah 2 detik.',
  },
  {
    round: 2,
    algorithm: 'resource_ordering',
    title: 'Ronde 2 - Resource Ordering',
    rules: 'Resource wajib diambil berurutan dari nomor terkecil. Request di luar urutan ditolak.',
  },
  {
    round: 3,
    algorithm: 'banker',
    title: 'Ronde 3 - Banker Algorithm',
    rules: 'Setiap alokasi disimulasikan. Request yang membuat state tidak aman ditolak.',
  },
];

export function getRoundConfig(round: number): JellyfishRoundConfig {
  return JELLYFISH_ROUNDS[round - 1] ?? JELLYFISH_ROUNDS[0];
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeScenario(seed: number = SCENARIO_SEED): JellyfishJellyDef[] {
  const rand = mulberry32(seed);
  const minX = 44;
  const maxX = ARENA_W - 44;
  const minY = 54;
  const maxY = ARENA_H - 54;
  const minDistPlayer = 95;
  const minDistExit = 90;
  const minDistJelly = 58;
  const placed: Array<{ x: number; y: number }> = [];

  const jellies: JellyfishJellyDef[] = [];
  for (let i = 0; i < RESOURCE_COUNT; i += 1) {
    const id = i + 1;
    let x = minX;
    let y = minY;

    for (let attempt = 0; attempt < 300; attempt += 1) {
      const cx = minX + rand() * (maxX - minX);
      const cy = minY + rand() * (maxY - minY);
      const tooClosePlayer = PLAYER_DEFS.some(
        (p) => distance({ x: cx, y: cy }, p.start) < minDistPlayer
      );
      const tooCloseExit = distance({ x: cx, y: cy }, EXIT_POS) < minDistExit;
      const tooCloseJelly = placed.some((p) => distance({ x: cx, y: cy }, p) < minDistJelly);

      if (!tooClosePlayer && !tooCloseExit && !tooCloseJelly) {
        x = cx;
        y = cy;
        break;
      }
    }

    placed.push({ x, y });
    const angle = rand() * Math.PI * 2;
    const speed = 1.6 + rand() * 1.2;
    jellies.push({
      id,
      x,
      y,
      color: JELLY_COLORS[id],
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }

  return jellies;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface JellyfishScoreInput {
  heldCount: number;
  exited: boolean;
  deadlocksThisRound: number;
  finishRankIndex: number;
}

export function calcJellyfishRoundScore(input: JellyfishScoreInput): number {
  const base = 100;
  const resourceBonus = input.heldCount * 50;
  const finishedBonus = input.exited ? 200 : 0;
  const deadlockPenalty = input.deadlocksThisRound * 15;
  const noDeadlockBonus = input.deadlocksThisRound === 0 ? 100 : 0;
  const speedBonus = [100, 75, 50, 25][input.finishRankIndex] ?? 0;

  return Math.max(
    0,
    base + resourceBonus + finishedBonus - deadlockPenalty + noDeadlockBonus + speedBonus
  );
}
