

export const SOCKET_EVENTS = {
  
  CLIENT: {
    AUTH: 'auth',
    ROOM_JOIN: 'room:join',
    ROOM_LEAVE: 'room:leave',
    ROOM_SET_READY: 'room:set_ready',
    ROOM_KICK: 'room:kick',
    TOURNAMENT_START: 'tournament:start',
    GAME_INPUT: 'game:input',
    MINIGAME_SUBMIT_SCORE: 'minigame:submit_score',
    MINIGAME_INPUT: 'minigame:input',
    MINIGAME_STATE: 'minigame:state',
    MINIGAME_COMPLETE: 'minigame:complete',
    MINIGAME_COMMAND: 'minigame:command',

    
    STICKBRAWL_START: 'stickbrawl:start',
    STICKBRAWL_JOIN: 'stickbrawl:join',
    STICKBRAWL_SYNC: 'stickbrawl:sync',
    STICKBRAWL_RUN: 'stickbrawl:run',
    STICKBRAWL_LEAVE: 'stickbrawl:leave',
    STICKBRAWL_ABORT: 'stickbrawl:abort',

    
    JELLYFISH_JOIN: 'jellyfish:join',
    JELLYFISH_START: 'jellyfish:start',
    JELLYFISH_MOVE: 'jellyfish:move',
    JELLYFISH_REQUEST_RESOURCE: 'jellyfish:request_resource',
    JELLYFISH_RELEASE: 'jellyfish:release',
    JELLYFISH_NEXT_ROUND: 'jellyfish:next_round',
    JELLYFISH_LEAVE: 'jellyfish:leave',

    
    
    JELLYFISH_BRIEFING_R1_SHOW: 'jellyfish:briefing_r1:show',
    JELLYFISH_ROUND1_START: 'jellyfish:round1:start',
    JELLYFISH_BRIEFING_R2_SHOW: 'jellyfish:briefing_r2:show',
    JELLYFISH_ROUND2_START: 'jellyfish:round2:start',
    JELLYFISH_BRIEFING_R3_SHOW: 'jellyfish:briefing_r3:show',
    JELLYFISH_ROUND3_START: 'jellyfish:round3:start',
    JELLYFISH_HASIL_SHOW: 'jellyfish:hasil:show',

    
    FINAL_SCORE_SHOW: 'final:score_show',
    FINAL_LOBBY: 'final:lobby',
    FINAL_PLAY_AGAIN: 'final:play_again',
  },

  
  SERVER: {
    
    ROOM_STATE: 'room:state',
    ROOM_PLAYER_JOINED: 'room:player_joined',
    ROOM_PLAYER_LEFT: 'room:player_left',
    ROOM_PLAYER_READY: 'room:player_ready',
    ROOM_DISBANDED: 'room:disbanded',
    ROOM_KICKED: 'room:kicked',

    
    ROOMS_UPDATED: 'rooms:updated',

    
    TOURNAMENT_STARTING: 'tournament:starting',

    
    MINIGAME_INPUT: 'minigame:input',
    MINIGAME_STATE: 'minigame:state',

    
    STICKBRAWL_STATE: 'stickbrawl:state',
    STICKBRAWL_COUNTDOWN: 'stickbrawl:countdown',
    STICKBRAWL_ROUND_START: 'stickbrawl:round_start',
    STICKBRAWL_TICK: 'stickbrawl:tick',
    STICKBRAWL_CHEST_RESULT: 'stickbrawl:chest_result',
    STICKBRAWL_QUEUE_UPDATE: 'stickbrawl:queue_update',
    STICKBRAWL_ROUND_END: 'stickbrawl:round_end',
    STICKBRAWL_GAME_SUMMARY: 'stickbrawl:game_summary',
    STICKBRAWL_GAME_END: 'stickbrawl:game_end',

    
    JELLYFISH_STATE: 'jellyfish:state',
    JELLYFISH_ROUND_START: 'jellyfish:round_start',
    JELLYFISH_ROUND_END: 'jellyfish:round_end',
    JELLYFISH_GAME_END: 'jellyfish:game_end',
    JELLYFISH_REQUEST_RESULT: 'jellyfish:request_result',
    JELLYFISH_DEADLOCK: 'jellyfish:deadlock',

    
    JELLYFISH_BRIEFING_R1_SHOW: 'jellyfish:briefing_r1:show',
    JELLYFISH_ROUND1_START: 'jellyfish:round1:start',
    JELLYFISH_BRIEFING_R2_SHOW: 'jellyfish:briefing_r2:show',
    JELLYFISH_ROUND2_START: 'jellyfish:round2:start',
    JELLYFISH_BRIEFING_R3_SHOW: 'jellyfish:briefing_r3:show',
    JELLYFISH_ROUND3_START: 'jellyfish:round3:start',
    JELLYFISH_HASIL_SHOW: 'jellyfish:hasil:show',

    
    FINAL_SCORE_SHOW: 'final:score_show',
    FINAL_LOBBY: 'final:lobby',

    
    TOAST: 'toast',
  },
} as const;