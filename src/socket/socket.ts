import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { getUserById } from '../modules/auth/auth.service';
import { setupLobbyHandlers } from './handlers/lobby.handler';
import { setupMinigameHandlers } from './handlers/minigame.handler';
import { setupStickBrawlHandlers } from './handlers/stickbrawl.handler';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from '../types';

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

let io: TypedServer;

// Development: allow SEMUA origin (URL ngrok berubah tiap restart).
// Production: hanya origin dari CLIENT_URL.
function resolveCorsOrigin(): boolean | string {
  return env.nodeEnv === 'development' ? true : env.clientUrl;
}

async function authenticateSocketFromHandshake(socket: TypedSocket): Promise<void> {
  const authUserId = socket.handshake.auth?.userId;
  if (typeof authUserId !== 'string' || !authUserId) return;

  socket.data.userId = authUserId;
  const user = await getUserById(authUserId);
  if (user) {
    socket.data.userName = user.name;
    socket.data.avatarColor = user.avatarColor;
    console.log(`🔐 Socket handshake authenticated: ${authUserId} (${user.name})`);
  } else {
    console.log(`⚠️ Socket handshake auth FAILED (user not found): ${authUserId}`);
    socket.emit('toast', {
      type: 'error',
      message: 'Sesi tamu kedaluwarsa. Refresh halaman dan masukkan nama lagi.',
    });
  }
}

export function initSocket(httpServer: HttpServer): TypedServer {
  io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
      origin: resolveCorsOrigin(),
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
    },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  io.on('connection', (socket: TypedSocket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    void authenticateSocketFromHandshake(socket);

    // Setup all handlers
    setupLobbyHandlers(io, socket);
    setupMinigameHandlers(io, socket);
    setupStickBrawlHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);
    });

    socket.on('error', (error) => {
      console.error(`❌ Socket error: ${socket.id}`, error);
    });
  });

  console.log('✅ Socket.io initialized');
  return io;
}

export function getIO(): TypedServer {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initSocket first.');
  }
  return io;
}