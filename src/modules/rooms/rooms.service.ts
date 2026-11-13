import { pool } from '../../config/db';
import { generateUniqueRoomCode } from '../../utils/roomCode';
import {
  Room,
  PublicRoomInfo,
  RoomDetailResponse,
  RoomPlayerWithUser,
  CreateRoomRequest,
  CreateRoomResponse,
} from '../../types';

export async function createRoom(data: CreateRoomRequest): Promise<CreateRoomResponse> {
  const { name, isPrivate, userId } = data;

  const code = await generateUniqueRoomCode(pool);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // AUTO-LEAVE: user tidak boleh jadi anggota 2 room sekaligus.
    // 1. Bubarkan room lama yang masih 'waiting' dan di-host user ini.
    await client.query(
      `UPDATE rooms SET status = 'finished', updated_at = NOW() WHERE host_id = $1 AND status = 'waiting'`,
      [userId]
    );
    // 2. Hapus membership lama user di semua room.
    await client.query(
      `DELETE FROM room_players WHERE user_id = $1`,
      [userId]
    );

    // Create room
    const roomResult = await client.query<CreateRoomResponse>(
      `INSERT INTO rooms (code, name, is_private, host_id) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id as "roomId", code, name, is_private as "isPrivate", max_players as "maxPlayers", host_id as "hostId"`,
      [code, name.trim(), isPrivate, userId]
    );
    const room = roomResult.rows[0];

    // Add host as first player
    await client.query(
      `INSERT INTO room_players (room_id, user_id, is_host, is_ready) VALUES ($1, $2, true, true)`,
      [room.roomId, userId]
    );

    await client.query('COMMIT');
    return room;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getPublicRooms(): Promise<PublicRoomInfo[]> {
  const result = await pool.query<PublicRoomInfo>(
    `SELECT 
      r.id as "roomId",
      r.code,
      r.name,
      COUNT(rp.id) as "currentPlayers",
      r.max_players as "maxPlayers"
     FROM rooms r
     LEFT JOIN room_players rp ON r.id = rp.room_id
     WHERE r.is_private = false 
       AND r.status = 'waiting'
     GROUP BY r.id, r.code, r.name, r.max_players
     HAVING COUNT(rp.id) < r.max_players
     ORDER BY r.created_at DESC`
  );
  return result.rows;
}

export async function getRoomByCode(code: string): Promise<RoomDetailResponse | null> {
  const result = await pool.query<RoomDetailResponse>(
    `SELECT 
      r.id as "roomId",
      r.code,
      r.name,
      r.status,
      COUNT(rp.id) as "currentPlayers",
      r.max_players as "maxPlayers"
     FROM rooms r
     LEFT JOIN room_players rp ON r.id = rp.room_id
     WHERE r.code = $1
     GROUP BY r.id, r.code, r.name, r.status, r.max_players`,
    [code.toUpperCase()]
  );
  return result.rows[0] || null;
}

export async function getRoomPlayersWithUsers(roomId: string): Promise<RoomPlayerWithUser[]> {
  const result = await pool.query<RoomPlayerWithUser>(
    `SELECT 
      rp.id,
      rp.room_id as "roomId",
      rp.user_id as "userId",
      rp.is_host as "isHost",
      rp.is_ready as "isReady",
      rp.joined_at as "joinedAt",
      u.name,
      u.avatar_color as "avatarColor"
     FROM room_players rp
     JOIN users u ON rp.user_id = u.id
     WHERE rp.room_id = $1
     ORDER BY rp.joined_at ASC`,
    [roomId]
  );
  return result.rows;
}

export async function addPlayerToRoom(roomId: string, userId: string): Promise<RoomPlayerWithUser | null> {
  const result = await pool.query<RoomPlayerWithUser>(
    // ON CONFLICT: jangan reset is_ready. Saat host membuka halaman room,
    // baris room_players-nya sudah ada (dibuat createRoom dengan is_ready = true).
    // Kalau di-reset, host dianggap "belum siap" selamanya karena host tidak
    // punya tombol siap.
    `INSERT INTO room_players (room_id, user_id, is_host, is_ready)
     VALUES ($1, $2, false, false)
     ON CONFLICT (room_id, user_id) DO UPDATE SET is_ready = room_players.is_ready
     RETURNING id, room_id as "roomId", user_id as "userId", is_host as "isHost", is_ready as "isReady", joined_at as "joinedAt"`,
    [roomId, userId]
  );

  if (result.rows.length === 0) return null;

  // Get user info
  const userResult = await pool.query(
    `SELECT name, avatar_color as "avatarColor" FROM users WHERE id = $1`,
    [userId]
  );

  return {
    ...result.rows[0],
    name: userResult.rows[0]?.name || '',
    avatarColor: userResult.rows[0]?.avatarColor || 'pink',
  };
}

export async function removePlayerFromRoom(roomId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM room_players WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  return (result.rowCount || 0) > 0;
}

export async function setPlayerReady(roomId: string, userId: string, isReady: boolean): Promise<boolean> {
  const result = await pool.query(
    `UPDATE room_players SET is_ready = $1 WHERE room_id = $2 AND user_id = $3`,
    [isReady, roomId, userId]
  );
  return (result.rowCount || 0) > 0;
}

export async function kickPlayer(roomId: string, hostId: string, targetUserId: string): Promise<boolean> {
  // Verify host
  const hostCheck = await pool.query(
    `SELECT 1 FROM rooms WHERE id = $1 AND host_id = $2`,
    [roomId, hostId]
  );
  if (hostCheck.rows.length === 0) return false;

  // Cannot kick host
  const targetCheck = await pool.query(
    `SELECT 1 FROM room_players WHERE room_id = $1 AND user_id = $2 AND is_host = true`,
    [roomId, targetUserId]
  );
  if (targetCheck.rows.length > 0) return false;

  const result = await pool.query(
    `DELETE FROM room_players WHERE room_id = $1 AND user_id = $2`,
    [roomId, targetUserId]
  );
  return (result.rowCount || 0) > 0;
}

export async function getRoomIdByCode(code: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM rooms WHERE code = $1`,
    [code.toUpperCase()]
  );
  return result.rows[0]?.id || null;
}

export async function startTournament(roomId: string, hostId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE rooms SET status = 'starting', current_minigame = 1, updated_at = NOW() 
     WHERE id = $1 AND host_id = $2 AND status = 'waiting'`,
    [roomId, hostId]
  );
  return (result.rowCount || 0) > 0;
}

export async function checkAllPlayersReady(roomId: string): Promise<boolean> {
  // Host tidak pernah "siap" (tidak ada tombol siap untuk host), jadi yang
  // dihitung hanya tamu. Minimal 2 pemain sudah dicek terpisah oleh handler.
  const result = await pool.query(
    `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_ready = true) as ready
     FROM room_players WHERE room_id = $1 AND is_host = false`,
    [roomId]
  );
  const { total, ready } = result.rows[0];
  const guestTotal = parseInt(total);
  return guestTotal > 0 && guestTotal === parseInt(ready);
}

export async function getPlayerCount(roomId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM room_players WHERE room_id = $1`,
    [roomId]
  );
  return parseInt(result.rows[0].count);
}

/**
 * Bersihkan room "gaib": room berstatus waiting yang dibuat sudah terlalu lama
 * tapi host-nya tidak pernah kembali (misal tab ditutup sebelum socket connect,
 * atau host hilang tanpa memicu event disconnect).
 *
 * Dipanggil saat server start + berkala.
 */
export async function cleanupStaleRooms(maxAgeHours = 3): Promise<number> {
  const result = await pool.query(
    `UPDATE rooms
     SET status = 'finished', updated_at = NOW()
     WHERE status = 'waiting'
       AND created_at < NOW() - ($1 || ' hours')::interval
     RETURNING id`,
    [maxAgeHours]
  );
  return result.rowCount || 0;
}