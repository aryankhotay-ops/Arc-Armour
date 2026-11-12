// Public exports for the authoritative multiplayer server. The GameServer class is the
// embeddable API; tests construct it directly and production hosting compiles with tsc
// (or a TS-aware runtime) before `node` executes it.
export { GameServer } from './GameServer.ts';
export { ArtilleryRoom, type RoomClient, type RoomPhase } from './ArtilleryRoom.ts';
export { ServerSocket, acceptUpgrade } from './websocket.ts';
