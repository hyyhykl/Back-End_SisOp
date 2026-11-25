import type { AvatarColor } from '../types';

/**
 * Satu-satunya daftar warna pemain. Urutannya dipakai sebagai kursi room:
 * Merah, Hijau, Biru, Kuning. Backend yang menetapkan warna + nama pemain
 * saat join room, frontend tinggal membaca avatarColor dari payload.
 */
export const AVATAR_COLORS: AvatarColor[] = ['merah', 'hijau', 'biru', 'kuning'];

export const COLOR_NAMES: Record<AvatarColor, string> = {
  merah: 'Merah',
  hijau: 'Hijau',
  biru: 'Biru',
  kuning: 'Kuning',
};

export const COLOR_HEX: Record<AvatarColor, string> = {
  merah: '#FF5A5F',
  hijau: '#2FD07A',
  biru: '#4d8dff',
  kuning: '#ffc22e',
};

export function firstAvailableColor(used: Iterable<AvatarColor>, preferred?: AvatarColor | null): AvatarColor {
  const usedSet = new Set(used);
  if (preferred && AVATAR_COLORS.includes(preferred) && !usedSet.has(preferred)) {
    return preferred;
  }
  return AVATAR_COLORS.find((color) => !usedSet.has(color)) ?? AVATAR_COLORS[0];
}
