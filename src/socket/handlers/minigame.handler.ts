import { pool } from '../../config/db';
import { getRoomIdByCode, getRoomPlayersWithUsers } from '../../modules/rooms/rooms.service';
import { SOCKET_EVENTS } from '../events';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from '../../types';
import type { TypedServer, TypedSocket } from '../socket';

type MinigameSocket = TypedSocket;

const MINIGAME1_SEAT_KEYS = ['merah', 'kuning', 'biru', 'hijau'] as const;
const completedMinigames = new Set<string>();

function normalizeCode(code: unknown): string | null {
  if (typeof code !== 'string' || !code.trim()) return null;
  return code.trim().toUpperCase();
}

async function getRoomHostId(roomId: string): Promise<string | null> {
  const result = await pool.query<{ hostId: string }>(
    `SELECT host_id as "hostId" FROM rooms WHERE id = $1`,
    [roomId]
  );
  return result.rows[0]?.hostId || null;
}

export function setupMinigameHandlers(io: TypedServer, socket: MinigameSocket) {
  socket.on(SOCKET_EVENTS.CLIENT.MINIGAME_INPUT, async (data) => {
    try {
      if (!data || data.minigame !== 1) return;

      const code = normalizeCode(data.code);
      const userId = socket.data.userId;
      const payloadUserId = typeof data.userId === 'string' ? data.userId : null;
      const key = typeof data.key === 'string' ? data.key.trim().toLowerCase() : '';

      if (!code || !userId || !payloadUserId || payloadUserId !== userId) return;

      const roomId = await getRoomIdByCode(code);
      if (!roomId) return;

      const players = await getRoomPlayersWithUsers(roomId);
      const playerIndex = players.findIndex((p) => p.userId === userId);
      if (playerIndex === -1) return;

      const expectedKey = MINIGAME1_SEAT_KEYS[playerIndex];
      if (!expectedKey || key !== expectedKey) return;

      socket.to(code).emit(SOCKET_EVENTS.SERVER.MINIGAME_INPUT, {
        ...data,
        code,
        userId,
        minigame: 1,
      });
    } catch (error) {
      console.error('minigame:input error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.MINIGAME_STATE, async (data) => {
    try {
      if (!data || data.minigame !== 1) return;

      const code = normalizeCode(data.code);
      const userId = socket.data.userId;
      if (!code || !userId) return;

      const roomId = await getRoomIdByCode(code);
      if (!roomId) return;

      const hostId = await getRoomHostId(roomId);
      if (!hostId || hostId !== userId) return;

      socket.to(code).emit(SOCKET_EVENTS.SERVER.MINIGAME_STATE, {
        ...data,
        code,
        minigame: 1,
      });
    } catch (error) {
      console.error('minigame:state error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.MINIGAME_COMPLETE, async (data) => {
    try {
      if (!data || data.minigame !== 1) return;

      const code = normalizeCode(data.code);
      const userId = socket.data.userId;
      if (!code || !userId) return;

      const roomId = await getRoomIdByCode(code);
      if (!roomId) return;

      const hostId = await getRoomHostId(roomId);
      if (!hostId || hostId !== userId) return;

      const completionKey = `${roomId}:1`;
      if (completedMinigames.has(completionKey)) return;

      const existing = await pool.query(
        `SELECT 1 FROM minigame_scores WHERE room_id = $1 AND minigame_number = 1 LIMIT 1`,
        [roomId]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        completedMinigames.add(completionKey);
        return;
      }

      const players = await getRoomPlayersWithUsers(roomId);
      const memberIds = new Set(players.map((p) => p.userId));
      const scores = Array.isArray(data.scores) ? data.scores : [];
      if (scores.length === 0) return;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const entry of scores) {
          if (!entry || typeof entry.userId !== 'string' || !memberIds.has(entry.userId)) continue;
          const score = Number.isFinite(entry.score) ? Math.trunc(entry.score) : 0;
          const metrics = entry.metrics && typeof entry.metrics === 'object' && !Array.isArray(entry.metrics)
            ? entry.metrics
            : {};
          await client.query(
            `INSERT INTO minigame_scores (room_id, user_id, minigame_number, score, metrics)
             VALUES ($1, $2, 1, $3, $4::jsonb)
             ON CONFLICT (room_id, user_id, minigame_number) DO NOTHING`,
            [roomId, entry.userId, score, JSON.stringify(metrics)]
          );
        }
        await client.query('COMMIT');
        completedMinigames.add(completionKey);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('minigame:complete error:', error);
    }
  });
}
