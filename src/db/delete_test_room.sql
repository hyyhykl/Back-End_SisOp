










DELETE FROM room_players
WHERE room_id IN (
  SELECT id FROM rooms WHERE code = 'PUBL1C'
);




DELETE FROM rooms
WHERE code = 'PUBL1C';





DELETE FROM users
WHERE name = 'HostTest';

























