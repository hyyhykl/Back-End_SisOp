-- ================================================
-- DELETE SEED TEST ROOM - Membersihkan data hasil seed_test_room.sql
-- Jalankan di Supabase SQL Editor
-- ================================================

-- Urutan hapus: room_players -> rooms -> users (ikut FK constraint)
-- (Sebenarnya ON DELETE CASCADE sudah ada, tapi eksplisit lebih aman)

-- ================================================
-- 1. HAPUS PLAYER DI Dalam ROOM TEST
-- ================================================
DELETE FROM room_players
WHERE room_id IN (
  SELECT id FROM rooms WHERE code = 'PUBL1C'
);

-- ================================================
-- 2. HAPUS ROOM TEST
-- ================================================
DELETE FROM rooms
WHERE code = 'PUBL1C';

-- ================================================
-- 3. HAPUS USER HOST TEST
-- (kalau seed dijalankan berkali-kali, ada beberapa HostTest)
-- ================================================
DELETE FROM users
WHERE name = 'HostTest';

-- ================================================
-- VERIFIKASI (harus 0 semua)
-- ================================================
-- SELECT COUNT(*) FROM rooms WHERE code = 'PUBL1C';
-- SELECT COUNT(*) FROM users WHERE name = 'HostTest';
-- SELECT COUNT(*) FROM room_players rp
-- JOIN rooms r ON rp.room_id = r.id
-- WHERE r.code = 'PUBL1C';

-- ================================================
-- VERSI SINGKAT (alternatif, 1 baris aja)
-- Karena ON DELETE CASCADE: hapus user -> room & room_players ikut terhapus
-- ================================================
-- DELETE FROM users WHERE name = 'HostTest';

-- ================================================
-- NUCLEAR OPTION: HAPUS SEMUA DATA (reset total database)
-- Kalau mau bersihin semua room test + skor + history
-- ================================================
-- DELETE FROM game_history;
-- DELETE FROM minigame_scores;
-- DELETE FROM room_players;
-- DELETE FROM rooms;
-- DELETE FROM users;
