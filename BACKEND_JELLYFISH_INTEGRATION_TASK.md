# Task: Integrate Jellyfish / Deadlock Dungeon (Minigame 2) into Backend

## Goal
Add backend support for the second game: **Jellyfish / Deadlock Dungeon**. Frontend already has Jellyfish UI/flow; backend must make it real multiplayer and server-authoritative.

## Important rules
- **Server-authoritative** for: resource allocation, deadlock detection, recovery, Banker safety check, scoring, round/timer end, final metrics.
- **Client can send**: movement/input, request resource, release resource, join/sync, host start/next.
- **Movement sync** can be simple: client sends position, server validates/clamps/rejects impossible jumps, then broadcasts state.
- Do **not** trust client for deadlock/safe-state/score decisions.
- Use room code normalization (`toUpperCase()`), check `socket.data.userId`, check room membership, and restrict host-only actions.
- Make completion idempotent (guard duplicate score insert).

## Game spec (from DEADLOCK_DUNGEON_DESKRIPSI.md)
- 3 rounds, same scenario/seed:
  - R1: **No Prevention** (Detection & Recovery)
  - R2: **Resource Ordering** (ascending order)
  - R3: **Banker’s Algorithm** (safe-state check)
- Duration: **30 seconds** per round.
- 12 resources `R1..R12`, each player needs 6.
- Missions:
  - P1: R2,R3,R4,R5,R6,R7
  - P2: R4,R5,R6,R7,R8,R9
  - P3: R7,R8,R9,R10,R11,R12
  - P4: R10,R11,R12,R1,R2,R3
- Seed/scenario must be same across 3 rounds. Use deterministic seed (frontend currently uses `48213`; backend should be source of truth).
- R1 deadlock: build wait-for graph, detect cycle (DFS). On cycle: mark deadlock, recovery after 2s, release involved resources, increment deadlock metric for involved players.
- R2 ordering: request allowed only for next ascending required resource. Otherwise reject and increment `rejectedRequests`.
- R3 Banker: simulate grant; if safe sequence exists accept, else reject and increment `rejectedRequests`.
- Scoring per round (md 12.1):
  - base 100
  - +50 per resource held at round end
  - +200 if exited
  - -15 per deadlock involved
  - +100 if 0 deadlocks involved
  - speed bonus: #1 100, #2 75, #3 50, #4 25
  - min 0
- Final score = sum of 3 rounds.
- Metrics to store per player: deadlocks involved, finished, finishTimeSec, rejectedRequests, per-round score/algorithm/scenarioId.

## Existing patterns to follow
- Generic minigame relay: [src/socket/handlers/minigame.handler.ts](src/socket/handlers/minigame.handler.ts)
- Dedicated game pattern (better template): [src/socket/handlers/stickbrawl.handler.ts](src/socket/handlers/stickbrawl.handler.ts), [src/modules/stickbrawl/stickbrawl.game.ts](src/modules/stickbrawl/stickbrawl.game.ts), [src/modules/stickbrawl/stickbrawl.service.ts](src/modules/stickbrawl/stickbrawl.service.ts)
- Socket registry: [src/socket/events.ts](src/socket/events.ts)
- Socket setup: [src/socket/socket.ts](src/socket/socket.ts)
- Types: [src/types/index.ts](src/types/index.ts)

## Files to create

### 1. `src/modules/jellyfish/jellyfish.config.ts`
Export constants/types:
- `JELLYFISH_MINIGAME_NUMBER = 2` (confirm if you want different number)
- `ROUND_SECONDS = 30`
- `DEADLOCK_RECOVERY_MS = 2000`
- arena constants, exit radius, catch radius
- `PLAYER_DEFS` / missions / spawn positions
- `JELLYFISH_ROUNDS = [{round:1,algorithm:'no_prevention'}, ...]`
- scoring helper or export config used by game

### 2. `src/modules/jellyfish/jellyfish.service.ts`
Similar to `stickbrawl.service.ts`:
- `getJellyfishRoomContext(roomId)`
- `markJellyfishRoomPlaying(roomId, minigameNumber)`
- `restoreRoomAfterJellyfish(roomId, previousStatus)`
- `saveJellyfishScores(roomId, minigameNumber, standings/rows, metrics)`

Save to `minigame_scores`:
```sql
INSERT INTO minigame_scores (room_id, user_id, minigame_number, score, metrics)
VALUES ($1, $2, $3, $4, $5::jsonb)
ON CONFLICT (room_id, user_id, minigame_number) DO NOTHING
```

### 3. `src/modules/jellyfish/jellyfish.game.ts`
Main server-authoritative game class, similar shape to `StickBrawlGame`.

Should manage:
- roomCode, roomId, hostId, players
- current round index (1-3)
- deterministic scenario (seed 48213)
- jellies/resources: id, position, owner, vx/vy if moving
- player state: pos, held, score, exited, exitTime, deadlocksInvolved, rejectedRequests, connected
- timers: round timer, tick loop, deadlock recovery timer
- metrics/log

Must implement:
- `start()` / `startRound()`
- `snapshot()` for full state sent to clients
- `registerSocket`, `hasPlayer`, `removePlayer`, `dispose`
- `handleMove(userId, pos/dir)` with validation
- `handleRequestOrCatch(userId, resourceId?)` or catch by proximity server-side
- `handleRelease(userId)`
- `advanceRound()` / host next
- R1 cycle detection (DFS over wait-for graph)
- R2 ascending order rule
- R3 Banker safety check
- round end + game end + scoring

Events emitted by game (through handler/io): `jellyfish:state`, `jellyfish:round_start`, `jellyfish:round_end`, `jellyfish:game_end`, optional `jellyfish:request_result`, `jellyfish:deadlock`.

### 4. `src/socket/handlers/jellyfish.handler.ts`
Socket handler, use `stickbrawl.handler.ts` as template.

## Files to edit

### 1. [src/socket/events.ts](src/socket/events.ts)
Add to `SOCKET_EVENTS.CLIENT`:
```ts
JELLYFISH_JOIN: 'jellyfish:join',
JELLYFISH_START: 'jellyfish:start',
JELLYFISH_MOVE: 'jellyfish:move',
JELLYFISH_REQUEST_RESOURCE: 'jellyfish:request_resource',
JELLYFISH_RELEASE: 'jellyfish:release',
JELLYFISH_NEXT_ROUND: 'jellyfish:next_round',
JELLYFISH_LEAVE: 'jellyfish:leave',
```

Add to `SOCKET_EVENTS.SERVER`:
```ts
JELLYFISH_STATE: 'jellyfish:state',
JELLYFISH_ROUND_START: 'jellyfish:round_start',
JELLYFISH_ROUND_END: 'jellyfish:round_end',
JELLYFISH_GAME_END: 'jellyfish:game_end',
JELLYFISH_REQUEST_RESULT: 'jellyfish:request_result',
JELLYFISH_DEADLOCK: 'jellyfish:deadlock',
```

Optionally also add existing frontend transition events if you want backend relay/validation:
- `jellyfish:briefing_r1:show`, `jellyfish:round1:start`, etc.

### 2. [src/types/index.ts](src/types/index.ts)
Add payload types, e.g.:

```ts
export interface JellyfishMoveData { code: string; x: number; y: number; }
export interface JellyfishRequestResourceData { code: string; resourceId: number; }
export interface JellyfishReleaseData { code: string; }
export interface JellyfishStateData { code: string; minigame: number; state: any; } // replace any with real snapshot type
```

Add event typings to `ServerToClientEvents` and `ClientToServerEvents`.

### 3. [src/socket/socket.ts](src/socket/socket.ts)
Register handler:
```ts
import { setupJellyfishHandlers } from './handlers/jellyfish.handler';
// ...
setupJellyfishHandlers(io, socket);
```

## Suggested socket contract

### Client -> Server
- `jellyfish:join` `{ code }` - join/sync current state.
- `jellyfish:start` `{ code }` - host starts Deadlock Dungeon.
- `jellyfish:move` `{ code, x, y }` - player position update.
- `jellyfish:request_resource` `{ code, resourceId }` - try to grab/catch a specific resource.
- `jellyfish:release` `{ code }` - release held resources.
- `jellyfish:next_round` `{ code }` - host advances briefing/next round.
- `jellyfish:leave` `{ code }`.

### Server -> Client
- `jellyfish:state` `{ code, state }` - authoritative snapshot (players, jellies, round, timer, status, deadlock, metrics summary).
- `jellyfish:request_result` `{ code, userId, resourceId, ok, reason, kind }` - accepted/rejected/unsafe.
- `jellyfish:deadlock` `{ code, cycleIds, recoveryMs }`.
- `jellyfish:round_end` `{ code, round, standings, metrics }`.
- `jellyfish:game_end` `{ code, finalStandings, roundResults, metricsByAlgorithm }`.

## Frontend alignment notes
Current frontend files:
- [Frontend src/App.jsx](../Frontend_SistemOperasi/src/App.jsx) - emits `jellyfish:briefing_*:show`, `jellyfish:round*:start`, `jellyfish:hasil:show`
- [Frontend src/components/jellyfish/JellyfishRound1.jsx](../Frontend_SistemOperasi/src/components/jellyfish/JellyfishRound1.jsx)
- [Frontend src/components/jellyfish/JellyfishRound2.jsx](../Frontend_SistemOperasi/src/components/jellyfish/JellyfishRound2.jsx)
- [Frontend src/components/jellyfish/JellyfishRound3.jsx](../Frontend_SistemOperasi/src/components/jellyfish/JellyfishRound3.jsx)
- [Frontend src/components/jellyfish/jellyfishScenario.js](../Frontend_SistemOperasi/src/components/jellyfish/jellyfishScenario.js)

After backend is ready, frontend should:
- stop local bot simulation / local rule decisions
- send move/request/release to backend
- render from `jellyfish:state`
- show round/game results from backend payload

## Acceptance checklist
- [ ] Host can start Jellyfish game for room with 4 ready players.
- [ ] All players receive same scenario/seed and same state updates.
- [ ] R1 detects deadlock cycles and recovers after 2s.
- [ ] R2 rejects out-of-order resource requests and increments rejectedRequests.
- [ ] R3 rejects unsafe Banker requests and increments rejectedRequests.
- [ ] Round ends at 30s or when completion condition met; host can advance to next round/hasil.
- [ ] Final scores/metrics saved in `minigame_scores` with `minigame_number = 2` (or chosen number).
- [ ] No client-side authority for allocation/deadlock/safe-state/scoring in final mode.
- [ ] Socket handlers validate user, room membership, host permissions, and input shape.

## Suggested implementation order
1. Events + types + handler registration skeleton.
2. `jellyfish.service.ts` + score persistence.
3. `jellyfish.config.ts` + scenario/player defs.
4. `jellyfish.game.ts` with round 1 first (movement, catch/request, cycle detection, recovery, timer).
5. Add R2 ordering rule.
6. Add R3 Banker safety check.
7. Add round/game end payloads and final DB save.
8. Wire frontend to use backend state instead of local simulation.

## Frontend socket contract (proposed, align with frontend)

Use this as the target contract. Frontend currently does local simulation; when wiring backend, update frontend to use these payloads.

### Existing App.jsx transition events (already emitted by frontend)
These are host-triggered UI transitions. Backend should **relay to room** only after validating sender is host/member in that room.

| Event | Payload | Sender | Backend behavior |
|---|---|---|---|
| `jellyfish:briefing_r1:show` | `{ code }` | host | validate host, broadcast to room |
| `jellyfish:round1:start` | `{ code }` | host | validate host, start/advance round 1 |
| `jellyfish:briefing_r2:show` | `{ code }` | host | validate host, broadcast |
| `jellyfish:round2:start` | `{ code }` | host | validate host, start round 2 |
| `jellyfish:briefing_r3:show` | `{ code }` | host | validate host, broadcast |
| `jellyfish:round3:start` | `{ code }` | host | validate host, start round 3 |
| `jellyfish:hasil:show` | `{ code }` | host | validate host, broadcast/show hasil |

> You can keep these names for compatibility with current `App.jsx`, or map them to `jellyfish:next_round`/`jellyfish:start` internally. Prefer compatibility first.

### New gameplay events (frontend should send)

| Event | Payload | Notes |
|---|---|---|
| `jellyfish:join` | `{ code: string }` | On mount/reconnect; backend returns/sends `jellyfish:state`. |
| `jellyfish:move` | `{ code: string, x: number, y: number }` | Player position. Backend validates bounds and max delta/speed. |
| `jellyfish:request_resource` | `{ code: string, resourceId: number }` | Player attempts to catch resource `R1..R12` (`1..12`). Backend applies R1/R2/R3 rule. |
| `jellyfish:release` | `{ code: string }` | Player releases all held resources. |

### New gameplay events (backend should emit)

#### `jellyfish:state`
```ts
{
  code: string;
  minigame: 2;
  round: 1 | 2 | 3;
  algorithm: 'no_prevention' | 'resource_ordering' | 'banker';
  status: 'briefing' | 'playing' | 'deadlock_recovery' | 'round_end' | 'game_end';
  timeLeft: number; // seconds
  seed: number;
  jellies: Array<{ id: number; x: number; y: number; owner: string | null }>;
  players: Array<{
    userId: string;
    playerKey: 'P1'|'P2'|'P3'|'P4';
    name: string;
    x: number; y: number;
    held: number[];
    score: number;
    exited: boolean;
    deadlocksInvolved: number;
    rejectedRequests: number;
  }>;
  deadlock?: { cycleIds: string[]; recoveryMsRemaining: number } | null;
  finishOrder: string[]; // userIds or P keys, be consistent
}
```

#### `jellyfish:request_result`
```ts
{
  code: string;
  userId: string;
  resourceId: number;
  ok: boolean;
  reason: 'accepted' | 'rejected_order' | 'rejected_unsafe' | 'already_owned' | 'not_target' | 'too_far' | 'round_over';
  message?: string;
}
```

#### `jellyfish:round_end`
```ts
{
  code: string;
  round: 1 | 2 | 3;
  algorithm: 'no_prevention' | 'resource_ordering' | 'banker';
  standings: Array<{
    userId: string;
    playerKey: 'P1'|'P2'|'P3'|'P4';
    roundScore: number;
    totalScore: number;
    deadlocksInvolved: number;
    rejectedRequests: number;
    finished: boolean;
    finishTimeSec: number | null;
  }>;
}
```

#### `jellyfish:game_end`
```ts
{
  code: string;
  minigame: 2;
  finalStandings: Array<{
    userId: string;
    playerKey: 'P1'|'P2'|'P3'|'P4';
    name: string;
    r1: number; r2: number; r3: number; total: number;
    deadlocks: number; rejectedRequests: number; completedRounds: number;
  }>;
  metricsByAlgorithm: Array<{
    algorithm: 'no_prevention' | 'resource_ordering' | 'banker';
    deadlocks: number;
    finishedPlayers: number;
    avgFinishTimeSec: number | null;
    rejectedRequests: number;
  }>;
}
```

## Notes for frontend implementer
- `JellyfishRound1/2/3.jsx` should stop simulating bots/rules and instead render from `jellyfish:state`.
- Send `jellyfish:move` at a throttled interval (e.g. 100-150ms) while joystick active; send `jellyfish:request_resource` on catch attempt/button; send `jellyfish:release` on Lepas.
- Keep UI the same; only data source changes.
- `JellyfishHasilAkhir.jsx` should accept real `finalStandings` from `jellyfish:game_end`.
