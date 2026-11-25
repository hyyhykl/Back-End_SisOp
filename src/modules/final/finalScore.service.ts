import { pool } from '../../config/db';
import { getRoomPlayersWithUsers } from '../rooms/rooms.service';
import {
  AvatarColor,
  FinalScorePlayer,
  JellyfishFinalStanding,
  JellyfishPlayerKey,
} from '../../types';

interface ScoreRow {
  userId: string;
  minigameNumber: number;
  score: number;
  metrics: Record<string, unknown> | null;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(toNumber);
}

function toPlayerKey(value: unknown): JellyfishPlayerKey | undefined {
  return value === 'P1' || value === 'P2' || value === 'P3' || value === 'P4'
    ? value
    : undefined;
}

function roundScoresFromGame2Metrics(metrics: Record<string, unknown> | null): number[] {
  const rounds = metrics?.rounds;
  if (!Array.isArray(rounds)) return [];
  return rounds.map((round) => {
    if (!round || typeof round !== 'object') return 0;
    return toNumber((round as Record<string, unknown>).roundScore);
  });
}

/**
 * Builds the data for the "peringkat keseluruhan" screen from the authoritative
 * scores saved in minigame_scores. A short-lived in-memory fallback is accepted
 * for game 2 so a host clicking immediately after game_end never sees zeros
 * while the async save is still in flight.
 */
export async function buildFinalScores(
  roomId: string,
  game2Fallback: JellyfishFinalStanding[] = []
): Promise<FinalScorePlayer[]> {
  const [players, scoreResult] = await Promise.all([
    getRoomPlayersWithUsers(roomId),
    pool.query<ScoreRow>(
      `SELECT
         user_id as "userId",
         minigame_number as "minigameNumber",
         score,
         metrics
       FROM minigame_scores
       WHERE room_id = $1 AND minigame_number IN (1, 2)`,
      [roomId]
    ),
  ]);

  const scoreByUser = new Map<string, { game1?: ScoreRow; game2?: ScoreRow }>();
  for (const row of scoreResult.rows) {
    const entry = scoreByUser.get(row.userId) || {};
    if (row.minigameNumber === 1) entry.game1 = row;
    if (row.minigameNumber === 2) entry.game2 = row;
    scoreByUser.set(row.userId, entry);
  }

  const fallbackByUser = new Map(game2Fallback.map((row) => [row.userId, row]));
  const userIds = new Set<string>([
    ...players.map((player) => player.userId),
    ...scoreByUser.keys(),
    ...fallbackByUser.keys(),
  ]);

  const results = [...userIds].map<FinalScorePlayer>((userId) => {
    const roomPlayer = players.find((player) => player.userId === userId);
    const entry = scoreByUser.get(userId) || {};
    const fallback = fallbackByUser.get(userId);

    const game1Metrics = entry.game1?.metrics || {};
    const game2Metrics = entry.game2?.metrics || {};
    const game1Score = entry.game1 ? toNumber(entry.game1.score) : 0;
    const game2Score = entry.game2
      ? toNumber(entry.game2.score)
      : fallback
        ? toNumber(fallback.total)
        : 0;

    return {
      userId,
      name: roomPlayer?.name || fallback?.name || 'Pemain',
      avatarColor: (roomPlayer?.avatarColor || 'merah') as AvatarColor,
      playerKey:
        toPlayerKey(game2Metrics.playerKey) || fallback?.playerKey || undefined,
      rank: 0,
      game1Score,
      game2Score,
      totalScore: game1Score + game2Score,
      game1Rounds: toNumberArray(game1Metrics.roundScores),
      game2Rounds: entry.game2
        ? roundScoresFromGame2Metrics(game2Metrics)
        : fallback
          ? [fallback.r1, fallback.r2, fallback.r3]
          : [],
    };
  });

  results.sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      b.game2Score - a.game2Score ||
      a.name.localeCompare(b.name)
  );
  results.forEach((player, index) => {
    player.rank = index + 1;
  });

  return results;
}

/** Clears previous attempts so a replay can persist fresh scores. */
export async function resetRoomScores(
  roomId: string,
  allPlayersReady: boolean
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM minigame_scores WHERE room_id = $1`, [roomId]);
    await client.query(
      `UPDATE rooms
       SET status = 'waiting', current_minigame = 0, updated_at = NOW()
       WHERE id = $1`,
      [roomId]
    );
    await client.query(
      `UPDATE room_players
       SET is_ready = CASE WHEN is_host OR $2 THEN true ELSE false END
       WHERE room_id = $1`,
      [roomId, allPlayersReady]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
