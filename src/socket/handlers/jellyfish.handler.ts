import { PLAYERS_REQUIRED_MESSAGE, REQUIRED_PLAYERS, ROOM_MAX_PLAYERS } from '../../config/gameRules';
import { pool } from '../../config/db';
import {
  checkAllPlayersReady,
  getRoomIdByCode,
  getRoomPlayersWithUsers,
  startTournament,
} from '../../modules/rooms/rooms.service';
import {
  buildFinalScores,
  resetRoomScores,
} from '../../modules/final/finalScore.service';
import { resetMinigameRoom } from './minigame.handler';
import { createIdleJellyfishSnapshot, JellyfishGame } from '../../modules/jellyfish/jellyfish.game';
import {
  getJellyfishRoomContext,
  JellyfishScoreRow,
  markJellyfishRoomPlaying,
  restoreRoomAfterJellyfish,
  saveJellyfishScores,
} from '../../modules/jellyfish/jellyfish.service';
import {
  JELLYFISH_MINIGAME_NUMBER,
  SCENARIO_ID,
} from '../../modules/jellyfish/jellyfish.config';
import { JellyfishFinalResult } from '../../types';
import { SOCKET_EVENTS } from '../events';
import { notifyRoomsUpdated } from '../notify';
import type { TypedServer, TypedSocket } from '../socket';

type JellyfishServer = TypedServer;
type JellyfishSocket = TypedSocket;

const games = new Map<string, JellyfishGame>();
const finalResults = new Map<string, JellyfishFinalResult>();

function normalizeCode(code: unknown): string | null {
  if (typeof code !== 'string' || !code.trim()) return null;
  return code.trim().toUpperCase();
}

async function handleGameFinished(
  roomId: string,
  previousStatus: string,
  result: JellyfishFinalResult
): Promise<void> {
  try {
    await restoreRoomAfterJellyfish(roomId, previousStatus);
    if (result.reason !== 'COMPLETED') return;

    // Make the result available immediately: the async DB save may still be in
    // flight when the host opens the overall score page.
    finalResults.set(roomId, result);

    const rows: JellyfishScoreRow[] = result.finalStandings.map((standing) => ({
      userId: standing.userId,
      playerKey: standing.playerKey,
      rank: standing.rank,
      total: standing.total,
      deadlocks: standing.deadlocks,
      rejectedRequests: standing.rejectedRequests,
      completedRounds: standing.completedRounds,
      rounds: result.roundResults.map((round) => {
        const entry = round.standings.find((item) => item.userId === standing.userId);
        return {
          round: round.round,
          algorithm: round.algorithm,
          scenarioId: SCENARIO_ID,
          roundScore: entry?.roundScore ?? 0,
          deadlocksInvolved: entry?.deadlocksInvolved ?? 0,
          rejectedRequests: entry?.rejectedRequests ?? 0,
          finished: entry?.finished ?? false,
          finishTimeSec: entry?.finishTimeSec ?? null,
        };
      }),
    }));

    await saveJellyfishScores(
      roomId,
      JELLYFISH_MINIGAME_NUMBER,
      rows,
      result.metricsByAlgorithm
    );

    console.info('[jellyfish] scores saved', {
      code: result.code,
      roomId,
      minigame: JELLYFISH_MINIGAME_NUMBER,
      standings: result.finalStandings.length,
    });
  } catch (error) {
    console.error('Jellyfish finish error:', error);
  } finally {
    notifyRoomsUpdated();
  }
}

export function getJellyfishFinalResult(roomId: string): JellyfishFinalResult | null {
  return finalResults.get(roomId) || null;
}

export function resetJellyfishRoom(roomId: string, code: string): void {
  const upperCode = normalizeCode(code);
  if (upperCode) {
    games.get(upperCode)?.dispose();
    games.delete(upperCode);
  }
  finalResults.delete(roomId);
}

async function broadcastRoomState(
  io: JellyfishServer,
  upperCode: string,
  roomId: string
): Promise<void> {
  const [players, roomName] = await Promise.all([
    getRoomPlayersWithUsers(roomId),
    pool.query<{ name: string }>('SELECT name FROM rooms WHERE id = $1', [roomId]),
  ]);
  const remotes = await io.in(upperCode).fetchSockets();

  for (const remote of remotes) {
    const userId = (remote.data as { userId?: string }).userId;
    if (!userId) continue;

    remote.emit(SOCKET_EVENTS.SERVER.ROOM_STATE, {
      room: {
        roomId,
        code: upperCode,
        name: roomName.rows[0]?.name || '',
        status: 'waiting',
        maxPlayers: ROOM_MAX_PLAYERS,
      },
      players,
      me: {
        userId,
        isHost: players.some((player) => player.userId === userId && player.isHost),
      },
    });
  }
}

interface RoomResolution {
  upperCode: string;
  roomId: string;
  players: Awaited<ReturnType<typeof getRoomPlayersWithUsers>>;
}

async function resolveRoomMembership(
  socket: JellyfishSocket,
  code: unknown
): Promise<RoomResolution | null> {
  const userId = socket.data.userId;
  const upperCode = normalizeCode(code);
  if (!userId || !upperCode) return null;

  const roomId = await getRoomIdByCode(upperCode);
  if (!roomId) return null;

  const players = await getRoomPlayersWithUsers(roomId);
  if (!players.some((player) => player.userId === userId)) return null;

  return { upperCode, roomId, players };
}

async function registerRoomSockets(
  io: JellyfishServer,
  upperCode: string,
  game: JellyfishGame
): Promise<void> {
  const sockets = await io.in(upperCode).fetchSockets();
  for (const remote of sockets) {
    const remoteUserId = (remote.data as { userId?: string }).userId;
    if (remoteUserId) game.registerSocket(remoteUserId, remote.id);
  }
}

interface EnsureGameOptions {
  autoStart: boolean;
  allowExisting: boolean;
}

async function ensureGame(
  io: JellyfishServer,
  socket: JellyfishSocket,
  code: unknown,
  toast: (type: 'error' | 'info' | 'success', message: string) => void,
  options: EnsureGameOptions
): Promise<JellyfishGame | null> {
  const userId = socket.data.userId;
  const resolved = await resolveRoomMembership(socket, code);
  if (!userId || !resolved) {
    toast('error', 'Kode room atau keanggotaan tidak valid.');
    return null;
  }

  const { upperCode, roomId, players } = resolved;
  const context = await getJellyfishRoomContext(roomId);
  if (!context || context.hostId !== userId) {
    toast('error', 'Hanya host yang bisa mengatur Jellyfish.');
    return null;
  }
  if (context.status === 'finished') {
    toast('error', 'Room sudah selesai.');
    return null;
  }

  const existing = games.get(upperCode);
  if (existing?.isActive) {
    // `briefing_r1:show` may already have created the game in briefing state.
    if (options.autoStart && existing.currentStatus === 'briefing') {
      existing.startRound(1);
      return existing;
    }
    if (!options.allowExisting) {
      toast('error', 'Jellyfish sedang berjalan di room ini.');
      return null;
    }
    return existing;
  }
  if (existing) {
    existing.dispose();
    games.delete(upperCode);
  }

  if (players.length !== REQUIRED_PLAYERS) {
    toast('error', PLAYERS_REQUIRED_MESSAGE);
    return null;
  }
  const allReady = await checkAllPlayersReady(roomId);
  if (!allReady) {
    toast('error', 'Semua pemain harus siap sebelum permainan dimulai.');
    return null;
  }

  const previousStatus = context.status;
  const started = await markJellyfishRoomPlaying(roomId, JELLYFISH_MINIGAME_NUMBER);
  if (!started) {
    toast('error', 'Room tidak dapat memulai permainan.');
    return null;
  }
  if (previousStatus === 'waiting') notifyRoomsUpdated();

  try {
    const game = new JellyfishGame(io, upperCode, roomId, userId, players, (result) => {
      if (games.get(upperCode) === game) games.delete(upperCode);
      void handleGameFinished(roomId, previousStatus, result);
    });

    games.set(upperCode, game);
    socket.join(upperCode);
    game.registerSocket(userId, socket.id);
    await registerRoomSockets(io, upperCode, game);
    game.start();
    if (options.autoStart) game.startRound(1);

    return game;
  } catch (error) {
    console.error('Jellyfish start error:', error);
    games.delete(upperCode);
    await restoreRoomAfterJellyfish(roomId, previousStatus);
    notifyRoomsUpdated();
    toast('error', 'Gagal memulai Jellyfish.');
    return null;
  }
}

export function setupJellyfishHandlers(io: JellyfishServer, socket: JellyfishSocket): void {
  const toast = (type: 'error' | 'info' | 'success', message: string) => {
    socket.emit(SOCKET_EVENTS.SERVER.TOAST, { type, message });
  };

  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_START, async ({ code }) => {
    try {
      await ensureGame(io, socket, code, toast, {
        autoStart: true,
        allowExisting: false,
      });
    } catch (error) {
      console.error('jellyfish:start error:', error);
    }
  });

  const handleJoin = async ({ code }: { code: string }) => {
    try {
      const resolved = await resolveRoomMembership(socket, code);
      if (!resolved) {
        toast('error', 'Kode room atau keanggotaan tidak valid.');
        return;
      }

      const { upperCode, players } = resolved;
      socket.join(upperCode);

      const game = games.get(upperCode);
      if (game) {
        if (game.hasPlayer(socket.data.userId)) {
          game.registerSocket(socket.data.userId, socket.id);
        }
        socket.emit(SOCKET_EVENTS.SERVER.JELLYFISH_STATE, game.snapshot());
        return;
      }

      socket.emit(
        SOCKET_EVENTS.SERVER.JELLYFISH_STATE,
        createIdleJellyfishSnapshot(upperCode, players)
      );
    } catch (error) {
      console.error('jellyfish:join error:', error);
    }
  };

  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_JOIN, handleJoin);

  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_MOVE, async (data) => {
    try {
      const userId = socket.data.userId;
      if (!userId || !data) return;
      const code = normalizeCode(data.code);
      if (!code || !Number.isFinite(data.x) || !Number.isFinite(data.y)) return;

      const game = games.get(code);
      if (!game) return;
      if (!game.hasPlayer(userId)) {
        toast('error', 'Kamu tidak terdaftar di permainan ini.');
        return;
      }

      game.registerSocket(userId, socket.id);
      game.handleMove(userId, data.x, data.y);
    } catch (error) {
      console.error('jellyfish:move error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_REQUEST_RESOURCE, async (data) => {
    try {
      const userId = socket.data.userId;
      if (!userId || !data) return;
      const code = normalizeCode(data.code);
      if (!code || !Number.isInteger(data.resourceId)) return;

      const game = games.get(code);
      if (!game) return;
      if (!game.hasPlayer(userId)) {
        toast('error', 'Kamu tidak terdaftar di permainan ini.');
        return;
      }

      game.registerSocket(userId, socket.id);
      game.handleRequestResource(userId, data.resourceId);
    } catch (error) {
      console.error('jellyfish:request_resource error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_RELEASE, async ({ code }) => {
    try {
      const userId = socket.data.userId;
      if (!userId || !code) return;

      const game = games.get(code.toUpperCase());
      if (!game || !game.hasPlayer(userId)) return;
      game.handleRelease(userId);
    } catch (error) {
      console.error('jellyfish:release error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_NEXT_ROUND, async ({ code }) => {
    try {
      const userId = socket.data.userId;
      if (!userId || !code) return;

      const game = games.get(code.toUpperCase());
      if (!game) return;
      if (!game.isHost(userId)) {
        toast('error', 'Hanya host yang bisa melanjutkan ronde.');
        return;
      }
      game.handleNextRound(userId);
    } catch (error) {
      console.error('jellyfish:next_round error:', error);
    }
  });

  const relayHostTransition = async (event: string, code: unknown) => {
    const resolved = await resolveRoomMembership(socket, code);
    if (!resolved) {
      toast('error', 'Kode room atau keanggotaan tidak valid.');
      return null;
    }

    const context = await getJellyfishRoomContext(resolved.roomId);
    if (!context || context.hostId !== socket.data.userId) {
      toast('error', 'Hanya host yang bisa mengatur alur Jellyfish.');
      return null;
    }

    (io.to(resolved.upperCode) as any).emit(event, { code: resolved.upperCode });
    return resolved;
  };

  // Compatibility with the current App.jsx: validate host, relay, then drive
  // the authoritative game where the transition implies a state change.
  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_BRIEFING_R1_SHOW, async ({ code }) => {
    try {
      const resolved = await relayHostTransition(SOCKET_EVENTS.SERVER.JELLYFISH_BRIEFING_R1_SHOW, code);
      if (!resolved) return;
      await ensureGame(io, socket, code, toast, {
        autoStart: false,
        allowExisting: true,
      });
    } catch (error) {
      console.error('jellyfish:briefing_r1:show error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_ROUND1_START, async ({ code }) => {
    try {
      const game = await ensureGame(io, socket, code, toast, {
        autoStart: true,
        allowExisting: true,
      });
      if (!game) return;
      if (game.currentStatus === 'briefing') game.startRound(1);
      await relayHostTransition(SOCKET_EVENTS.SERVER.JELLYFISH_ROUND1_START, code);
    } catch (error) {
      console.error('jellyfish:round1:start error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_BRIEFING_R2_SHOW, async ({ code }) => {
    try {
      await relayHostTransition(SOCKET_EVENTS.SERVER.JELLYFISH_BRIEFING_R2_SHOW, code);
    } catch (error) {
      console.error('jellyfish:briefing_r2:show error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_ROUND2_START, async ({ code }) => {
    try {
      const upperCode = normalizeCode(code);
      if (!upperCode) return;

      const game = games.get(upperCode);
      const userId = socket.data.userId;
      if (!game || !userId || !game.isHost(userId) || !game.hasPlayer(userId)) return;
      if (game.currentStatus === 'round_end' && game.currentRound === 1) {
        game.advanceRound();
      } else if (game.currentStatus === 'briefing' && game.currentRound === 2) {
        game.startRound(2);
      } else {
        toast('error', 'Ronde 2 belum tersedia.');
        return;
      }
      await relayHostTransition(SOCKET_EVENTS.SERVER.JELLYFISH_ROUND2_START, code);
    } catch (error) {
      console.error('jellyfish:round2:start error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_BRIEFING_R3_SHOW, async ({ code }) => {
    try {
      await relayHostTransition(SOCKET_EVENTS.SERVER.JELLYFISH_BRIEFING_R3_SHOW, code);
    } catch (error) {
      console.error('jellyfish:briefing_r3:show error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_ROUND3_START, async ({ code }) => {
    try {
      const upperCode = normalizeCode(code);
      if (!upperCode) return;

      const game = games.get(upperCode);
      const userId = socket.data.userId;
      if (!game || !userId || !game.isHost(userId) || !game.hasPlayer(userId)) return;
      if (game.currentStatus === 'round_end' && game.currentRound === 2) {
        game.advanceRound();
      } else if (game.currentStatus === 'briefing' && game.currentRound === 3) {
        game.startRound(3);
      } else {
        toast('error', 'Ronde 3 belum tersedia.');
        return;
      }
      await relayHostTransition(SOCKET_EVENTS.SERVER.JELLYFISH_ROUND3_START, code);
    } catch (error) {
      console.error('jellyfish:round3:start error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_HASIL_SHOW, async ({ code }) => {
    try {
      await relayHostTransition(SOCKET_EVENTS.SERVER.JELLYFISH_HASIL_SHOW, code);
    } catch (error) {
      console.error('jellyfish:hasil:show error:', error);
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.FINAL_SCORE_SHOW, async ({ code }) => {
    try {
      const resolved = await resolveRoomMembership(socket, code);
      if (!resolved) {
        toast('error', 'Kode room atau keanggotaan tidak valid.');
        return;
      }

      const context = await getJellyfishRoomContext(resolved.roomId);
      const userId = socket.data.userId;
      if (!context || !userId || context.hostId !== userId) {
        toast('error', 'Hanya host yang bisa menampilkan skor akhir.');
        return;
      }

      const fallback = getJellyfishFinalResult(resolved.roomId)?.finalStandings || [];
      const scores = await buildFinalScores(resolved.roomId, fallback);
      io.to(resolved.upperCode).emit(SOCKET_EVENTS.SERVER.FINAL_SCORE_SHOW, {
        code: resolved.upperCode,
        players: scores,
      });
    } catch (error) {
      console.error('final:score_show error:', error);
      toast('error', 'Gagal menyiapkan skor akhir.');
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.FINAL_LOBBY, async ({ code }) => {
    try {
      const resolved = await resolveRoomMembership(socket, code);
      const userId = socket.data.userId;
      const context = resolved
        ? await getJellyfishRoomContext(resolved.roomId)
        : null;
      if (!resolved || !userId || !context || context.hostId !== userId) {
        toast('error', 'Hanya host yang bisa kembali ke lobby.');
        return;
      }

      await resetRoomScores(resolved.roomId, false);
      resetMinigameRoom(resolved.roomId, resolved.upperCode);
      resetJellyfishRoom(resolved.roomId, resolved.upperCode);
      await broadcastRoomState(io, resolved.upperCode, resolved.roomId);
      io.to(resolved.upperCode).emit(SOCKET_EVENTS.SERVER.FINAL_LOBBY, {
        code: resolved.upperCode,
      });
      notifyRoomsUpdated();
    } catch (error) {
      console.error('final:lobby error:', error);
      toast('error', 'Gagal kembali ke lobby.');
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.FINAL_PLAY_AGAIN, async ({ code }) => {
    try {
      const resolved = await resolveRoomMembership(socket, code);
      const userId = socket.data.userId;
      const context = resolved
        ? await getJellyfishRoomContext(resolved.roomId)
        : null;
      if (!resolved || !userId || !context || context.hostId !== userId) {
        toast('error', 'Hanya host yang bisa mengulang permainan.');
        return;
      }

      await resetRoomScores(resolved.roomId, true);
      resetMinigameRoom(resolved.roomId, resolved.upperCode);
      resetJellyfishRoom(resolved.roomId, resolved.upperCode);

      const started = await startTournament(resolved.roomId, userId);
      if (!started) {
        toast('error', 'Gagal memulai ulang permainan.');
        return;
      }

      await broadcastRoomState(io, resolved.upperCode, resolved.roomId);
      io.to(resolved.upperCode).emit(SOCKET_EVENTS.SERVER.TOURNAMENT_STARTING, {
        countdown: 3,
        firstMinigame: 1,
      });
      notifyRoomsUpdated();
    } catch (error) {
      console.error('final:play_again error:', error);
      toast('error', 'Gagal mengulang permainan.');
    }
  });

  socket.on(SOCKET_EVENTS.CLIENT.JELLYFISH_LEAVE, ({ code }) => {
    const userId = socket.data.userId;
    if (!userId || !code) return;

    const upperCode = code.toUpperCase();
    games.get(upperCode)?.removePlayer(userId);
    socket.leave(upperCode);
  });

  socket.on(SOCKET_EVENTS.CLIENT.ROOM_LEAVE, ({ code }) => {
    const userId = socket.data.userId;
    if (!userId || !code) return;
    games.get(code.toUpperCase())?.removePlayer(userId);
  });

  socket.on(SOCKET_EVENTS.CLIENT.ROOM_KICK, ({ code, targetUserId }) => {
    const userId = socket.data.userId;
    if (!userId || !code || !targetUserId) return;

    const game = games.get(code.toUpperCase());
    if (!game || !game.isHost(userId) || game.isHost(targetUserId)) return;
    game.removePlayer(targetUserId);
  });

  socket.on('disconnect', () => {
    const userId = socket.data.userId;
    if (!userId) return;

    for (const game of games.values()) {
      if (game.isBoundToSocket(userId, socket.id)) {
        game.removePlayer(userId);
        break;
      }
    }
  });
}
