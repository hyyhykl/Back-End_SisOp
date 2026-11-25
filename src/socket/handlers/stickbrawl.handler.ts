import { Server, Socket } from 'socket.io';
import { PLAYERS_REQUIRED_MESSAGE, REQUIRED_PLAYERS } from '../../config/gameRules';
import {
  checkAllPlayersReady,
  getPlayerCount,
  getRoomIdByCode,
  getRoomPlayersWithUsers,
} from '../../modules/rooms/rooms.service';
import {
  createIdleStickBrawlSnapshot,
  StickBrawlGame,
} from '../../modules/stickbrawl/stickbrawl.game';
import {
  getStickBrawlRoomContext,
  markStickBrawlRoomPlaying,
  restoreRoomAfterStickBrawl,
  saveStickBrawlScores,
} from '../../modules/stickbrawl/stickbrawl.service';
import { SOCKET_EVENTS } from '../events';
import { notifyRoomsUpdated } from '../notify';
import {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
  StickBrawlFinalResult,
} from '../../types';

type StickBrawlSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type StickBrawlServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const games = new Map<string, StickBrawlGame>();

async function handleGameFinished(
  roomId: string,
  previousStatus: string,
  minigameNumber: number | undefined,
  result: StickBrawlFinalResult
): Promise<void> {
  try {
    await restoreRoomAfterStickBrawl(roomId, previousStatus);
    if (result.reason === 'COMPLETED' && minigameNumber !== undefined) {
      await saveStickBrawlScores(
        roomId,
        minigameNumber,
        result.standings,
        result.roundsPlayed
      );
    }
  } catch (error) {
    console.error('Stick Brawl finish error:', error);
  } finally {
    notifyRoomsUpdated();
  }
}

export function setupStickBrawlHandlers(io: StickBrawlServer, socket: StickBrawlSocket): void {
  const toast = (type: 'error' | 'info' | 'success', message: string) => {
    socket.emit(SOCKET_EVENTS.SERVER.TOAST, { type, message });
  };

  socket.on(SOCKET_EVENTS.CLIENT.STICKBRAWL_START, async ({ code, minigame }) => {
    const userId = socket.data.userId;
    if (!userId) {
      toast('error', 'Silakan login terlebih dahulu.');
      return;
    }
    if (!code) return;

    const upperCode = code.toUpperCase();
    const roomId = await getRoomIdByCode(upperCode);
    if (!roomId) {
      toast('error', 'Kode room tidak ditemukan.');
      return;
    }

    const context = await getStickBrawlRoomContext(roomId);
    if (!context) {
      toast('error', 'Room tidak ditemukan.');
      return;
    }
    if (context.hostId !== userId) {
      toast('error', 'Hanya host yang bisa memulai Stick Brawl.');
      return;
    }
    if (context.status === 'finished') {
      toast('error', 'Room sudah selesai.');
      return;
    }

    const existing = games.get(upperCode);
    if (existing?.isActive) {
      toast('error', 'Stick Brawl sedang berjalan di room ini.');
      return;
    }
    if (existing) {
      existing.dispose();
      games.delete(upperCode);
    }

    const playerCount = await getPlayerCount(roomId);
    if (playerCount !== REQUIRED_PLAYERS) {
      toast('error', PLAYERS_REQUIRED_MESSAGE);
      return;
    }

    const allReady = await checkAllPlayersReady(roomId);
    if (!allReady) {
      toast('error', 'Semua pemain harus siap sebelum permainan dimulai.');
      return;
    }

    const minigameNumber =
      typeof minigame === 'number' &&
      Number.isInteger(minigame) &&
      minigame >= 1 &&
      minigame <= 3
        ? minigame
        : undefined;

    const previousStatus = context.status;
    const started = await markStickBrawlRoomPlaying(roomId, minigameNumber);
    if (!started) {
      toast('error', 'Room tidak dapat memulai permainan.');
      return;
    }
    if (previousStatus === 'waiting') {
      notifyRoomsUpdated();
    }

    try {
      const players = await getRoomPlayersWithUsers(roomId);

      let game: StickBrawlGame;
      game = new StickBrawlGame(io, upperCode, roomId, userId, players, (result) => {
        if (games.get(upperCode) === game) games.delete(upperCode);
        void handleGameFinished(roomId, previousStatus, minigameNumber, result);
      });

      games.set(upperCode, game);
      socket.join(upperCode);
      game.registerSocket(userId, socket.id);

      const sockets = await io.in(upperCode).fetchSockets();
      for (const remote of sockets) {
        const remoteUserId = (remote.data as SocketData).userId;
        if (remoteUserId) game.registerSocket(remoteUserId, remote.id);
      }

      game.start();
    } catch (error) {
      console.error('Stick Brawl start error:', error);
      games.delete(upperCode);
      await restoreRoomAfterStickBrawl(roomId, previousStatus);
      notifyRoomsUpdated();
      toast('error', 'Gagal memulai Stick Brawl.');
    }
  });

  const handleJoin = async ({ code }: { code: string }) => {
    const userId = socket.data.userId;
    if (!userId) {
      toast('error', 'Silakan login terlebih dahulu.');
      return;
    }
    if (!code) return;

    const upperCode = code.toUpperCase();
    const roomId = await getRoomIdByCode(upperCode);
    if (!roomId) {
      toast('error', 'Kode room tidak ditemukan.');
      return;
    }

    const players = await getRoomPlayersWithUsers(roomId);
    if (!players.some((player) => player.userId === userId)) {
      toast('error', 'Kamu bukan anggota room ini.');
      return;
    }

    socket.join(upperCode);

    const game = games.get(upperCode);
    if (game) {
      if (game.hasPlayer(userId)) {
        game.registerSocket(userId, socket.id);
      }
      socket.emit(SOCKET_EVENTS.SERVER.STICKBRAWL_STATE, game.snapshot());
      return;
    }

    socket.emit(
      SOCKET_EVENTS.SERVER.STICKBRAWL_STATE,
      createIdleStickBrawlSnapshot(upperCode, players)
    );
  };

  socket.on(SOCKET_EVENTS.CLIENT.STICKBRAWL_JOIN, handleJoin);
  socket.on(SOCKET_EVENTS.CLIENT.STICKBRAWL_SYNC, handleJoin);

  socket.on(SOCKET_EVENTS.CLIENT.STICKBRAWL_RUN, ({ code }) => {
    const userId = socket.data.userId;
    if (!userId || !code) return;

    const upperCode = code.toUpperCase();
    const game = games.get(upperCode);
    if (!game) {
      toast('error', 'Stick Brawl belum dimulai.');
      return;
    }
    if (!game.hasPlayer(userId)) {
      toast('error', 'Kamu tidak terdaftar di permainan ini.');
      return;
    }

    socket.join(upperCode);
    game.registerSocket(userId, socket.id);
    game.run(userId);
  });

  socket.on(SOCKET_EVENTS.CLIENT.STICKBRAWL_LEAVE, ({ code }) => {
    const userId = socket.data.userId;
    if (!userId || !code) return;

    const game = games.get(code.toUpperCase());
    if (!game) return;
    game.removePlayer(userId);
  });

  socket.on(SOCKET_EVENTS.CLIENT.ROOM_LEAVE, ({ code }) => {
    const userId = socket.data.userId;
    if (!userId || !code) return;

    const game = games.get(code.toUpperCase());
    if (!game) return;
    game.removePlayer(userId);
  });

  socket.on(SOCKET_EVENTS.CLIENT.ROOM_KICK, ({ code, targetUserId }) => {
    const userId = socket.data.userId;
    if (!userId || !code || !targetUserId) return;

    const game = games.get(code.toUpperCase());
    if (!game || !game.isHost(userId)) return;
    if (game.isHost(targetUserId)) return;
    game.removePlayer(targetUserId);
  });

  socket.on(SOCKET_EVENTS.CLIENT.STICKBRAWL_ABORT, ({ code }) => {
    const userId = socket.data.userId;
    if (!userId || !code) return;

    const upperCode = code.toUpperCase();
    const game = games.get(upperCode);
    if (!game) return;

    if (!game.isHost(userId)) {
      toast('error', 'Hanya host yang bisa membatalkan permainan.');
      return;
    }

    game.abort('Permainan dibatalkan oleh host.');
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
