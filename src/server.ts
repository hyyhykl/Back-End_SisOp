import { config } from 'dotenv';
config({ path: '.env' });

import { createServer } from 'http';
import { createApp } from './app';
import { initSocket } from './socket/socket';
import { env } from './config/env';
import { cleanupStaleRooms } from './modules/rooms/rooms.service';
import { notifyRoomsUpdated } from './socket/notify';

async function runRoomCleanup() {
  try {
    const count = await cleanupStaleRooms(3);
    if (count > 0) {
      console.log(`🧹 ${count} room lama ditandai finished (tidak ada aktivitas)`);
      notifyRoomsUpdated();
    }
  } catch (error) {
    console.error('❌ Gagal membersihkan room lama:', error);
  }
}

function startServer() {
  const app = createApp();
  const httpServer = createServer(app);

  
  initSocket(httpServer);

  
  httpServer.listen(env.port, () => {
    console.log(`
🚀 Kernel Clash Arcade Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 REST API:     http://localhost:${env.port}/api
🔌 WebSocket:    ws://localhost:${env.port}
🌍 Environment:  ${env.nodeEnv}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

    
    runRoomCleanup();
    const cleanupTimer = setInterval(runRoomCleanup, 30 * 60 * 1000);
    cleanupTimer.unref();
  });

  
  const shutdown = (signal: string) => {
    console.log(`\n📴 Received ${signal}. Shutting down gracefully...`);
    httpServer.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });

    
    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer();