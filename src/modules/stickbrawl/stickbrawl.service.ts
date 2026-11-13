import { pool } from '../../config/db';
import { StickBrawlStanding } from '../../types';

export interface StickBrawlRoomContext {
  hostId: string;
  status: string;
  currentMinigame: number;
}

export async function getStickBrawlRoomContext(
  roomId: string
): Promise<StickBrawlRoomContext | null> {
  const result = await pool.query<StickBrawlRoomContext>(
    `SELECT
       host_id as "hostId",
       status,
       current_minigame as "currentMinigame"
     FROM rooms
     WHERE id = $1`,
    [roomId]
  );
  return result.rows[0] || null;
}

export async function markStickBrawlRoomPlaying(
  roomId: string,
  minigameNumber?: number
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE rooms
     SET status = 'playing',
         current_minigame = COALESCE($2, current_minigame),
         updated_at = NOW()
     WHERE id = $1
       AND status <> 'finished'`,
    [roomId, minigameNumber ?? null]
  );
  return (result.rowCount || 0) > 0;
}

export async function restoreRoomAfterStickBrawl(
  roomId: string,
  previousStatus: string
): Promise<void> {
  const status = previousStatus === 'waiting' ? 'waiting' : 'playing';
  await pool.query(
    `UPDATE rooms
     SET status = $1, updated_at = NOW()
     WHERE id = $2
       AND status <> 'finished'`,
    [status, roomId]
  );
}

export async function saveStickBrawlScores(
  roomId: string,
  minigameNumber: number,
  standings: StickBrawlStanding[],
  roundsPlayed: number
): Promise<void> {
  if (standings.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const player of standings) {
      await client.query(
        `INSERT INTO minigame_scores (room_id, user_id, minigame_number, score, metrics)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (room_id, user_id, minigame_number)
         DO UPDATE SET
           score = EXCLUDED.score,
           metrics = EXCLUDED.metrics,
           created_at = NOW()`,
        [
          roomId,
          player.userId,
          minigameNumber,
          player.score,
          JSON.stringify({
            game: 'stick_brawl',
            roundsPlayed,
            chests: player.chests,
            explosions: player.explosions,
            rank: player.rank,
          }),
        ]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
