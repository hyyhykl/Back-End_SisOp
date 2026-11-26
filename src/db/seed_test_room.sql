




WITH new_host AS (
  INSERT INTO users (name, avatar_color)
  VALUES ('HostTest', 'merah')
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









