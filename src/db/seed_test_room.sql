-- ================================================
-- SEED TEST ROOM - Untuk Testing Manual di Supabase SQL Editor
-- Jalankan sekali, buat 1 user host + 1 room publik + 3 slot kosong
-- ================================================

WITH new_host AS (
  INSERT INTO users (name, avatar_color)
  VALUES ('HostTest', 'pink')
  RETURNING id
),
new_room AS (
  INSERT INTO rooms (code, name, is_private, host_id, max_players, status)
  SELECT 'PUBL1C', 'Room Publik Test', false, id, 4, 'waiting'
  FROM new_host
  RETURNING id, code, name
)
INSERT INTO room_players (room_id, user_id, is_host, is_ready)
SELECT new_room.id, new_host.id, true, true
FROM new_room, new_host
RETURNING *;

-- ================================================
-- VERIFIKASI
-- ================================================
-- SELECT r.code, r.name, r.is_private, r.status,
--        COUNT(rp.id) as current_players, r.max_players
-- FROM rooms r
-- LEFT JOIN room_players rp ON r.id = rp.room_id
-- WHERE r.code = 'PUBL1C'
-- GROUP BY r.id;