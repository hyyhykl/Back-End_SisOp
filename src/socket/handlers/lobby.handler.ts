import { Server, Socket } from 'socket.io';
import { pool } from '../../config/db';
import { PLAYERS_REQUIRED_MESSAGE, REQUIRED_PLAYERS, ROOM_MAX_PLAYERS } from '../../config/gameRules';
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


const userSocketMap = new Map<string, Map<string, string>>(); 

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
  
  socket.on(SOCKET_EVENTS.CLIENT.AUTH, async (userId: string) => {
    socket.data.userId = userId;

    const user = await getUserById(userId);
    if (user) {
      socket.data.userName = user.name;
      socket.data.avatarColor = user.avatarColor;
      console.log(`🔐 Socket authenticated: ${userId} (${user.name})`);
    } else {
      
      console.log(`⚠️ Socket auth FAILED (user not found): ${userId}`);
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: 'Sesi tamu kedaluwarsa. Refresh halaman dan masukkan nama lagi.',
      });
    }
  });

  
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

    
    const playerCount = await getPlayerCount(roomId);
    if (playerCount >= ROOM_MAX_PLAYERS) {
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: `Room sudah penuh (maksimal ${ROOM_MAX_PLAYERS} pemain)`,
      });
      return;
    }

    
    const existing = await pool.query(
      `SELECT 1 FROM room_players WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
    const isRejoin = existing.rows.length > 0;

    
    const player = await addPlayerToRoom(roomId, userId);
    if (!player) {
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: 'Gagal bergabung ke room',
      });
      return;
    }

    
    socket.join(upperCode);

    
    getUserSockets(upperCode).set(userId, socket.id);

    
    const players = await getRoomPlayersWithUsers(roomId);
    const isHost = players.some(p => p.userId === userId && p.isHost);

    
    const roomState: RoomState = {
      room: {
        roomId,
        code: upperCode,
        name: '', 
        status: 'waiting',
        maxPlayers: ROOM_MAX_PLAYERS,
      },
      players,
      me: { userId, isHost },
    };

    
    const roomNameResult = await pool.query(
      `SELECT name FROM rooms WHERE id = $1`,
      [roomId]
    );
    roomState.room.name = roomNameResult.rows[0]?.name || '';

    socket.emit(SOCKET_EVENTS.SERVER.ROOM_STATE, roomState);

    
    if (!isRejoin) {
      socket.to(upperCode).emit(SOCKET_EVENTS.SERVER.ROOM_PLAYER_JOINED, player);

      
      io.to(upperCode).emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'info',
        message: `${player.name} bergabung ke room`,
      });
    }

    console.log(`👤 ${player.name} joined room ${upperCode}`);

    
    notifyRoomsUpdated();
  });

  
  socket.on(SOCKET_EVENTS.CLIENT.ROOM_LEAVE, async ({ code }) => {
    const startedAt = Date.now();
    const userId = socket.data.userId;
    if (!userId || !code) return;

    const upperCode = code.toUpperCase();
    const roomId = await getRoomIdByCode(upperCode);
    if (!roomId) return;

    
    const playerResult = await pool.query(
      `SELECT name FROM users WHERE id = $1`,
      [userId]
    );
    const playerName = playerResult.rows[0]?.name || 'Unknown';

    
    const hostCheck = await pool.query(
      `SELECT host_id FROM rooms WHERE id = $1`,
      [roomId]
    );
    const isHost = hostCheck.rows[0]?.host_id === userId;

    await removePlayerFromRoom(roomId, userId);
    removeUserSocket(upperCode, userId);

    
    
    
    
    if (isHost) {
      
      await pool.query(`UPDATE rooms SET status = 'finished' WHERE id = $1`, [roomId]);
      io.to(upperCode).emit(SOCKET_EVENTS.SERVER.ROOM_DISBANDED, { reason: 'HOST_LEFT' });
      
      userSocketMap.delete(upperCode);
    } else {
      
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

    
    
    console.log(`⏱ room:leave ${upperCode} selesai dalam ${Date.now() - startedAt} ms`);

    
    notifyRoomsUpdated();
  });

  
  socket.on(SOCKET_EVENTS.CLIENT.ROOM_SET_READY, async ({ code, isReady }) => {
    const userId = socket.data.userId;
    if (!userId) return;

    const upperCode = code.toUpperCase();
    const roomId = await getRoomIdByCode(upperCode);
    if (!roomId) return;

    
    const hostCheck = await pool.query(
      `SELECT 1 FROM room_players WHERE room_id = $1 AND user_id = $2 AND is_host = true`,
      [roomId, userId]
    );
    if (hostCheck.rows.length > 0) return; 

    await setPlayerReady(roomId, userId, isReady);

    
    io.to(upperCode).emit(SOCKET_EVENTS.SERVER.ROOM_PLAYER_READY, { userId, isReady });

    io.to(upperCode).emit(SOCKET_EVENTS.SERVER.TOAST, {
      type: 'info',
      message: isReady ? 'Pemain siap' : 'Pemain batal siap',
    });
  });

  
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

    
    const targetSocketId = getUserSockets(upperCode).get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit(SOCKET_EVENTS.SERVER.ROOM_KICKED, { reason: 'KICKED_BY_HOST' });
      removeUserSocket(upperCode, targetUserId);
    }

    
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

  
  socket.on(SOCKET_EVENTS.CLIENT.TOURNAMENT_START, async ({ code }) => {
    const userId = socket.data.userId;
    if (!userId) return;

    const upperCode = code.toUpperCase();
    const roomId = await getRoomIdByCode(upperCode);
    if (!roomId) return;

    
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

    
    const playerCount = await getPlayerCount(roomId);
    if (playerCount !== REQUIRED_PLAYERS) {
      socket.emit(SOCKET_EVENTS.SERVER.TOAST, {
        type: 'error',
        message: PLAYERS_REQUIRED_MESSAGE,
      });
      return;
    }

    
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

    
    io.to(upperCode).emit(SOCKET_EVENTS.SERVER.TOURNAMENT_STARTING, {
      countdown: 1,
      firstMinigame: 1,
    });

    
    notifyRoomsUpdated();
  });

  
  socket.on('disconnect', async () => {
    const userId = socket.data.userId;
    if (!userId) return;

    let roomsChanged = false;

    
    for (const [roomCode, userMap] of userSocketMap.entries()) {
      if (userMap.get(userId) === socket.id) {
        const roomId = await getRoomIdByCode(roomCode);
        if (roomId) {
          roomsChanged = true;
          
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
          
          removeUserSocket(roomCode, userId);
        }
        
        
        
      }
    }

    
    if (roomsChanged) notifyRoomsUpdated();
  });
}