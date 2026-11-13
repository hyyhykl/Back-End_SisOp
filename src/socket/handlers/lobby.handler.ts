import { Server, Socket } from 'socket.io';
import { pool } from '../../config/db';
import {
  getRoomIdByCode,
  getRoomPlayersWithUsers,
  addPlayerToRoom,
  removePlayerFromRoom,
  setPlayerReady,
  kickPlayer,
  startTournament,
  checkAllPlayersReady,
  getPlayerCount,
} from '../../modules/rooms/rooms.service';
import { SOCKET_EVENTS } from '../events';
import { notifyRoomsUpdated } from '../notify';
import { getUserById } from '../../modules/auth/auth.service';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, RoomState, RoomPlayerWithUser } from '../../types';

type LobbySocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type LobbyServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// Store socketId per userId per room for kick functionality
const userSocketMap = new Map<string, Map<string, string>>(); // roomCode -> (userId -> socketId)

function getUserSockets(roomCode: string): Map<string, string> {
  if (!userSocketMap.has(roomCode)) {
    userSocketMap.set(roomCode, new Map());
  }
  return userSocketMap.get(roomCode)!;
}

function removeUserSocket(roomCode: string, userId: string): void {
  const roomMap = userSocketMap.get(roomCode);
  if (roomMap) {
    roomMap.delete(userId);
    if (roomMap.size === 0) {
      userSocketMap.delete(roomCode);
    }
  }
}

export function setupLobbyHandlers(io: LobbyServer, socket: LobbySocket) {
  // Auth: Attach user data to socket + validasi user masih ada di DB
  socket.on(SOCKET_EVENTS.CLIENT.AUTH, async (userId: string) => {
    socket.data.userId = userId;

    const user = await getUserById(userId);
    if (user) {
      socket.data.userName = user.name;
      socket.data.avatarColor = user.avatarColor;
      console.log(`🔐 Socket authenticated: ${userId} (${user.name})`);
    } else {
      // userId kedaluwarsa (misal data dihapus manual dari DB)
      console.log(`⚠️ Socket auth FAILED (user not found): ${userId}`);
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: 'Sesi tamu kedaluwarsa. Refresh halaman dan masukkan nama lagi.',
      });
    }
  });

  // Join Room
  socket.on(SOCKET_EVENTS.CLIENT.ROOM_JOIN, async ({ code }) => {
    const userId = socket.data.userId;
    if (!userId) {
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: 'Silakan login terlebih dahulu',
      });
      return;
    }

    const upperCode = code.toUpperCase();
    const roomId = await getRoomIdByCode(upperCode);

    if (!roomId) {
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: 'Kode room tidak ditemukan',
      });
      return;
    }

    // Check if room is full
    const playerCount = await getPlayerCount(roomId);
    if (playerCount >= 4) {
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: 'Room sudah penuh (maksimal 4 pemain)',
      });
      return;
    }

    // Check if already in room
    const existing = await pool.query(
      `SELECT 1 FROM room_players WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
    const isRejoin = existing.rows.length > 0;

    // Add player to room (or update if reconnecting)
    const player = await addPlayerToRoom(roomId, userId);
    if (!player) {
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: 'Gagal bergabung ke room',
      });
      return;
    }

    // Join socket room
    socket.join(upperCode);

    // Track socket for kick functionality
    getUserSockets(upperCode).set(userId, socket.id);

    // Get full room state
    const players = await getRoomPlayersWithUsers(roomId);
    const isHost = players.some(p => p.userId === userId && p.isHost);

    // Send full state to joining player
    const roomState: RoomState = {
      room: {
        roomId,
        code: upperCode,
        name: '', // Will be filled from rooms table if needed
        status: 'waiting',
        maxPlayers: 4,
      },
      players,
      me: { userId, isHost },
    };

    // Get room name
    const roomNameResult = await pool.query(
      `SELECT name FROM rooms WHERE id = $1`,
      [roomId]
    );
    roomState.room.name = roomNameResult.rows[0]?.name || '';

    socket.emit(SOCKET_EVENTS.SERVER.ROOM_STATE, roomState);

    // Broadcast to others (hanya pemain baru — rejoin jangan dobel)
    if (!isRejoin) {
      socket.to(upperCode).emit(SOCKET_EVENTS.SERVER.ROOM_PLAYER_JOINED, player);

      // Toast to room
      io.to(upperCode).emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'info',
        message: `${player.name} bergabung ke room`,
      });
    }

    console.log(`👤 ${player.name} joined room ${upperCode}`);

    // Jumlah pemain berubah → daftar room publik ikut berubah
    notifyRoomsUpdated();
  });

  // Leave Room
  socket.on(SOCKET_EVENTS.CLIENT.ROOM_LEAVE, async ({ code }) => {
    const startedAt = Date.now();
    const userId = socket.data.userId;
    if (!userId || !code) return;

    const upperCode = code.toUpperCase();
    const roomId = await getRoomIdByCode(upperCode);
    if (!roomId) return;

    // Get player info before removing
    const playerResult = await pool.query(
      `SELECT name FROM users WHERE id = $1`,
      [userId]
    );
    const playerName = playerResult.rows[0]?.name || 'Unknown';

    // Check if host
    const hostCheck = await pool.query(
      `SELECT host_id FROM rooms WHERE id = $1`,
      [roomId]
    );
    const isHost = hostCheck.rows[0]?.host_id === userId;

    await removePlayerFromRoom(roomId, userId);
    removeUserSocket(upperCode, userId);

    // PENTING: emit dulu, baru socket.leave().
    // Kalau socket.leave() dipanggil lebih dulu, host tidak akan menerima
    // room:disbanded miliknya sendiri dan frontend yang menunggu event itu
    // akan tersangkut di ruang tunggu.
    if (isHost) {
      // Host left - disband room
      await pool.query(`UPDATE rooms SET status = 'finished' WHERE id = $1`, [roomId]);
      io.to(upperCode).emit(SOCKET_EVENTS.SERVER.ROOM_DISBANDED, { reason: 'HOST_LEFT' });
      // Clean up socket map
      userSocketMap.delete(upperCode);
    } else {
      // Regular player left
      io.to(upperCode).emit(SOCKET_EVENTS.SERVER.ROOM_PLAYER_LEFT, {
        userId,
        name: playerName,
      });
      io.to(upperCode).emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'info',
        message: `${playerName} keluar dari room`,
      });
    }

    socket.leave(upperCode);

    console.log(`👋 ${playerName} left room ${upperCode}`);

    // Ukur biaya DB di jalur keluar/bubarkan. Kalau angkanya ~2000 ms,
    // penyebab delay ada di Supabase/pooler, bukan di frontend.
    console.log(`⏱ room:leave ${upperCode} selesai dalam ${Date.now() - startedAt} ms`);

    // Host keluar → room bubar; tamu keluar → jumlah pemain berubah
    notifyRoomsUpdated();
  });

  // Set Ready (Tamu only)
  socket.on(SOCKET_EVENTS.CLIENT.ROOM_SET_READY, async ({ code, isReady }) => {
    const userId = socket.data.userId;
    if (!userId) return;

    const upperCode = code.toUpperCase();
    const roomId = await getRoomIdByCode(upperCode);
    if (!roomId) return;

    // Verify not host
    const hostCheck = await pool.query(
      `SELECT 1 FROM room_players WHERE room_id = $1 AND user_id = $2 AND is_host = true`,
      [roomId, userId]
    );
    if (hostCheck.rows.length > 0) return; // Host cannot toggle ready

    await setPlayerReady(roomId, userId, isReady);

    // Broadcast to room
    io.to(upperCode).emit(SOCKET_EVENTS.SERVER.ROOM_PLAYER_READY, { userId, isReady });

    io.to(upperCode).emit(SOCKET_EVENTS.SERVER.TOAST, {
      type: 'info',
      message: isReady ? 'Pemain siap' : 'Pemain batal siap',
    });
  });

  // Kick Player (Host only)
  socket.on(SOCKET_EVENTS.CLIENT.ROOM_KICK, async ({ code, targetUserId }) => {
    const userId = socket.data.userId;
    if (!userId) return;

    const upperCode = code.toUpperCase();
    const roomId = await getRoomIdByCode(upperCode);
    if (!roomId) return;

    const success = await kickPlayer(roomId, userId, targetUserId);
    if (!success) {
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: 'Gagal mengeluarkan pemain (bukan host atau target adalah host)',
      });
      return;
    }

    // Notify kicked player
    const targetSocketId = getUserSockets(upperCode).get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit(SOCKET_EVENTS.SERVER.ROOM_KICKED, { reason: 'KICKED_BY_HOST' });
      removeUserSocket(upperCode, targetUserId);
    }

    // Get target name for broadcast
    const targetResult = await pool.query(`SELECT name FROM users WHERE id = $1`, [targetUserId]);
    const targetName = targetResult.rows[0]?.name || 'Unknown';

    io.to(upperCode).emit(SOCKET_EVENTS.SERVER.ROOM_PLAYER_LEFT, {
      userId: targetUserId,
      name: targetName,
      reason: 'KICKED',
    });

    io.to(upperCode).emit(SOCKET_EVENTS.SERVER.TOAST, {
      type: 'info',
      message: `${targetName} dikeluarkan oleh host`,
    });

    notifyRoomsUpdated();
  });

  // Start Tournament (Host only)
  socket.on(SOCKET_EVENTS.CLIENT.TOURNAMENT_START, async ({ code }) => {
    const userId = socket.data.userId;
    if (!userId) return;

    const upperCode = code.toUpperCase();
    const roomId = await getRoomIdByCode(upperCode);
    if (!roomId) return;

    // Verify host
    const hostCheck = await pool.query(
      `SELECT host_id FROM rooms WHERE id = $1`,
      [roomId]
    );
    if (hostCheck.rows[0]?.host_id !== userId) {
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: 'Hanya host yang bisa memulai turnamen',
      });
      return;
    }

    // Check players > 1
    const playerCount = await getPlayerCount(roomId);
    if (playerCount < 2) {
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: 'Minimal 2 pemain untuk memulai',
      });
      return;
    }

    // Check all ready
    const allReady = await checkAllPlayersReady(roomId);
    if (!allReady) {
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: 'Semua pemain harus siap',
      });
      return;
    }

    const started = await startTournament(roomId, userId);
    if (!started) {
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: 'Gagal memulai turnamen',
      });
      return;
    }

    // Broadcast tournament starting to all players
    io.to(upperCode).emit(SOCKET_EVENTS.SERVER.TOURNAMENT_STARTING, {
      countdown: 3,
      firstMinigame: 1,
    });

    // Status room jadi 'starting' → hilang dari daftar publik
    notifyRoomsUpdated();
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    const userId = socket.data.userId;
    if (!userId) return;

    let roomsChanged = false;

    // Find which room this user was in
    for (const [roomCode, userMap] of userSocketMap.entries()) {
      if (userMap.get(userId) === socket.id) {
        const roomId = await getRoomIdByCode(roomCode);
        if (roomId) {
          roomsChanged = true;
          // Check if host
          const hostCheck = await pool.query(
            `SELECT host_id FROM rooms WHERE id = $1`,
            [roomId]
          );
          const isHost = hostCheck.rows[0]?.host_id === userId;

          await removePlayerFromRoom(roomId, userId);
          removeUserSocket(roomCode, userId);

          const playerResult = await pool.query(
            `SELECT name FROM users WHERE id = $1`,
            [userId]
          );
          const playerName = playerResult.rows[0]?.name || 'Unknown';

          if (isHost) {
            await pool.query(`UPDATE rooms SET status = 'finished' WHERE id = $1`, [roomId]);
            io.to(roomCode).emit(SOCKET_EVENTS.SERVER.ROOM_DISBANDED, { reason: 'HOST_DISCONNECTED' });
            userSocketMap.delete(roomCode);
          } else {
            io.to(roomCode).emit(SOCKET_EVENTS.SERVER.ROOM_PLAYER_LEFT, {
              userId,
              name: playerName,
            });
          }
        } else {
          // Room sudah tidak ada di DB — bersihin mapping stale saja
          removeUserSocket(roomCode, userId);
        }
        // CATATAN: sengaja TIDAK ada `break` — user bisa tercatat di
        // beberapa room (misal create room baru tanpa leave).
        // Semua mapping yang cocok dengan socket ini harus dibersihin.
      }
    }

    // Room bubar / jumlah pemain berubah karena disconnect
    if (roomsChanged) notifyRoomsUpdated();
  });
}