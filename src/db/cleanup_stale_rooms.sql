







SELECT r.code, r.name, r.status,
       COUNT(rp.id) AS pemain,
       r.created_at,
       r.updated_at
FROM rooms r
LEFT JOIN room_players rp ON rp.room_id = r.id
GROUP BY r.id, r.code, r.name, r.status, r.created_at, r.updated_at
ORDER BY r.created_at DESC;





SELECT u.name, u.avatar_color, rp.is_host, rp.is_ready, rp.joined_at
FROM room_players rp
JOIN users u ON u.id = rp.user_id
JOIN rooms r ON r.id = rp.room_id
WHERE r.code = 'T85HSW'
ORDER BY rp.joined_at ASC;





UPDATE rooms
SET status = 'finished', updated_at = NOW()
WHERE code = 'T85HSW'
  AND status = 'waiting';





DELETE FROM room_players rp
USING rooms r
WHERE rp.room_id = r.id
  AND r.status = 'finished';






UPDATE rooms
SET status = 'finished', updated_at = NOW()
WHERE status = 'waiting'
  AND created_at < NOW() - INTERVAL '3 hours';




SELECT r.code, r.name, r.status,
       COUNT(rp.id) AS pemain,
       r.created_at
FROM rooms r
LEFT JOIN room_players rp ON rp.room_id = r.id
GROUP BY r.id, r.code, r.name, r.status, r.created_at
ORDER BY r.created_at DESC;
