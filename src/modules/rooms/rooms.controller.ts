import { Request, Response } from 'express';
import {
  getPublicRooms,
  createRoom,
  getRoomByCode,
} from './rooms.service';
import { getUserById } from '../auth/auth.service';
import { notifyRoomsUpdated } from '../../socket/notify';
import { CreateRoomRequest, ApiResponse, PublicRoomInfo, RoomDetailResponse } from '../../types';

export async function listPublicRooms(req: Request, res: Response) {
  try {
    const rooms = await getPublicRooms();
    return res.json({
      success: true,
      data: rooms,
    } as ApiResponse<PublicRoomInfo[]>);
  } catch (error) {
    console.error('List rooms error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil daftar room' },
    } as ApiResponse<never>);
  }
}

export async function createRoomHandler(req: Request, res: Response) {
  try {
    const { name, isPrivate, userId } = req.body as CreateRoomRequest;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_NAME', message: 'Nama room tidak boleh kosong' },
      } as ApiResponse<never>);
    }

    if (name.trim().length > 20) {
      return res.status(400).json({
        success: false,
        error: { code: 'NAME_TOO_LONG', message: 'Nama room maksimal 20 karakter' },
      } as ApiResponse<never>);
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER_ID', message: 'User ID diperlukan' },
      } as ApiResponse<never>);
    }

    
    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Sesi tamu sudah tidak berlaku. Refresh halaman dan masukkan nama lagi.',
        },
      } as ApiResponse<never>);
    }

    const room = await createRoom({ name: name.trim(), isPrivate: !!isPrivate, userId });

    
    notifyRoomsUpdated();

    return res.status(201).json({
      success: true,
      data: room,
    } as ApiResponse<typeof room>);
  } catch (error) {
    console.error('Create room error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Gagal membuat room' },
    } as ApiResponse<never>);
  }
}

export async function getRoomDetail(req: Request, res: Response) {
  try {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;

    if (!code || code.length !== 6) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CODE', message: 'Kode room harus 6 karakter' },
      } as ApiResponse<never>);
    }

    const room = await getRoomByCode(code.toUpperCase());

    if (!room) {
      return res.status(404).json({
        success: false,
        error: { code: 'ROOM_NOT_FOUND', message: 'Room tidak ditemukan' },
      } as ApiResponse<never>);
    }

    if (room.currentPlayers >= room.maxPlayers) {
      return res.status(409).json({
        success: false,
        error: { code: 'ROOM_FULL', message: 'Room sudah penuh' },
      } as ApiResponse<never>);
    }

    return res.json({
      success: true,
      data: room,
    } as ApiResponse<RoomDetailResponse>);
  } catch (error) {
    console.error('Get room detail error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil detail room' },
    } as ApiResponse<never>);
  }
}