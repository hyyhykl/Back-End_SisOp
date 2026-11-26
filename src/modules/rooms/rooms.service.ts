import type { PoolClient } from 'pg';
import { pool } from '../../config/db';
import { generateUniqueRoomCode } from '../../utils/roomCode';
import {
  AVATAR_COLORS,
  COLOR_NAMES,
  firstAvailableColor,
} from '../../config/playerColors';
import {
  AvatarColor,
  Room,
  PublicRoomInfo,
  RoomDetailResponse,
  RoomPlayerWithUser,
  CreateRoomRequest,
  CreateRoomResponse,
} from '../../types';

type QueryClient = PoolClient;


async function assignPlayerColor(
  client: QueryClient,
  userId: string,
  color: AvatarColor,
): Promise<void> {
  await client.query(
    `UPDATE users SET name = $1, avatar_color = $2 WHERE id = $3`,
    [COLOR_NAMES[color], color, userId],
  );
}

export async function createRoom(data: CreateRoomRequest): Promise<CreateRoomResponse> {
  const { name, isPrivate, userId } = data;

  const code = await generateUniqueRoomCode(pool);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    
    
    await client.query(
      `UPDATE rooms SET status = 'finished', updated_at = NOW() WHERE host_id = $1 AND status = 'waiting'`,
      [userId]
    );
    
    await client.query(
      `DELETE FROM room_players WHERE user_id = $1`,
      [userId]
    );

    
    const roomResult = await client.query<CreateRoomResponse>(
      `INSERT INTO rooms (code, name, is_private, host_id) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id as "roomId", code, name, is_private as "isPrivate", max_players as "maxPlayers", host_id as "hostId"`,
      [code, name.trim(), isPrivate, userId]
    );
    const room = roomResult.rows[0];

    
    await client.query(
      `INSERT INTO room_players (room_id, user_id, is_host, is_ready) VALUES ($1, $2, true, true)`,
      [room.roomId, userId]
    );
    await assignPlayerColor(client, userId, AVATAR_COLORS[0]);

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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    
    await client.query(`SELECT id FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]);

    const existing = await client.query<RoomPlayerWithUser>(
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
       WHERE rp.room_id = $1 AND rp.user_id = $2`,
      [roomId, userId]
    );

    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return existing.rows[0];
    }

    const usedColors = await client.query<{ avatarColor: AvatarColor }>(
      `SELECT u.avatar_color as "avatarColor"
       FROM room_players rp
       JOIN users u ON rp.user_id = u.id
       WHERE rp.room_id = $1`,
      [roomId]
    );
    const userResult = await client.query<{ avatarColor: AvatarColor }>(
      `SELECT avatar_color as "avatarColor" FROM users WHERE id = $1`,
      [userId]
    );

    const color = firstAvailableColor(
      usedColors.rows.map((row) => row.avatarColor),
      userResult.rows[0]?.avatarColor,
    );

    
    const result = await client.query<RoomPlayerWithUser>(
      `INSERT INTO room_players (room_id, user_id, is_host, is_ready)
       VALUES ($1, $2, false, false)
       RETURNING id, room_id as "roomId", user_id as "userId", is_host as "isHost", is_ready as "isReady", joined_at as "joinedAt"`,
      [roomId, userId]
    );

    await assignPlayerColor(client, userId, color);
    await client.query('COMMIT');

    const row = result.rows[0];
    if (!row) return null;

    return {
      ...row,
      name: COLOR_NAMES[color],
      avatarColor: color,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
  
  const hostCheck = await pool.query(
    `SELECT 1 FROM rooms WHERE id = $1 AND host_id = $2`,
    [roomId, hostId]
  );
  if (hostCheck.rows.length === 0) return false;

  
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