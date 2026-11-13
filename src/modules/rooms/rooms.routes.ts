import { Router } from 'express';
import { listPublicRooms, createRoomHandler, getRoomDetail } from './rooms.controller';

const router = Router();

router.get('/', listPublicRooms);
router.post('/', createRoomHandler);
router.get('/:code', getRoomDetail);

export { router as roomsRoutes };