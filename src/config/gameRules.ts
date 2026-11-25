/**
 * Every game in the tournament uses a full room.
 *
 * Rooms are capped at 4 players, so "minimum 4" and "maximum 4" mean the same
 * thing: a game may only start (and may only continue) with exactly 4 players.
 * Keep this in one place so the lobby, tournament and each minigame agree.
 */
export const REQUIRED_PLAYERS = 4;

/** Room capacity. Kept as an alias for callers that talk about the room, not a game. */
export const ROOM_MAX_PLAYERS = REQUIRED_PLAYERS;

export const PLAYERS_REQUIRED_MESSAGE = `Butuh ${REQUIRED_PLAYERS} pemain untuk memulai permainan.`;
