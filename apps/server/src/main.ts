// Standalone launcher: `node apps/server/src/main.ts` (Node >= 23 strips types natively;
// older hosts compile with tsc first). Reads PORT/HOST from the environment.
import console from 'node:console';
import process from 'node:process';

import { GameServer } from './GameServer.ts';

const port = Number(process.env.PORT ?? 8090);
const host = process.env.HOST ?? '127.0.0.1';
// Reconnection grace (seconds) before a dropped seat forfeits; tests shorten it.
const graceSeconds = Number(process.env.GRACE_SECONDS ?? 30);

const server = new GameServer({ graceSeconds });
const boundPort = await server.listen(port, host);
console.log(`Arc & Armor authoritative server listening on ws://${host}:${boundPort}/`);
console.log(`Health endpoint: http://${host}:${boundPort}/health`);

const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
