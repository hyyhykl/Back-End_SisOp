-- ================================================
-- CEK & BERSIHKAN ROOM "GAIB"
-- Jalankan di Supabase SQL Editor
-- ================================================

-- ================================================
-- 1. LIHAT SEMUA ROOM + JUMLAH PEMAIN
-- ================================================
SELECT r.code, r.name, r.status,
       COUNT(rp.id) AS pemain,
       r.created_at,
       r.updated_at
FROM rooms r
LEFT JOIN room_players rp ON rp.room_id = r.id
GROUP BY r.id, r.code, r.name, r.status, r.created_at, r.updated_at
ORDER BY r.created_at DESC;

-- ================================================
-- 2. SIAPA SAJA YANG MASIH TERCATAT DI SATU ROOM
-- Ganti 'T85HSW' dengan kode room yang dicek
-- ================================================
SELECT u.name, u.avatar_color, rp.is_host, rp.is_ready, rp.joined_at
FROM room_players rp
JOIN users u ON u.id = rp.user_id
JOIN rooms r ON r.id = rp.room_id
WHERE r.code = 'T85HSW'
ORDER BY rp.joined_at ASC;

-- ================================================
-- 3. BUBARKAN SATU ROOM TERTENTU (room gaib)
-- Room TIDAK dihapus, hanya ditandai finished
-- ================================================
UPDATE rooms
SET status = 'finished', updated_at = NOW()
WHERE code = 'T85HSW'
  AND status = 'waiting';

-- ================================================
-- 4. HAPUS SEMUA MEMBERSHIP YATIM
-- User yang tercatat di room yang sudah finished
-- ================================================
DELETE FROM room_players rp
USING rooms r
WHERE rp.room_id = r.id
  AND r.status = 'finished';

-- ================================================
-- 5. BUBARKAN SEMUA ROOM LAMA (lebih dari 3 jam)
-- Ini yang juga dijalankan otomatis oleh server
-- setiap start + tiap 30 menit
-- ================================================
UPDATE rooms
SET status = 'finished', updated_at = NOW()
WHERE status = 'waiting'
  AND created_at < NOW() - INTERVAL '3 hours';

-- ================================================
-- 6. VERIFIKASI: harusnya hanya room aktif yang tersisa
-- ================================================
SELECT r.code, r.name, r.status,
       COUNT(rp.id) AS pemain,
       r.created_at
FROM rooms r
LEFT JOIN room_players rp ON rp.room_id = r.id
GROUP BY r.id, r.code, r.name, r.status, r.created_at
ORDER BY r.created_at DESC;
