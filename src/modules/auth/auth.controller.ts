import { Request, Response } from 'express';
import { createGuestUser } from './auth.service';
import { AVATAR_COLORS, COLOR_NAMES } from '../../config/playerColors';
import { AuthGuestRequest, ApiResponse } from '../../types';

export async function createGuest(req: Request, res: Response) {
  try {
    const { name, avatarColor } = req.body as AuthGuestRequest;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_NAME', message: 'Nama tidak boleh kosong' },
      } as ApiResponse<never>);
    }

    if (name.trim().length > 12) {
      return res.status(400).json({
        success: false,
        error: { code: 'NAME_TOO_LONG', message: 'Nama maksimal 12 karakter' },
      } as ApiResponse<never>);
    }

    const validColors: AuthGuestRequest['avatarColor'][] = AVATAR_COLORS;
    if (!validColors.includes(avatarColor)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_COLOR', message: 'Warna avatar tidak valid' },
      } as ApiResponse<never>);
    }

    // Nama tamu selalu mengikuti warna. Warna final ditetapkan ulang saat join
    // room agar cada room punya Merah/Hijau/Biru/Kuning tepat satu kali.
    const user = await createGuestUser({
      name: COLOR_NAMES[avatarColor],
      avatarColor,
    });

    return res.status(201).json({
      success: true,
      data: user,
    } as ApiResponse<typeof user>);
  } catch (error) {
    console.error('Create guest error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Gagal membuat user tamu' },
    } as ApiResponse<never>);
  }
}