# Deploying Arc & Armor

The game has two deployable pieces with different hosting needs:

| Piece         | What it is                                                          | Where it runs                                                                                                                                     |
| ------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/client` | Static Phaser bundle (`apps/client/dist`)                           | Vercel — configured by [`vercel.json`](../vercel.json), auto-deploys from `main`                                                                  |
| `apps/server` | Persistent Node.js WebSocket server (`apps/server/dist/server.mjs`) | Any long-running Node host — Render blueprint in [`render.yaml`](../render.yaml), or the Docker image in [`Dockerfile.server`](Dockerfile.server) |

Vercel cannot host the server: it has no long-lived processes, so every "Create room" would
hang and fail. Local play never needs the server.

## Current production endpoints

- Game: <https://arc-armour.vercel.app>
- Server: `wss://arc-armour-server.onrender.com/`
- Health: <https://arc-armour-server.onrender.com/health>
- Render service: <https://dashboard.render.com/web/srv-dbqnqtajnfac7398tf40>

The service already exists. Do not import the Blueprint again unless creating a separate
staging environment. Vercel auto-deploys from `main`; Production and Preview have
`VITE_MULTIPLAYER_URL` configured. Render currently clones the public repository URL, so
use **Manual Deploy → Deploy latest commit** or its API for server changes. Automatic
server deployments require connecting the repository through Render's GitHub integration.
Server redeploys reset in-memory rooms.

## 1. Deploy the server (Render)

1. In the Render dashboard choose **New → Blueprint**, pick the `Arc-Armour` repo and accept
   the detected `render.yaml`. This creates the `arc-armour-server` web service on the free
   plan (Node 22, `/health` probe, `pnpm --filter @artillery/server build`).
2. When the first deploy finishes, note the public URL, e.g.
   `https://arc-armour-server.onrender.com`. Render terminates TLS, so the browser connects
   with **`wss://arc-armour-server.onrender.com/`**.
3. Smoke-check: `curl https://arc-armour-server.onrender.com/health` should return
   `{"ok":true,"protocolVersion":3,...}`.

Free Render services spin down after ~15 minutes idle and take about a minute to wake.
The client allows up to 90 seconds for an initial Render connection and displays a wake-up
notice. Other hosts and reconnects use a 6-second handshake budget. The free plan is not
always-on; use a paid plan if cold starts are unacceptable.

## 2. Point the client at it

Set a build-time environment variable on the Vercel project (**Settings → Environment
Variables**, scope: Production):

```
VITE_MULTIPLAYER_URL = wss://arc-armour-server.onrender.com/
```

then redeploy the client (`vercel --prod`, or push any commit). Vite inlines the value, so
the ONLINE panel's unconfigured notice disappears and rooms connect to Render.

Without rebuilding, any visitor can test a server with a URL parameter:
`https://arc-armour.vercel.app/?server=wss://arc-armour-server.onrender.com/`. Invitation
links preserve the parameter.

## 3. Verify end to end

Open the site in two browsers (or an incognito window), **Online multiplayer → Create
room** in one, copy the invitation link into the other, both press **I'm ready**. The
battlefield should appear on both with identical terrain, and the status strip should read
CONNECTED with a latency figure.

## Running the server anywhere else

```sh
pnpm --filter @artillery/server build
PORT=8090 node apps/server/dist/server.mjs       # binds 0.0.0.0 when PORT is set
```

Environment: `PORT` (default 8090), `HOST` (default `0.0.0.0` when `PORT` is set, otherwise
loopback), `GRACE_SECONDS` (reconnect grace before a dropped seat forfeits, default 30).
The process speaks plain `ws://`; put it behind any TLS-terminating proxy for `wss://`.
