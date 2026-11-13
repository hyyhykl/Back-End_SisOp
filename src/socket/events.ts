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

    // Stick Brawl
    STICKBRAWL_START: 'stickbrawl:start',
    STICKBRAWL_JOIN: 'stickbrawl:join',
    STICKBRAWL_SYNC: 'stickbrawl:sync',
    STICKBRAWL_RUN: 'stickbrawl:run',
    STICKBRAWL_LEAVE: 'stickbrawl:leave',
    STICKBRAWL_ABORT: 'stickbrawl:abort',
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

    // Stick Brawl
    STICKBRAWL_STATE: 'stickbrawl:state',
    STICKBRAWL_COUNTDOWN: 'stickbrawl:countdown',
    STICKBRAWL_ROUND_START: 'stickbrawl:round_start',
    STICKBRAWL_TICK: 'stickbrawl:tick',
    STICKBRAWL_CHEST_RESULT: 'stickbrawl:chest_result',
    STICKBRAWL_QUEUE_UPDATE: 'stickbrawl:queue_update',
    STICKBRAWL_ROUND_END: 'stickbrawl:round_end',
    STICKBRAWL_GAME_END: 'stickbrawl:game_end',

    // Toast/Error
    TOAST: 'toast',
  },
} as const;