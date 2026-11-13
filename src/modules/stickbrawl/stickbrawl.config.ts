import { StickBrawlRoundMode } from '../../types';

export interface StickBrawlRoundConfig {
  round: number;
  mode: StickBrawlRoundMode;
  title: string;
  rules: string;
  capacity: number;
}

export const STICK_BRAWL_CONFIG = {
  totalRounds: 3,
  roundDurationSeconds: 20,
  roundBreakSeconds: 5,
  startCountdownSeconds: 3,
  successPoints: 100,
  explosionPenalty: 25,
  raceWindowMs: 200,
  grabHoldMs: 800,
  cooldownMs: 900,
  stunMs: 1500,
} as const;

export const STICK_BRAWL_ROUNDS: StickBrawlRoundConfig[] = [
  {
    round: 1,
    mode: 'race',
    title: 'Ronde 1 - Tanpa Aturan',
    rules: 'Bebas masuk ke area peti. Jika lebih dari 1 pemain masuk bersamaan, peti meledak dan semua pemain yang terlibat kehilangan poin.',
    capacity: 1,
  },
  {
    round: 2,
    mode: 'mutex',
    title: 'Ronde 2 - Mutex',
    rules: 'Hanya 1 pemain yang boleh berada di area peti. Pemain lain otomatis antre dan mendapat giliran setelah peti dilepas.',
    capacity: 1,
  },
  {
    round: 3,
    mode: 'semaphore',
    title: 'Ronde 3 - Semaphore',
    rules: 'Maksimal 2 pemain boleh berada di area peti bersamaan. Pemain lain menunggu di antrean sampai ada slot kosong.',
    capacity: 2,
  },
];

export function getRoundConfig(round: number): StickBrawlRoundConfig {
  return STICK_BRAWL_ROUNDS[round - 1] ?? STICK_BRAWL_ROUNDS[0];
}
