import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { authRoutes } from './modules/auth/auth.routes';
import { roomsRoutes } from './modules/rooms/rooms.routes';



function resolveCorsOrigin(): boolean | string {
  return env.nodeEnv === 'development' ? true : env.clientUrl;
}

export function createApp() {
  const app = express();

  
  app.use(cors({
    origin: resolveCorsOrigin(),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  
  
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomsRoutes);

  
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' },
    });
  });

  
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled express error:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server' },
    });
  });

  return app;
}