import { getIO } from './socket';

/**
 * Beri tahu semua klien bahwa daftar room publik berubah.
 *
 * Event ini HANYA sinyal, tanpa data. Frontend yang mendengarkan tinggal
 * memanggil GET /api/rooms untuk mengambil data terbaru.
 *
 * Dipanggil setiap: room dibuat, room bubar, pemain join, pemain keluar/kick,
 * dan turnamen mulai (room hilang dari daftar publik).
 */
export function notifyRoomsUpdated(): void {
  try {
    getIO().emit('rooms:updated');
  } catch {
    // Socket.io belum diinisialisasi (misal dipanggil dari test/CLI) — abaikan.
  }
}
