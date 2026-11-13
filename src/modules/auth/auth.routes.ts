import { Router } from 'express';
import { createGuest } from './auth.controller';

const router = Router();

router.post('/guest', createGuest);

export { router as authRoutes };