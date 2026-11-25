import { pool } from '../../config/db';
import {
  JellyfishAlgorithm,
  JellyfishPlayerKey,
  JellyfishRoundMetrics,
} from '../../types';

export interface JellyfishRoomContext {
  hostId: string;
  status: string;
  currentMinigame: number;
}

export interface JellyfishRoundMetricRow {
  round: number;
  algorithm: JellyfishAlgorithm;
  scenarioId: string;
  roundScore: number;
  deadlocksInvolved: number;
  rejectedRequests: number;
  finished: boolean;
  finishTimeSec: number | null;
}

export interface JellyfishScoreRow {
  userId: string;
  playerKey: JellyfishPlayerKey;
  rank: number;
  total: number;
  deadlocks: number;
  rejectedRequests: number;
  completedRounds: number;
  rounds: JellyfishRoundMetricRow[];
}

export interface JellyfishAlgorithmMetricRow extends JellyfishRoundMetrics {
  algorithm: JellyfishAlgorithm;
}

export async function getJellyfishRoomContext(
  roomId: string
): Promise<JellyfishRoomContext | null> {
  const result = await pool.query<JellyfishRoomContext>(
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

export async function markJellyfishRoomPlaying(
  roomId: string,
  minigameNumber: number
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE rooms
     SET status = 'playing',
         current_minigame = $2,
         updated_at = NOW()
     WHERE id = $1
       AND status <> 'finished'`,
    [roomId, minigameNumber]
  );
  return (result.rowCount || 0) > 0;
}

export async function restoreRoomAfterJellyfish(
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

/**
 * Server-authoritative persistence. ON CONFLICT DO NOTHING keeps completion
 * idempotent: duplicate game_end deliveries never overwrite or double-count.
 */
export async function saveJellyfishScores(
  roomId: string,
  minigameNumber: number,
  rows: JellyfishScoreRow[],
  metricsByAlgorithm: JellyfishAlgorithmMetricRow[]
): Promise<void> {
  if (rows.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const row of rows) {
      const metrics = {
        game: 'jellyfish',
        scenarioId: row.rounds[0]?.scenarioId ?? null,
        playerKey: row.playerKey,
        rank: row.rank,
        totalDeadlocks: row.deadlocks,
        rejectedRequests: row.rejectedRequests,
        completedRounds: row.completedRounds,
        rounds: row.rounds,
        metricsByAlgorithm,
      };

      await client.query(
        `INSERT INTO minigame_scores (room_id, user_id, minigame_number, score, metrics)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (room_id, user_id, minigame_number) DO NOTHING`,
        [roomId, row.userId, minigameNumber, row.total, JSON.stringify(metrics)]
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
