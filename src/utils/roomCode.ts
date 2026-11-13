const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars: I, O, 1, 0
const CODE_LENGTH = 6;

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * CHARSET.length);
    code += CHARSET[randomIndex];
  }
  return code;
}

export async function generateUniqueRoomCode(pool: any): Promise<string> {
  let code: string;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 10;

  while (exists && attempts < maxAttempts) {
    code = generateRoomCode();
    const result = await pool.query('SELECT 1 FROM rooms WHERE code = $1', [code]);
    exists = result.rows.length > 0;
    attempts++;
  }

  if (exists) {
    throw new Error('Unable to generate unique room code after max attempts');
  }

  return code!;
}