import { pool } from '../../config/db';
import { REQUIRED_PLAYERS, PLAYERS_REQUIRED_MESSAGE } from '../../config/gameRules';
import { AVATAR_COLORS } from '../../config/playerColors';
import {
  checkAllPlayersReady,
  getRoomIdByCode,
  getRoomPlayersWithUsers,
} from '../../modules/rooms/rooms.service';
import {
  markStickBrawlRoomPlaying,
} from '../../modules/stickbrawl/stickbrawl.service';
import {
  Minigame1Game,
  type Minigame1Player,
  type Minigame1ScoreEntry,
} from '../../modules/stickbrawl/stickbrawl.authoritative.game';
import { SOCKET_EVENTS } from '../events';
import type { TypedServer, TypedSocket } from '../socket';

type MinigameSocket = TypedSocket;

const MINIGAME1_SEAT_KEYS = AVATAR_COLORS;
const completedMinigames = new Set<string>();
const games = new Map<string, Minigame1Game>();

interface MinigameRoomCache {
  roomId: string;
  hostId: string | null;
  memberKeyByUserId: Map<string, string>;
  expiresAt: number;
}

const roomCache = new Map<string, MinigameRoomCache>();
const ROOM_CACHE_TTL_MS = 15_000;

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

async function getCachedRoom(code: string): Promise<MinigameRoomCache | null> {
  const now = Date.now();
  const cached = roomCache.get(code);
  if (cached && cached.expiresAt > now) return cached;

  const roomId = await getRoomIdByCode(code);
  if (!roomId) {
    roomCache.delete(code);
    return null;
  }

  const [hostId, players] = await Promise.all([
    getRoomHostId(roomId),
    getRoomPlayersWithUsers(roomId),
  ]);

  const memberKeyByUserId = new Map<string, string>();
  players.forEach((player, index) => {

    const key = player.avatarColor || MINIGAME1_SEAT_KEYS[index];
    if (key) memberKeyByUserId.set(player.userId, key);
  });

  const entry: MinigameRoomCache = {
    roomId,
    hostId,
    memberKeyByUserId,
    expiresAt: now + ROOM_CACHE_TTL_MS,
  };
  roomCache.set(code, entry);
  return entry;
}

function invalidateRoomCache(code: string): void {
  roomCache.delete(code);
}

export function resetMinigameRoom(roomId: string, code: string): void {
  const upperCode = normalizeCode(code);
  if (upperCode) {
    const game = games.get(upperCode);
    if (game) game.dispose();
    games.delete(upperCode);
    invalidateRoomCache(upperCode);
  }
  completedMinigames.delete(`${roomId}:1`);
}

async function persistScores(roomId: string, entries: Minigame1ScoreEntry[]): Promise<void> {
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const entry of entries) {
      const score = Number.isFinite(entry.score) ? Math.trunc(entry.score) : 0;
      const metrics =
        entry.metrics && typeof entry.metrics === 'object' && !Array.isArray(entry.metrics)
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
}

async function buildPlayers(roomId: string): Promise<Minigame1Player[]> {
  const rows = await getRoomPlayersWithUsers(roomId);
  return rows.slice(0, MINIGAME1_SEAT_KEYS.length).map((player, index) => ({
    userId: player.userId,
    name: player.name,
    key: player.avatarColor || MINIGAME1_SEAT_KEYS[index],
  }));
}

function toast(socket: TypedSocket, message: string): void {
  socket.emit(SOCKET_EVENTS.SERVER.TOAST, { type: 'error', message });
}

async function ensureGame(io: TypedServer, socket: TypedSocket, code: string) {
  const userId = socket.data.userId;
  if (!userId) return null;

  const room = await getCachedRoom(code);
  if (!room || !room.memberKeyByUserId.has(userId)) {
    toast(socket, 'Kode room atau keanggotaan tidak valid.');
    return null;
  }
  if (room.hostId !== userId) {
    toast(socket, 'Hanya host yang bisa mengatur permainan.');
    return null;
  }

  const existing = games.get(code);
  if (existing && !existing.isFinished) return existing;
  if (existing) {
    existing.dispose();
    games.delete(code);
  }

  const players = await buildPlayers(room.roomId);
  if (players.length !== REQUIRED_PLAYERS) {
    toast(socket, PLAYERS_REQUIRED_MESSAGE);
    return null;
  }
  const allReady = await checkAllPlayersReady(room.roomId);
  if (!allReady) {
    toast(socket, 'Semua pemain harus siap sebelum permainan dimulai.');
    return null;
  }

  const game = new Minigame1Game(
    io,
    code,
    room.roomId,
    userId,
    players,
    (result) => {
      void persistScores(result.roomId, result.entries).catch((error) => {
        console.error('minigame1 score save error:', error);
      });
    }
  );
  games.set(code, game);
  return game;
}

export function setupMinigameHandlers(io: TypedServer, socket: MinigameSocket) {

  socket.on(SOCKET_EVENTS.CLIENT.MINIGAME_INPUT, async (data) => {
    try {
      if (!data || data.minigame !== 1) return;
      if (data.type && data.type !== 'punch') return;

      const code = normalizeCode(data.code);
      const userId = socket.data.userId;
      if (!code || !userId) return;

      const room = await getCachedRoom(code);
      if (!room) return;

      const expectedKey = room.memberKeyByUserId.get(userId);
      if (!expectedKey || data.key !== expectedKey || data.userId !== userId) return;

      const game = games.get(code);
      if (!game || game.isFinished) return;
      game.punch(expectedKey as (typeof MINIGAME1_SEAT_KEYS)[number]);
    } catch (error) {
      console.error('minigame:input error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.MINIGAME_COMMAND, async (data) => {
    try {
      if (!data || data.minigame !== 1) return;
      const code = normalizeCode(data.code);
      if (!code) return;

      const userId = socket.data.userId;
      if (!userId) return;

      if (data.type === 'sync') {

        const game = games.get(code);
        if (game && game.hasPlayer(userId)) game.syncTo(userId);
        return;
      }

      const game = await ensureGame(io, socket, code);
      if (!game) return;
      if (!game.isHost(userId)) {
        toast(socket, 'Hanya host yang bisa mengatur permainan.');
        return;
      }

      switch (data.type) {
        case 'start': {
          const room = await getCachedRoom(code);
          if (room) await markStickBrawlRoomPlaying(room.roomId, 1);
          game.start(data.duration);
          break;
        }
        case 'begin_round':
          game.beginRound();
          break;
        case 'calculated':
          game.calculated();
          break;
        case 'summary':
          game.showSummary();
          break;
        case 'result':
          game.backToResult();
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('minigame:command error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.MINIGAME_COMPLETE, async (data) => {
    try {
      if (!data || data.minigame !== 1) return;
      const code = normalizeCode(data.code);
      const userId = socket.data.userId;
      if (!code || !userId) return;

      const room = await getCachedRoom(code);
      if (!room || room.hostId !== userId) return;

      const memberIds = new Set(room.memberKeyByUserId.keys());
      const scores = Array.isArray(data.scores) ? data.scores : [];
      const entries: Minigame1ScoreEntry[] = [];
      for (const entry of scores) {
        if (!entry || typeof entry.userId !== 'string' || !memberIds.has(entry.userId)) continue;
        entries.push({
          userId: entry.userId,
          score: Number.isFinite(entry.score) ? Math.trunc(entry.score) : 0,
          metrics:
            entry.metrics && typeof entry.metrics === 'object' && !Array.isArray(entry.metrics)
              ? entry.metrics
              : {},
        });
      }
      if (entries.length) await persistScores(room.roomId, entries);
    } catch (error) {
      console.error('minigame:complete error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.ROOM_LEAVE, ({ code }) => {
    if (!code) return;
    const upper = code.toUpperCase();
    const game = games.get(upper);
    if (game && socket.data.userId) game.removePlayer(socket.data.userId);
    invalidateRoomCache(upper);
  });
  socket.on(SOCKET_EVENTS.CLIENT.ROOM_KICK, ({ code }) => {
    if (!code) return;
    const upper = code.toUpperCase();
    invalidateRoomCache(upper);
  });
}
