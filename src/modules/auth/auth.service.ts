import { pool } from '../../config/db';
import { AuthGuestRequest, AuthGuestResponse, User } from '../../types';

export async function createGuestUser(data: AuthGuestRequest): Promise<AuthGuestResponse> {
  const { name, avatarColor } = data;

  const result = await pool.query<AuthGuestResponse>(
    `INSERT INTO users (name, avatar_color) VALUES ($1, $2) RETURNING id as "userId", name, avatar_color as "avatarColor"`,
    [name.trim(), avatarColor]
  );

  return result.rows[0];
}

export async function getUserById(userId: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, name, avatar_color as "avatarColor", created_at as "createdAt" FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}