// Event names constants for type safety

export const SOCKET_EVENTS = {
  // Client -> Server
  CLIENT: {
    AUTH: 'auth',
    ROOM_JOIN: 'room:join',
    ROOM_LEAVE: 'room:leave',
    ROOM_SET_READY: 'room:set_ready',
    ROOM_KICK: 'room:kick',
    TOURNAMENT_START: 'tournament:start',
    GAME_INPUT: 'game:input',
    MINIGAME_SUBMIT_SCORE: 'minigame:submit_score',
  },

  // Server -> Client
  SERVER: {
    // Lobby
    ROOM_STATE: 'room:state',
    ROOM_PLAYER_JOINED: 'room:player_joined',
    ROOM_PLAYER_LEFT: 'room:player_left',
    ROOM_PLAYER_READY: 'room:player_ready',
    ROOM_DISBANDED: 'room:disbanded',
    ROOM_KICKED: 'room:kicked',

    // Tournament
    TOURNAMENT_STARTING: 'tournament:starting',

    // Toast/Error
    TOAST: 'toast',
  },
} as const;