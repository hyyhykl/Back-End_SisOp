import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { setupLobbyHandlers } from './handlers/lobby.handler';
import { SOCKET_EVENTS } from './events';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from '../types';

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

let io: TypedServer;

// Development: allow SEMUA origin (URL ngrok berubah tiap restart).
// Production: hanya origin dari CLIENT_URL.
function resolveCorsOrigin(): boolean | string {
  return env.nodeEnv === 'development' ? true : env.clientUrl;
}

export function initSocket(httpServer: HttpServer): TypedServer {
  io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
      origin: resolveCorsOrigin(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  io.on('connection', (socket: TypedSocket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Setup all handlers
    setupLobbyHandlers(io, socket);

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