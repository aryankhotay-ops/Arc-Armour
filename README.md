# Arc & Armor

Arc & Armor is an original two-player, turn-based artillery game for the web. The project uses TypeScript and Phaser 3, with deterministic gameplay isolated from rendering so that the same simulation can later power both local play and an authoritative multiplayer server.

This repository implements **Milestone 0** plus a playable local combat vertical slice from the [development plan](plan.md). It includes an arcade menu, local setup, weapon catalog/draft, responsive Phaser battlefield, terrain-following tank movement, aiming, swept projectile combat, destructible/additive terrain, alternating turns, inventory, original audio, pause/help and saved preferences. Normal play now uses only **60 Original + Deluxe reference weapons**, with original HP-based behavior adaptations. Fourteen tank choices include refined reference-inspired silhouettes and separately rotating barrels. Dedicated results flow, broader balance/qualification and online multiplayer remain later work; the local release gate is not yet passed.

## Workspace port and porting-bug fixes — latest, 2026-11-12

The project moved from `starter/artillery-game` into its own workspace (`game/`). A full
re-validation from a clean install surfaced three problems, all fixed:

- **Lockfile drift (install bug):** `apps/server/package.json` declared workspace
  dependencies that `pnpm-lock.yaml` never recorded, so `pnpm install --frozen-lockfile`
  (the CI path) failed. The lockfile is regenerated and frozen installs pass.
- **Undeclared `esbuild` (build bug):** the server's `build` script shells out to `esbuild`
  but nothing declared it, so `pnpm build`/`pnpm check` failed with `esbuild: command not
  found` unless a hoisted copy happened to exist. It is now an explicit devDependency.
- **Online aim intents overwrote each other (gameplay bug):** in online matches the HUD's
  angle slider sent `{newAngle, confirmedPower}` and the power slider sent
  `{confirmedAngle, newPower}`, both reading the *server-confirmed* mirror state. Changing
  power right after angle therefore reverted the angle to its stale value before the
  server echoed the first intent, so the fired shot did not match the sliders. The engine
  now exposes `intendedAim` ([GameEngine.ts](packages/simulation/src/match/GameEngine.ts));
  the mirror overrides it with the pending intent
  ([OnlineMirrorEngine.ts](apps/client/src/online/OnlineMirrorEngine.ts)) and the HUD and
  held-key `adjustAim` read it ([BattleHud.ts](apps/client/src/ui/BattleHud.ts)). Local play
  is unchanged (`intendedAim` is the active tank's aim). Four new unit tests pin the
  contract ([OnlineMirrorEngine.test.ts](apps/client/src/online/OnlineMirrorEngine.test.ts)).
- The complete-online-cycle browser test also raced its own fire click: "aiming with zero
  projectiles" is still true for a moment before the server echoes `fire`. It now waits for
  the authoritative turn counter to advance ([onlineMatch.spec.ts](tests/e2e/onlineMatch.spec.ts)).

**Verified from a clean install:** lint, strict typecheck (5 packages), client + server
production build, **509 unit tests**, and the complete default Chromium suite — 122/126 in
one parallel run, with the four parallel-load timeouts (two online, one tank-selection, one
terrain-variety) all passing when rerun serially (28/28). The copied Neon Snake prototype
lives in `extras/`.

## Multiplayer reliability and the complete match cycle — earlier, 2026-11-10

User request: connection status/latency/disconnect notifications/reconnect handling,
abandoned-room cleanup, duplicate-fire and unauthorized-action prevention, delayed-message
handling, state preservation through short interruptions, and the complete match flow —
results, winner announcements, rematch voting, return to lobby, departure handling, and
no-refresh rematches with full state reset. Protocol bumped to v3.

**Reliability (server, [ArtilleryRoom.ts](apps/server/src/ArtilleryRoom.ts) /
[GameServer.ts](apps/server/src/GameServer.ts)):**

- Accepted gameplay commands append to an **indexed command log** that rebroadcasts live
  (each `command-applied` carries its log index) and replays in full on reconnect.
- **One accepted fire per turn:** fire commands carry the turn number; duplicates are
  rejected `already-fired`, delayed fires from earlier turns `stale-turn`, before the
  engine is touched. Waiting-player intents and forged commands remain rejected.
- **Disconnect grace:** a transport drop (vs. explicit leave) holds the seat for a
  configurable grace (default 30s; `GRACE_SECONDS` env), broadcasts
  `opponent-disconnected/reconnected`, keeps the match fully alive, blocks seat theft
  (newcomers get `room-full`, wrong tokens `invalid-resume`), and forfeits only when the
  grace expires. `welcome` now issues a secret per-session resume token.
- **Ping/pong** latency probes; **abandoned-room sweep** disposes lobby rooms nobody
  occupies (~30s) and explicit departures reap immediately.
- **Rematch voting:** finished rooms accept `rematch` votes; both votes construct a brand
  new engine on a deterministically derived fresh seed — health, terrain, weapon
  inventories, projectiles and turn order all reset in one step.

**Reliability (client, [OnlineClient.ts](apps/client/src/online/OnlineClient.ts) /
[BattlefieldScene.ts](apps/client/src/scenes/BattlefieldScene.ts)):**

- Connection status strip over the battlefield: CONNECTED/RECONNECTING/CLOSED, live
  latency from 2s pings, and opponent-disconnect notices with the grace countdown text.
- **Automatic reconnection** with backoff presents the resume token; on `resumed` the
  deterministic mirror is **rebuilt by replaying the accepted-command log**, restoring the
  exact match state (aim included) without a page reload.
- **Ordered delivery:** command-applied events are buffered by log index, so delayed or
  reordered messages can never corrupt or reorder the mirror replay.
- **Results flow:** a native results panel announces VICTORY/WINS/DRAW (forfeit noted),
  offers REMATCH voting (live opponent-vote status) and RETURN TO MENU. When both vote,
  the scene restarts with the SAME transport — a fresh match without refreshing the site.

**Verified:** [9 reliability server tests](apps/server/tests/Reliability.test.ts) (ping echo,
duplicate/stale fire with exactly one log entry, unauthorized/forged rejection, hold+resume
with full log replay and post-resume authority, wrong-token + grace-expiry forfeit, held-seat
protection, room cleanup, and the complete cycle: match → winner → votes → full reset →
second playable match). All 25 server tests and **505 unit tests** pass. 4 browser tests pass
([onlineMatch.spec.ts](tests/e2e/onlineMatch.spec.ts)): synchronized turns with status/latency
strip and forfeit results, the complete UI cycle (the deterministic probe engine finds real
hitting solutions on live seeded terrain; rematch resets turn/health/terrain/projectiles and
differs the seed identically on both screens; second match playable on the same sockets),
automatic reconnect after an abrupt transport drop preserving the pre-drop aim, and lobby
departure/seat reuse. Lint/typecheck clean.

**Still open:** TLS/WSS public deployment, snapshot-checksum resync (the command log makes
divergence detectable but auto-resync is not wired), and the local release-gate items.

## Online rooms, invites and synchronized matches — earlier, 2026-11-10

User request: online room creation/joining with a 4-letter code and shareable invitation
link, cross-network two-player rooms with names/ready/departure, synchronized gameplay
connected to the multiplayer server, server authority for all important events, identical
projectile trajectories and terrain changes on both clients, and complete-match tests with
separate clients. This completes the client side of Milestone 14 for private rooms.

**Lobby:** the main menu's ONLINE destination is now a real lobby
([OnlinePanel.ts](apps/client/src/online/OnlinePanel.ts)): create a private room (receives
a collision-free 4-letter alphanumeric code) or join by code; a shareable invitation link
(`?join=CODE`) lands a friend directly on the join form with the code prefilled
([OnlineClient.ts](apps/client/src/online/OnlineClient.ts) owns transport/invites). Rooms
hold exactly two named players with live ready states; departure frees the seat for another
player, and leaving is acknowledged by the server before the forms return so instant rejoins
cannot race the old session. Browsing the online screen opens no sockets; a connection is
attempted only on create/join. `?server=ws://…` or `VITE_MULTIPLAYER_URL` selects the server.

**Synchronization (deterministic mirror):** when both players ready up, the server starts
its authoritative engine and each browser constructs an
[OnlineMirrorEngine](apps/client/src/online/OnlineMirrorEngine.ts) with identical options.
Local input NEVER mutates the mirror: aim/move/select/fire become intents, the server
validates them (turn, phase, clamps, engine rules) and rebroadcasts each ACCEPTED command;
both mirrors replay that identical stream, so projectile trajectories, explosions and
terrain craters are byte-identical on every screen while health/damage/results remain
server-owned. Aim/move intents are frame-paced under the rate limit with bounded retries
for the mirror-ahead-of-tick edge (retries only on rejection — never double-fire). Forfeits
are server verdicts published as their own observable state. Online matches use the shared
default tank geometry (per-device model picks would desync physics) and route rematch
through the menu lobby.

**Verified:**

- [3 complete-match server tests](apps/server/tests/OnlineMatch.test.ts) with two separate
  WebSocket clients each running a browser-equivalent mirror: mirrors and server agree
  exactly across alternating shots with movement/weapon selection (positions to 1e-6,
  health exact, terrain sample-for-sample), identical trajectories after a live shot, and a
  full match to an authoritative winner both clients agree on (mirror-replayed winner
  matches the server verdict, terrain scars identical). **496 unit tests total.**
- [2 browser tests](tests/e2e/onlineMatch.spec.ts) with two isolated Chromium contexts
  through the real UI against the production server bundle: create/invite-link join/named
  ready-up, identical terrain seeds/profiles, replicated aim/move on the opposite screen,
  waiting-player input ignored, two full synchronized turns with matching terrain
  revisions, mid-match disconnect producing the server's forfeit verdict; plus lobby
  departure/seat-reuse. Full offline suite re-passes (123/124 in one run; the single
  pauseMenu timing flake under parallel load passes in isolation). Menu tests updated for
  the real lobby. Lint/typecheck clean.

**Still open:** reconnection tokens/grace periods (a drop currently forfeits), snapshot
resync on checksum mismatch, TLS/WSS deployment with a public server, and the plan's local
release gate items. The deployed-server story in the ONLINE panel reflects whatever server
the build is pointed at.

## Authoritative Node.js multiplayer server — earlier, 2026-11-10

User request: a Node.js multiplayer server using WebSockets with server-managed sessions,
rooms, turns, tanks, aiming, weapons, projectile simulation, explosions, health and results,
shared game logic separated from rendering, server-side action validation, and tested basic
client-server connections. This begins Milestones 12–13 (protocol + authoritative server);
the online CLIENT scenes (Milestone 14) are not built yet, so browsers cannot join rooms
from the game UI — the lobby/online scenes remain the next step.

**Architecture (strict layering, nothing rendering-related on the server):**

- [`packages/protocol`](packages/protocol/src/index.ts) — versioned, serializable commands,
  events, snapshots and a structural validator (`parseClientCommand`). Clients can only
  express INTENTS (`aim`, `move`, `select-weapon`, `fire`, room/lobby commands). There is
  deliberately no command shape for damage, health, terrain or match results, so a client
  cannot even phrase an authoritative-state forgery; unknown types are rejected.
- [`apps/server`](apps/server/src/index.ts) — the authoritative Node server:
  - [websocket.ts](apps/server/src/websocket.ts): dependency-free RFC 6455 transport over
    `node:http` (handshake, masking, ping/pong, close, size caps, violation drops).
  - [GameServer.ts](apps/server/src/GameServer.ts): session management, room registry with
    collision-free 4-letter codes, per-session rate limiting (30 cmds/s), JSON/size/structure
    validation before any game logic, `/health` endpoint, graceful close.
  - [ArtilleryRoom.ts](apps/server/src/ArtilleryRoom.ts): owns the SAME deterministic
    `GameEngine` from `packages/simulation` that local play uses. Validates turn ownership
    and phase for every intent, clamps aim to engine limits, lets the engine enforce
    movement allowance/slopes/separation and weapon ownership/ammo, runs the authoritative
    20Hz tick (3 fixed engine steps per tick), broadcasts snapshots + drained combat events,
    and awards forfeit wins on mid-match disconnect.
- `apps/client` remains rendering/UI only; `packages/simulation` stays Phaser/DOM-free.

**Validation:** [13 connection tests](apps/server/tests/GameServer.test.ts) exercise the real
HTTP upgrade and WS framing through Node's built-in WebSocket client: health + welcome,
malformed JSON / wrong version / unknown command rejection without crashing, not-in-room
gating, room create/join/full/not-found, identical match start for both players, active-turn
gating (waiter rejected), aim clamping of absurd values, oversized-move rejection plus real
allowance consumption, unowned-weapon rejection, forged `set-health`/`damage`/`match-result`
rejection, full authoritative shot resolution with turn handoff and stale-fire rejection, and
forfeit-on-disconnect. Total suite: **493 unit tests pass**; server+protocol lint/typecheck
clean. A live smoke against the esbuild production bundle (`pnpm --filter @artillery/server
build && node apps/server/dist/server.mjs`) created a room, played a real shot to turn
handoff and saw the forged-command rejection over actual sockets.

**Still open for online play:** the browser online client/lobby scenes (Milestone 14),
reconnection tokens/grace periods, snapshot resync on checksum mismatch, TLS/WSS deployment,
and the plan's local release gate items. The in-game ONLINE menu still truthfully reports
that no public server is deployed.

## Richer gameplay sound — earlier, 2026-11-10

User feedback: gameplay sounds were still gimmicky/beepy. The synthesis engine in
[GameAudio.ts](apps/client/src/audio/GameAudio.ts) was upgraded while staying 100% original,
procedural, autoplay-compliant and read-only against the simulation:

- **Harmonic-rich voices:** bare oscillators are replaced by cached custom PeriodicWaves
  (warm driven sine, mellow triangle, rounded square, softened saw), so tones read as struck,
  resonating objects rather than pure test-tones. Guarded fallback to plain oscillators where
  the API is missing.
- **Physical envelopes:** near-instant attack with an exponential ring-out tail (setTargetAtTime)
  instead of a linear chop, plus a downward lowpass sweep that darkens each note as it decays.
- **Natural blast noise:** noise bursts now use exponential decay with two-sample smoothing
  and a cutoff that sweeps DOWN across the burst — bright crack first, dark rumble after.
- **Explosion weight layers:** every detonation adds a shared broadband crack transient and a
  sub-bass thump (~70Hz dropping to ~35Hz), both scaled by the REAL blast radius on top of the
  per-weapon family voice.
- **Muzzle body:** every launch now carries an 88Hz barrel thump and short pressure pop under
  its family voice; bounces gained a low thud + dust layer under the springy overtone.
- **Bus glue:** a guarded DynamicsCompressor on the master bus lets stacked bursts hit hard
  without clipping.

All 480 unit tests pass (firing-voice assertions updated for the shared muzzle layers), plus
the audio/pause browser suites (10 + 14 checks). Lint/typecheck clean. Real-speaker listening
impressions remain subjective and unqualified on physical hardware.

## Pre-hosting offline/online qualification — earlier, 2026-11-10

User request: run the offline and multiplayer checks before making the game live. Online
multiplayer is intentionally NOT implemented (Milestones 12+ sit behind the local release
gate), so the online qualification verifies the build behaves truthfully without a server.

**Full validation run on the current build:**

- **480 unit tests** pass (simulation, content, draft, audio, animation, HUD state).
- **122 Chromium offline checks** pass in one run — the complete default suite (menu, draft,
  combat, HUD, pause, audio, backgrounds, terrain variety, tanks, key input, responsive,
  wide battlefield, animations). Six terrain-variety assertions were updated for the new
  full-width arena: the small-target intent is now asserted proportionally (chassis ≤3.4% of
  field width) instead of against the old smaller canvas's pixel cap.
- **34 full-depot roster checks** pass (17 Chromium + 17 WebKit).
- **30 responsive cross-engine checks** pass (Chromium + WebKit, 4 CDP-only skips as designed).
- **Production build** succeeds; built-game qualification passes in Chromium and WebKit via
  [check-tank-production.mjs](scripts/check-tank-production.mjs) (194-weapon roster, tank
  articulation, real terrain-tool shot), with the known large Phaser-chunk warning.
- **New reproducible connectivity gate** [check-online-offline.mjs](scripts/check-online-offline.mjs)
  passes in Chromium and WebKit against the production preview: every non-local network
  request is hard-blocked and the game still completes a real practice shot to turn handoff
  (fully offline local play), zero external requests and zero WebSockets are attempted
  (no phantom multiplayer traffic; blob:/data: sprite textures are browser-internal), and the
  Online Multiplayer destination truthfully reports the missing server and routes to local play.

**Hosting readiness:** local play is static-host ready (any static file server can serve
`apps/client/dist`; no backend, account or network dependency). Online multiplayer remains
unimplemented by design and is gated behind plan.md's local release gate; the remaining
pre-release items there are the dedicated results flow, replay-checksum coverage,
new-roster human balance playtesting and Firefox/real-device qualification.

## Pocket Tanks-style screen-wide battlefield and triple movement — earlier, 2026-11-10

User feedback with a Pocket Tanks screenshot: the map felt small, squeezed between HUD rows,
and tank movement was too limited.

**Layout:** the battlefield now fills the whole top of the screen like the reference. The
player-status strip (health, turn, wind, pause) floats OVER the map sky as translucent panels
— `position: absolute` inside the arena with `pointer-events: none` between panels, so
battlefield drag-aiming still works around them — and the action dock (arsenal, angle/power,
move, FIRE) sits below the map. On a 1440×900 desktop the canvas grew from 1038×584 to
1214×683 (~37% more map area); short-landscape phones keep the right control rail with the
strip spanning only the arena column. The engine's uniform 16:9 world projection and all
pointer math are unchanged — this is a CSS-grid/overlay change only
([battle-hud.css](apps/client/src/ui/battle-hud.css)). Layout tests now assert the new
contract: strip overlays the arena top; the dock still never overlaps the canvas.

**Movement:** `TURN_MOVEMENT_ALLOWANCE` raised 110 → **320** world units (~3 chassis widths,
[TankPhysics.ts](packages/simulation/src/tanks/TankPhysics.ts)) — still deliberately limited
repositioning, but enough to crest a ridge or escape a crater. Held-key/button drive rate
scaled 92 → 190 u/s so a full move takes ~1.7 s. HUD meter and tests follow the constant.

**Verified:** lint, client typecheck, 480 unit tests, 12 battleHud + 17 responsive + 4
smoke/combat Chromium checks pass with the new layout thresholds. Desktop and phone-landscape
screenshots: [layout-after.png](artifacts/ui/layout-after.png),
[layout-after-phone.png](artifacts/ui/layout-after-phone.png).

## Full depot roster, random-20 drafts, richer FX/audio — earlier, 2026-11-10

User request: add every weapon on the official depot list and make each draft offer a random
20-weapon pool per player session, while improving/optimizing missile animations and sounds.

**Roster:** normal play now carries **194 weapons** — the existing Original 30 + Deluxe 30 plus
all 13 expansion packs (134 entries: Nuke, Ambush, Flamethrower, Meteor, Chaos, Power, Super,
Gravity, Fireworks, Gold, Tornado, Nano, Acid). Names and tactical roles are referenced from
the depot list only; every implementation is an original HP-based arcade adaptation composed
from this game's bounded generic behaviors, with per-weapon adaptation notes (shields become
earthworks, teleports become bounded ballistic repositioning, tunnels remain surface-exposed).
No vendor artwork, audio, code or scoring physics is copied; this is not an official BlitWise
product. See [expansion catalog](packages/content/src/weapons/expansionCatalog.ts) and
[combined roster](packages/content/src/weapons/fullDepotCatalog.ts).

**Draft:** each match deals a **seeded random 20-weapon pool** that both players draft from
(five exclusive picks each + unlimited Single Shot). The same seed reproduces the same pool
and deal; different seeds differ. Practice mode still carries all 194.
Implementation: `createRandomPoolDraftConfig` in
[WeaponDraft.ts](packages/simulation/src/draft/WeaponDraft.ts).

**Audio:** every weapon now has an audibly distinct voice — a deterministic per-weapon
pitch/length/filter variation derived from its id on top of its family base
([WeaponVoices.ts](apps/client/src/audio/WeaponVoices.ts)), and explosion booms scale with the
ACTUAL blast radius (a Mega Nuke rumbles longer/deeper than a pellet). Still 100% synthesized,
autoplay-compliant and read-only against the simulation.

**Animation/perf:** projectile/trail lookups moved from per-frame O(n²) `find()` to an O(1)
id map in [ProjectileAnimation.ts](apps/client/src/rendering/ProjectileAnimation.ts) — the new
volley/swarm weapons make many simultaneous projectiles common. Energy strikes are now driven
by catalog beam data (every beam weapon gets the arc for free) and render as a jagged,
re-jittering electric arc instead of a straight line, reduced-motion aware, presentation-only
([CombatRenderer.ts](apps/client/src/rendering/CombatRenderer.ts)).

**Verified:** lint, client typecheck, **480 unit tests** (138 new: every expansion weapon
launches/consumes ammo/resolves bounded and deterministic; pool determinism/clamping/exclusivity;
per-weapon voice distinctness inside family character), and **17 + 17 Chromium/WebKit** browser
checks covering the 194-entry browser, seeded 20-pool drafts on desktop/phone, and practice
firing of nuke/carpet-bomb/tesla-coil/warp-gate plus the prior eight. The earlier 60-weapon
sections below are historical. Competitive balance of the expanded roster is NOT qualified —
the balance sweep still covers the legacy fixture; human playtesting remains open.

## Progress trace — 2026-11-10

A cross-chat progress review (prior chat transcripts are not stored in this repository; this
trace is reconstructed from the verified file-based checkpoints below and in [plan.md](plan.md)).
No gameplay code changed in this pass. The dev server was verified to boot and serve the game
at `http://127.0.0.1:5180/`. Status remains: local vertical slice playable with the 60-weapon
Original + Deluxe roster and 14 tanks; dedicated results flow, new-roster human balance testing,
Firefox/real-device qualification and the local release gate are still open; online multiplayer
is not started.

## Latest continuation checkpoint — 2026-11-05

Continued from the wide seeded battlefield, five scenic themes and articulated tank picker. Latest: closer reference-inspired tank silhouettes/details and the official **Original 30 + Deluxe 30** weapon scope. No later expansion pack or retired 12-weapon custom arsenal is available in normal play. The 3200 x 1800 world, fresh seeded terrain, fourteen model choices and rotating guns remain. Cross-chat transcripts are not stored in this repository; this checkpoint records the verified file-based continuation.

- **Pause/resume:** Escape, P or the PAUSE button freezes the simulation and presentation, including in-flight projectiles. Focus loss/backgrounding pauses; returning to the tab does not automatically resume.
- **Help:** H opens the same paused menu with keyboard, pointer and touch instructions expanded.
- **Safe match controls:** restart and new draft are available mid-match with confirmation. Restart resets health, ammo and terrain while preserving drafted loadouts. New draft cleans up the previous menu and listeners.
- **Visual settings:** trajectory preview and screen shake persist on the device. Reduced motion always disables shake. Missing, corrupt or denied storage does not block play.
- **Keyboard access:** the native dialog retains focus, supports Tab/Shift+Tab, native Space activation and Escape, and does not leak menu input into tank controls.
- **Gameplay-linked animation:** distance-driven wheels/treads and movement dust, eased barrel rotation, firing recoil/muzzle smoke, swept-physics projectile trails/interpolation, terrain-impact debris, damage flashes and one-shot tank destruction with a persistent wreck. See [animation accuracy](#gameplay-linked-animations).
- **Wide battlefield:** 3200 × 1800 physical world with 2688-unit spawn separation, smaller on-screen targets, varied seeded terrain, retuned reach and a 0.55-second launch-direction guide. The canvas retains its 1280 × 720 uniform projection with native HUD outside it. See [current field and terrain](#wider-field-and-fresh-terrain--latest-2026-11-05).
- **Audio:** original procedural music and sound effects synthesized in the browser — movement, aiming, selection, per-weapon firing/explosion voices, flight whistles, fuse ticks, bounces, terrain rumbles, damage, destruction and victory/defeat cues — with persistent master/music/effects volume and mute controls, autoplay-policy compliance and strict read-only observation of gameplay. See [audio](#audio).
- **Main menu:** Play Local opens real draft/random/practice setup; Weapon Selection browses all 60 approved definitions, shows their pack/adaptation notes and links into the draft. Controls, Settings and Credits remain functional; online is truthfully unavailable pending a server. See [main menu](#main-menu-and-local-setup).
- **Complete HUD:** both players' health bars and selected weapons, explicit ACTIVE/WAITING/WINNER labels, turn number, match phase, wind, live angle/power, movement allowance and ammunition. The scrollable owned-weapon panel and bounded weapon-details disclosure sit outside the battlefield, with native sliders, hold/step buttons and FIRE/REMATCH. Nothing reads test datasets or stores a second match model. See [in-game HUD](#complete-in-game-hud).
- **Responsive/touch:** desktop and tablet docks, stacked portrait controls and a right-hand rail on short landscape screens. Primary controls are 48 CSS pixels or larger; angle/power have full-width tracks on narrow phones. Tap/hold movement, barrel aiming, power, swipeable owned weapons and firing all command the existing engine. Per-finger capture prevents stuck holds and one finger cancelling another. Portrait remains playable, with a non-blocking landscape hint. The native mobile draft shares the same exclusive selection rules. See [responsive browser play](#responsive-desktop-tablet-and-mobile-play).
- **Validation:** lint/typecheck/build and **341 unit tests** pass. **24 normal-roster browser tests** pass (12 Chromium + 12 WebKit), plus **122 legacy-fixture Chromium regressions** in completed 59+63 batches. Production checks confirm the built 60-weapon roster, refined tank art/gun alignment and actual terrain-tool firing in Chromium/WebKit. New-roster competitive balance, Firefox and physical-device qualification remain open. The existing large Phaser-bundle warning remains.

Next local work is the dedicated results flow, extended configurable match settings, replay/checksum coverage and audio/accessibility/performance qualification. Keep online implementation behind the existing local release gate. See the [development checkpoint](plan.md#current-implementation-checkpoint--2026-11-05).

## Refined tank art and Original + Deluxe arsenal — latest, 2026-11-05

User request: tanks should resemble the supplied real-tank sheet more closely but retain the
game's style; weapons must come only from [the official depot's Original and Deluxe packs](https://classic.blitwise.com/ptanksdepot.html).

**Tank refinement:** newly authored curved cast turrets for T-34/IS-2, boxy Tiger armor and
overlapping Tiger/Panther wheels, stronger sloped Panther profiles, AMX turret separation,
modern wedge armor/bustles, skirt panels, hatches, optics, rivets, subtle camouflage and edge
highlights. The small Renault, long Churchill/Mark V and low Strv remain distinct at a common
portrait scale. Existing team markings, palettes, transparent cached hull textures, separate
rotating guns and tested physics interfaces remain. These are arcade interpretations, not
photo composites or historically/engineering-scale replicas.

- [Refined tank roster](artifacts/ui/tanks/refined-roster.png)
- [Built game with refined tanks and 60-weapon arsenal](artifacts/ui/tanks/refined-original-deluxe-production-chromium.png)
- [New art detail source](apps/client/src/rendering/TankDetailArtwork.ts)

**Weapon scope:** the official page was read directly: **30 Original + 30 Deluxe = 60**.
This does **not** mean every expansion requiring Deluxe: no Nuke, Ambush, Meteor, Super, etc.
The old twelve custom weapons are removed from normal gameplay, weapon browsing and drafts.
Names/roles are referenced with original sprites/audio/code and paraphrased descriptions;
no vendor image/audio/executable assets were copied. This is not an official BlitWise product.

**Play:** practice provides all 60. Draft/quick-random provide five exclusive choices each from
59 draftable entries, plus unlimited **Single Shot** for both. The full-pool draft uses a
scrollable native interface on desktop and phone, not 59 cards drawn on top of each other.
Z/X cycle weapons; the scrollable dock exposes the complete inventory, with number keys for
the first twelve slots. Details show ORIGINAL/DELUXE membership, role and adaptation limits.

**Actual behaviors:** dirt mounds/walls/V banks add collision terrain; excavation tools remove
it; seeded guidance, proximity energy strikes, vertical hops, bounded split bursts, staggered
automatic volleys, surface cruisers/rollers, rubber/glue and Jump Jets are real simulation
effects. The renderer shows matching new dirt/coatings and energy beams. Shots remain bounded
by the shared 32-warhead budget, 25-second timeout and per-shot HP caps, not original scoring.

**Important limits:** this is not a pixel-identical Pocket Tanks simulation. Tunnels expose
surface trenches rather than enclosed cavities; terrain-building puts tanks on the new top
rather than simulating burial. Napalm/web/hail/color effects use bounded fragments, not
persistent fluids or hundreds of particles. Laser Battery uses bounded energy pulses, Pin
Cushion uses energy-splash fragments, and tracers show range error/suggested elevation direction,
not an exact angle solver. Flash Blast damages without excavation, but unchanged-ground scorch
coloring is not implemented. [Full 60-name roster, source and behavior differences](docs/original-deluxe-weapons.md).

**Verification:** all 341 unit tests pass, including 84 pack tests covering each weapon's actual
launch/ammo/bounded resolution/deterministic replay/caps and special-effect assertions. The
24 new browser checks pass in Chromium/WebKit using the **normal 60-item roster**. Prior
122 Chromium regressions also pass using an isolated **development-only legacy fixture**;
they are not 60-weapon balancing evidence. Production ignores that fixture flag and has no
menu/URL choice for the retired weapons. The built-game checker verifies 60 entries, no Nuke
or Standard Shell, tank/gun alignment and a real terrain-tool shot in both browser engines.
The new 60-weapon roster still needs broader human balance/playtesting; earlier twelve-weapon
balance assertions below apply only to regression fixtures. Lint/typecheck/build pass, with the
pre-existing large Phaser-bundle warning. Firefox/real hardware qualification remains open.

```sh
pnpm exec playwright test --config playwright.original-deluxe.config.ts --workers=2
pnpm build
node scripts/check-tank-production.mjs
```

Earlier checkpoints below retain their historical roster/counts. This section supersedes
their twelve-weapon descriptions and fixed catalog-size assumptions.

## Tank selection and articulated guns — earlier pass, 2026-11-05

The user provided a 12-tank reference sheet and requested tank choices plus a moving/rotating
gun barrel. The sheet was inspected directly. These are **original reference-inspired arcade
vectors**, not extracted photographs or claimed engineering/historical scale replicas.
Photography/backgrounds and static baked-in guns from the sheet are not shipped in the game.

**Choose:** Main menu -> **Play Local** or **Settings** -> **Choose your tanks**. Use the
Player 1 / Player 2 tabs and native radio cards. Both players can choose the same model; gold
and blue markings, labels and emblems still distinguish them. Choices persist independently
of audio/background settings, with a session fallback when storage is denied. Picks apply at
match start and are retained across the real weapon draft, restart and rematch. They cannot
swap a live collision body underneath an in-flight shot.

**Available:** Marigold, Cobalt, **Tiger I, Panther, T-34/85, IS-2, AMX-13, Strv 103, Churchill,
Abrams, Merkava Mk.4, Leopard 2A7, Renault FT-17 and Mark V**. The small/tall Renault, long
Churchill/rhomboid Mark V and low wedge Strv have different proportions; every portrait uses
the same viewport scale rather than stretching all tanks to the same box.

**Rotating nozzle/barrel:** the 12 new hull images contain **no gun barrel**. A separate cached
gun image rotates at the model's actual configured trunnion. W/S, the native ANGLE slider,
hold/step buttons and battlefield dragging change elevation. The preview slider demonstrates
gun-only rotation without moving the hull or starting combat. Standard elevation limits remain
**5-85 degrees**, with Rail Punch capped at 30; this is not unrestricted 360-degree traverse.
Gun aim eases and synchronizes on firing; recoil retracts the barrel, while the muzzle flash
and projectile originate from the authoritative no-recoil launch tip. Pause freezes both.
Pointer aim now compensates hull slope for either facing. The original two graphic barrels
remain separately drawn and animated rather than baked into their chassis.

Model definitions drive hull footprint, track sampling, collision capsule, pivot and barrel
length in the shared simulation and renderer. Thus a short barrel doesn't silently fire from
the old 72-unit muzzle. Movement/settling retains model identity; wider tanks respect their
own world-edge and opponent clearances. **Health, movement allowance, weapon inventory,
weapon damage and blast rules are shared**, but footprint/muzzle differences are real and can
affect hits. Cross-model competitive fairness still needs human testing. Strv 103 and Mark V
have explicitly labeled **arcade articulation**, not simulated historical fixed/sponson gun
mechanisms. No real tank manufacturing dimensions are implied by these game-unit values.

**Optimization:** native vectors are encoded locally and rasterized to transparent cached
textures at loading time. Only the chosen model IDs are preloaded; hull artwork is never
reconstructed in the battle loop. Gun animation changes a separate sprite transform, not
an entire tank image. No web photo downloads or image-service requests occur during play.
The production build is valid and retains the previously documented Phaser bundle warning.

**Verified:** all 257 unit tests (including 17 model-geometry/launch/movement tests and nine
preference tests), lint/typecheck/build, and all 122 Chromium checks in two completed runs.
Sixteen new browser checks cover every reference tank, sprite-world-matrix muzzle parity for
both facings, visible independent gun aiming, sloped movement/recoil, player-two turn aiming,
desktop/phone selection, identical-model games, storage failure, draft and retry propagation.
The native range-input focus correctly prevents Space from accidentally firing; FIRE or the
focused battlefield starts the shot. Built-game checks pass in Chromium and WebKit for native
selection, gun rotation, muzzle parity, paused recoil and player-two control. Hardware/Firefox
qualification, unrestricted traverse and cross-model balance are not claimed.

Previews and implementation:
- [Full tank-selection roster](artifacts/ui/tanks/selection-roster.png)
- [Panther/T-34 at 15-degree elevation](artifacts/ui/tanks/panther-t34-15-production-chromium.png)
- [Same game at 75-degree elevation](artifacts/ui/tanks/panther-t34-75-production-chromium.png)
- [Phone landscape](artifacts/ui/tanks/panther-t34-75-production-webkit.png)
- [Model definitions](packages/content/src/tanks/tankCatalog.ts)
- [Split hull/gun artwork](apps/client/src/rendering/TankSprites.ts)
- [Tank-art intent](art/tanks/README.md)
- [Reproducible production check](scripts/check-tank-production.mjs)

## Wider field and fresh terrain — previous pass, 2026-11-05

The user supplied three Pocket Tanks screenshots to explain **more space relative to the
tanks** and **different terrain every game**, rather than the same center hump. The images
were inspected directly as spacing/terrain references, not reused as artwork.

- World: **3200 x 1800** (previously 2240 x 1260), projected uniformly into 1280 x 720.
- Spawn centers: **256 and 2944**, gap **2688 units** (previously 1780): **51% more real separation**. Centers span 84% of the field width; the gap is over 25 chassis widths.
- Tank chassis: still 106 physical units wide, now **42.4 logical screen units** (previously about 60.6). Hitboxes, muzzle, trails and terrain all share the same 0.4 transform; this is not just smaller decorative sprites. Controls/labels remain readable.
- Terrain generator version **2**: six families, **rolling hills, valleys, terraces, escarpments, twin ridges and broken highlands**. Seeded random control heights, phase, drift and irregular detail change each family's shape. A central hump is no longer mandatory.
- Natural slopes are bounded below the 28-degree movement limit; both spawn pads are exactly level. One sample per world unit is preserved for swept collision and destructible craters. Weapon-created crater walls can still affect movement.

**New game:** fresh terrain seed chosen at the client match boundary using browser crypto.
The same draft seed repeats weapon deals but **does not repeat the map**. New local practice,
quick match and draft-to-battle starts use fresh terrain. A completed-game REMATCH, Space or R
also creates a fresh map while retaining loadouts. **Pause -> Restart match** instead resets
health/ammo/craters on the **same original map**, so it remains a useful retry. Changing
background, pausing, rotating and resizing never regenerate terrain.

For an exact reproducible map, use `?draft=off&terrainSeed=1234`. This explicit override keeps
the specified map even across rematches. Seed and generation version are stored with the
engine's map context. The shared generator never uses `Math.random()` or browser APIs.
An immutable source-map cache holds at most 32 seeds; every engine copies those samples before
modification, so one match's craters cannot leak into another. Rendering still updates terrain
only on revision/material changes; no terrain generation occurs in the animation loop.

**Reach:** weapon launch speeds grow by `sqrt(2688 / 1780)` (~1.229x) so a healthy opposing
tank remains reachable. Gravity, damage caps, blast/crater sizes, ammunition and tank geometry
are unchanged. Skill/reach tests use the real generated collision terrain, not scenery.
The balance sweep now covers the full legal power/angle envelope and the wider seeded cover
scenarios; all existing balance constraints pass. Human difficulty/fairness playtesting remains
necessary, especially with unequal terrain elevations.

**Verified:** lint, strict typecheck, production build and **231 unit tests** pass. These include
120 seeds for finite/bounded heightfields, exact spawn contact, unique maps and drivable slopes;
both players land real cross-map shots over 24 seeded layouts. The 106 Chromium browser checks
have passed across runs: the final whole-suite attempt reached 101 successes before the shell's
360-second limit, then its five remaining checks passed separately. The former one-pixel
pointer-rounding assertion was corrected and verified over three repeat runs. No complete
106-test single-run success is claimed. Added checks cover six visible layouts, fresh local
maps despite identical draft seeds, exact retries and fresh completed-game rematches. Production
smoke checks pass in Chromium/WebKit for pencil, lunar and original-color maps, real crater
formation and exact retry. Firefox/physical-device qualification and the bundle warning remain.

Current previews:
- [Pencil rolling terrain](artifacts/ui/terrain-variety/pencil-study-0-production-chromium.png)
- [Lunar valley](artifacts/ui/terrain-variety/lunar-earthrise-1-production-chromium.png)
- [Original-color twin ridges on phone](artifacts/ui/terrain-variety/golden-valley-4-production-webkit.png)
- [Terrain generator](packages/simulation/src/terrain/TerrainProfile.ts)
- [Browser terrain coverage](tests/e2e/terrainVariety.spec.ts)

Earlier continuation sections below record their dimensions/test counts at the time; this
section supersedes the previous fixed-hump map and 2240-wide field.

## Pencil Study and Lunar Earthrise — earlier addition, 2026-11-05

The user found the first three backgrounds below the intended quality, asked to **leave them
in place**, and requested a pencil-drawn landscape like the earlier reference plus a lunar
surface with Earth in space. The earlier reference image remains unavailable here. Another
image-generation attempt also failed on model availability, so this is a description-led,
code-authored interpretation, **not a claimed exact reproduction of the missing reference**.

- **[Pencil Study](apps/client/src/assets/backgrounds/pencil-study.webp)**: warm paper, subtle grain, broken graphite contours, cross-hatched mountain faces and sketched foothills; **265,468 bytes**.
- **[Lunar Earthrise](apps/client/src/assets/backgrounds/lunar-earthrise.webp)**: black space, sparse stars, rough cratered lunar highlands and a recognizable blue/white Earth; **53,886 bytes**. Earth uses the NASA Apollo 17 photograph, credited in-game and in [source provenance](art/backgrounds/source/credits.md). This is an artistic composite, not an actual lunar-site photograph or astronomical scale model.

Both are **1920 x 1080 RGB WebP**, quality 82, **319,354 bytes / 311.9 KiB combined**.
All five plates together are 415,918 bytes / 406.2 KiB. Original lossless PNG masters stay out
of the deployable bundle; only fingerprinted WebPs ship. Build these two with
[the special-background builder](scripts/build-special-backgrounds.py) using Python, NumPy
and Pillow. It is deterministic and does not regenerate the earlier three SVG/WebP themes.

Use **Play Local**, **Settings**, or **Pause -> Visual settings -> Battlefield background**.
Preview links: `?draft=off&background=pencil-study` and
`?draft=off&background=lunar-earthrise`. Native selection and local persistence are shared
with the original themes. The three older choices and their original grass/soil rendering
remain available and unchanged.

**Matching live terrain:** Pencil Study uses light graphite hatching rather than grass and
colored soil; Lunar Earthrise uses gray regolith, pocks and pale crater rims, with no plants.
This material is clipped to the real heightfield and redrawn only on terrain revision or
material change, not every frame. Switching a paused shot redraws appearance immediately but
preserves original surface samples and existing craters. Gravity, wind, collisions, weapons,
health/ammo, tank spawn separation and gameplay outcomes are unchanged. Tanks retain their
gold/blue team identity. These are presentation themes, not new physical maps or lunar gravity.

**Verification:** lint, strict typecheck, all **224 unit tests**, production build and all
**98 Chromium browser tests** pass. Sixteen background browser tests cover all five themes
at desktop and phone-landscape sizes, asset pixels, selection/persistence/fallback, paused-shot
parity and theme changes after real crater formation. Five terrain unit tests cover material
caching, clipping and read-only crater preservation. Production checks additionally pass
both new themes in Chromium and WebKit, including local fingerprinted assets and matching
terrain during paused-shot switching. Physical-device/Firefox qualification remains open;
the existing large Phaser bundle warning remains.

In-game previews:
- [Pencil Study desktop](artifacts/ui/backgrounds/pencil-study-production-chromium.png)
- [Lunar Earthrise desktop](artifacts/ui/backgrounds/lunar-earthrise-production-chromium.png)
- [Pencil Study phone landscape](artifacts/ui/backgrounds/pencil-study-production-webkit.png)
- [Lunar Earthrise phone landscape](artifacts/ui/backgrounds/lunar-earthrise-production-webkit.png)

## Three optimized backgrounds — original pass, 2026-11-05

Image generation was attempted twice but blocked by unavailable prompt models. No original
reference-image attachments from other chats were found. These are **new code-authored
illustrations based on the saved Golden Valley visual language**, not edits of unseen images
or AI-generated outputs. No game screenshots were used as scenery textures.

- [Golden Valley WebP](apps/client/src/assets/backgrounds/golden-valley.webp): lavender snowcap peaks, green pine foothills, sunset; **35,968 bytes**.
- [Desert Canyon WebP](apps/client/src/assets/backgrounds/desert-canyon.webp): terracotta mesas and dusty distant dunes; **29,382 bytes**.
- [Moonlit Alpine WebP](apps/client/src/assets/backgrounds/moonlit-alpine.webp): blue snowy peaks, moon and a quiet aurora; **31,214 bytes**.

All three are **1920 x 1080 (16:9), opaque RGB, WebP quality 88**, totaling **96,564 bytes
(94.3 KiB)**. Editable SVG masters and provenance are in [art/backgrounds](art/backgrounds/README.md).
Rebuild them with [the background builder](scripts/build-backgrounds.py), which uses the
project's Playwright Chromium and Pillow; no extra rasterizer package is required.

**Select:** Play Local or Settings -> **Battlefield background**. Local setup shows a preview.
Pause -> Visual settings offers the same 48px native selector, including during a live shot.
Selection persists separately from audio preferences, with a session-only fallback when storage
is denied. Explicit preview links: `?draft=off&background=golden-valley`,
`?draft=off&background=desert-canyon`, `?draft=off&background=moonlit-alpine`.

These are **cosmetic backgrounds, not three collision maps**. Terrain shape, original grass/soil
palette, 2240 x 1260 physical world, 1780-unit spawn separation, weapons, wind, health, ammo,
craters and projectile physics stay unchanged. Quiet upper skies keep shot paths readable.
Each plate is a single cached image behind the live terrain/tanks. Vite fingerprints local
assets; scenes reuse loaded textures without regenerating artwork per frame. Missing images
gracefully use the original procedural Golden Valley renderer.

**Verified this pass:** lint, strict typechecking, all **219 unit tests**, production build and
all **92 Chromium browser tests** pass. Ten new browser tests cover real image decode/dimensions,
canvas pixels, all backgrounds at desktop/phone landscape sizes, selection/preview/persistence,
denied storage, missing images, and exact match-state parity while changing a paused live shot.
Additional production-build smoke checks pass for all three themes in Chromium and WebKit,
including fingerprinted-asset loading and paused-shot parity. These are not physical-device or
Firefox qualification. The existing Phaser bundle-size warning and unfinished local release
gate remain. [Browser coverage](tests/e2e/backgrounds.spec.ts).

Production screenshots:
- [Golden Valley in game](artifacts/ui/backgrounds/golden-valley-production-chromium.png)
- [Desert Canyon in game](artifacts/ui/backgrounds/desert-canyon-production-chromium.png)
- [Moonlit Alpine in game](artifacts/ui/backgrounds/moonlit-alpine-production-chromium.png)

## Requirements

- Node.js 22 or newer
- pnpm 10.20.0 (declared through the `packageManager` field)

Node.js 22 includes Corepack. Enable it once if `pnpm` is not already available:

```sh
corepack enable
corepack prepare pnpm@10.20.0 --activate
```

## Install

From this directory:

```sh
pnpm install
```

The checked-in lockfile makes installs reproducible. CI uses `pnpm install --frozen-lockfile`.

## Run locally

Start the Vite development server:

```sh
pnpm dev
```

Then open <http://127.0.0.1:5173>. Vite provides hot module replacement while source files are edited.

The game opens on the **main menu**. Explicit deep links remain available for practice and reproducible testing:

- `?draft=on&seed=1234` opens the draft directly with reproducible random picks.
- `?draft=off` opens the battlefield directly with the full arsenal for both players (practice mode).
- `?seed=1234` on the normal menu prefills the local setup's draft seed, without bypassing the menu.

## Main menu and local setup

- **Play local** opens an actual setup form: draft five exclusive weapons each, deal a seeded exclusive quick match, or start full-arsenal practice. The seed controls random weapon deals, not terrain generation. Draft mode forwards the chosen seed into the existing draft; quick matches enter the existing simulation with validated exclusive loadouts.
- **Online multiplayer** opens a status panel explaining that rooms, matchmaking and the authoritative server are not implemented. Its local-play button works. No network connection or room creation is simulated; online remains behind the local release gate.
- **Weapon selection** is an interactive catalog of the real content definitions, with descriptions, ammunition, damage cap, blast and crater values. Its draft action starts the real exclusive weapon selection screen, rather than modifying loadouts in a decorative preview.
- **Controls**, **Settings** and **Credits** show complete panels. Settings share saved audio/visual preferences with the in-game pause menu; volume sliders have stable accessible labels and percentage readouts. A quick mute button is available on the home screen. Original menu music starts only after a user gesture.
- Native buttons and dialogs support mouse, touch, Tab/Shift+Tab focus containment, Arrow Up/Down/Home/End navigation, Enter/Space activation and Escape to close. The menu scrolls on small/short viewports and honors safe areas and reduced motion. Touch browser tests cover 320 × 740, 390 × 844 and 844 × 390 layouts.
- The draft has a **Main menu** button and Escape shortcut; the in-game pause menu has a confirmed **Main menu** action. Returning home destroys the old scene's DOM/audio and avoids duplicated input listeners. No combat engine runs behind the main menu.

Implementation: [menu scene](apps/client/src/scenes/MenuScene.ts), [native front end](apps/client/src/ui/MainMenu.ts), [menu styles](apps/client/src/ui/main-menu.css), [browser regression tests](tests/e2e/mainMenu.spec.ts).

To expose the development server to another device on the same network:

```sh
pnpm dev -- --host 0.0.0.0
```

## Production build and preview

Create an optimized client build:

```sh
pnpm build
```

The generated client is written to `apps/client/dist/` and is intentionally ignored by version control.

Preview that production build locally:

```sh
pnpm preview
```

Then open <http://127.0.0.1:4173>.

## Validation commands

```sh
pnpm lint          # ESLint across the workspace
pnpm typecheck     # strict TypeScript checks for every package
pnpm test          # Vitest unit tests
pnpm build         # typecheck and bundle the Phaser client
pnpm check         # lint, typecheck, unit tests, and build
pnpm format:check  # verify Prettier formatting
pnpm format        # apply Prettier formatting
```

### Browser smoke test

Install the Playwright Chromium runtime once:

```sh
pnpm exec playwright install chromium
```

Then run:

```sh
pnpm test:e2e
```

The browser suite starts Vite and covers the following:

- Weapon draft: turn order, refusal of a weapon the opponent owns, hand-chosen and fully random drafts, seed reproducibility, random pick, randomize rest, undo, and carrying the loadouts into the battle.
- Battle: responsive canvas behavior, aiming, weapon selection by keyboard and by clicking arsenal slots, ammunition consumption, locked selection during flight, depleted-weapon rejection, and flat-fire elevation limits.
- Projectiles: cluster and sticky-fuse shots, terrain deformation, turn handoff, and release of every projectile trail.
- Key input: a regression test that several key presses within one frame each trigger exactly one action.
- Pause menu: frozen live-shot state, input isolation, keyboard focus and activation, confirmed restart/new draft, repeated scene cleanup, visual preference persistence, reduced motion, denied storage, focus loss and small-screen touch controls.
- Animation: accepted movement and stopped tracks, barrel convergence, physics-locked projectile rendering, frozen recoil/effects during pause, a real full-match destruction/rematch sequence, and reduced-motion feedback.
- Audio: locked-until-gesture autoplay compliance, firing/explosion cues from real shots with unchanged outcomes, persistent mute/volume controls that silence playback, and a missing Web Audio API never blocking a match.

## Weapon draft

Before each match the players draft their weapons:

- **Single Shot is standard issue.** Both players always carry it, with unlimited ammo. It is never drafted. The retired Standard Shell belongs only to regression fixtures.
- **The other 59 approved weapons form the draft pool.** Each player drafts **5** exclusively. The 49 unclaimed entries stay out of that match; practice exposes all 60.
- **Snake order: P2, P1, P1, P2, P2, P1, P1, P2, P2, P1.** Player 2 picks first because Player 1 fires the first shot of the match.
- **Random assignment** is available at every stage:
  - **Random pick** (`R`) gives the current picker a random unclaimed weapon.
  - **Randomize rest** (`T`) fills every remaining pick at random, keeping the picks already made.
  - **Deal all random** (`A`) discards the current picks and deals both loadouts entirely at random.
  - Random picks are marked ⚄ / RANDOM on the draft board.
- **Undo** (`U` / `Backspace`) and **Reset** take picks back. **Start battle** (`Enter`) unlocks once all 10 picks are made.
- In battle, each player's arsenal dock shows only their own six weapons. Number keys `1`–`6` select their own slots, and weapons the opponent drafted cannot be selected or fired.
- After a match, **Space/`R`** gives a rematch with the same loadouts and **`N`** starts a new draft.

| Draft action        | Keyboard           | Mouse / touch         |
| ------------------- | ------------------ | --------------------- |
| Draft a weapon      | `1`–`9`, `0`, `-`  | Click or tap its card |
| Random pick         | `R`                | RANDOM PICK           |
| Randomize remaining | `T`                | RANDOMIZE REST        |
| Deal both at random | `A`                | DEAL ALL RANDOM       |
| Undo last pick      | `U` or `Backspace` | UNDO                  |
| Clear all picks     | —                  | RESET                 |
| Start the battle    | `Enter`            | START BATTLE          |

The draft rules live in `packages/simulation/src/draft/`, independent of Phaser:

- `WeaponDraft` enforces turn order and exclusive ownership.
- `validateLoadouts` rejects any pair of loadouts that share a drafted weapon or lack an unlimited weapon, and `GameEngine` checks it again when a match is created.
- Randomness comes from a seeded `SeededRandom`, so the same seed always deals the same loadouts. That will let the future authoritative server reproduce a draft.

## Local controls

| Action                  | Keyboard                    | Mouse / touch                               |
| ----------------------- | --------------------------- | ------------------------------------------- |
| Move active tank        | `A` / `D`                   | Hold the MOVE buttons                       |
| Adjust angle            | `W` / `S`                   | Drag in the battlefield, use the angle slider or hold ANGLE − / + |
| Adjust power            | `Q` / `E`                   | Drag farther/closer, use the power slider or hold POWER − / + |
| Select weapon slot      | `1`–`9`, `0`, `-`, `=`      | Tap a slot in the ARSENAL dock              |
| Previous / next weapon  | `Z` / `X` or `Tab` for next | —                                           |
| Fire                    | `Space`                     | FIRE                                        |
| Rematch after game over | `Space` or `R`              | FIRE changes to rematch                     |
| New draft after a match | `N`                         | —                                           |
| Pause / resume          | `Escape` / `P`              | PAUSE / Resume game                         |
| Open paused help        | `H`                         | PAUSE → How to play                         |

The pause menu also provides confirmed **Main menu**, **Restart match** and **New weapon draft** actions during a match. Escape cancels a pending destructive confirmation before it resumes gameplay. Visual preferences are saved locally; they never change combat rules. Menu text and controls remain scrollable on small screens.

Movement is limited per turn. Tanks sample the terrain under both track endpoints, align to the local slope, remain within world bounds, and cannot move through or overlap the opposing tank. Selection, aiming, movement, and firing are all locked while a shot is resolving.

## Complete in-game HUD

- **Top status row:** P1/P2 tank identity, real HP/progress bars, selected weapon, active/waiting labels and a high-contrast active outline. Turn number, phase, live wind direction/magnitude and engine message are always updated from the match. Completion names the actual winner or draw; pause is scene state overlaid on the unchanged simulation phase.
- **Owned arsenal:** native horizontally scrollable weapon buttons, numbered shortcuts, remaining rounds (∞ for Standard Shell), selected state and explicit EMPTY labels. Ownership, depleted rejection and input legality are enforced by the engine. On handoff the entire panel switches to the next player's untouched inventory.
- **Weapon information:** selected name, role and ammo remain visible. Expand the information disclosure for live catalog description, behaviour tags, damage cap, blast/crater sizes, wind sensitivity, volley count and ideal reach. Reach is explicitly an estimate, not a landing prediction. On small/short screens information scrolls within a bounded area so FIRE and movement remain visible.
- **Aiming/movement:** angle and power sliders plus hold/step buttons show actual engine values. Angle bounds come from the shared simulation limits and the selected weapon (Rail Punch caps at 30°); power is 20–100%. Movement shows remaining world units against the engine's 110-unit turn allowance and disables at exhaustion. Current launch speed follows selected-weapon speed × actual power.
- **Status/locks:** all gameplay controls disable during flight, settling and pause, while phase text explains why. Game over exposes REMATCH and NEW DRAFT. Rematch resets HP, terrain and ammo with existing loadouts. Pause/new-draft/home/restart clean up DOM/listeners without duplicate HUDs.
- **Unobstructed battlefield:** a CSS grid reserves header/dock regions around the unchanged 1280 × 720 Phaser canvas (a right-hand dock on short landscape screens). Weapon cards, controls and pause are not sky/ground overlays; every point in the battlefield is available for pointer aiming. The world-to-canvas transform, terrain, targets and physics are unchanged. Small phones necessarily show a smaller arena; landscape remains recommended.
- **Access:** native buttons, sliders, meters and focus rings; keyboard Tab navigation and slider arrow keys; polite match-status announcements, with continuous aim outputs silenced to avoid announcement spam. Focused native Space/Enter activates one control, never an extra tank shot. Unfocused/canvas gameplay hotkeys remain unchanged.

Implementation: [HUD](apps/client/src/ui/BattleHud.ts), [arsenal](apps/client/src/ui/ArsenalPanel.ts), [layout styles](apps/client/src/ui/battle-hud.css), [browser coverage](tests/e2e/battleHud.spec.ts).

## Responsive desktop, tablet and mobile play

- **Desktop and larger tablets:** both health panels and match status stay above the arena, with arsenal and aim/fire in a two-column bottom dock. The full world remains visible at its original aspect ratio; HUD targets are CSS-sized, never shrunk with the canvas.
- **Portrait phones/small tablets:** the dock stacks weapons over controls; on narrow phones angle and power each get a full row so their sliders are not squeezed between two large buttons. Movement and FIRE are pinned below the scrollable weapon region. On the smallest phone the arena is necessarily smaller; rotate for the clearest battlefield.
- **Short landscape screens (up to 600 px high):** a right-hand control rail leaves substantially more height/width for the battlefield than the old stacked layout. The rail's weapon region scrolls independently; aim, power, movement and firing stay reachable. Rotating or resizing preserves health, ammo, angle/power, turn and terrain. No unsupported fullscreen/orientation-lock requirement is imposed.
- **Touch:** primary movement/aim/power buttons are 48 × 48 CSS px; FIRE is at least 48 px high; weapon slots are at least 56 px high. Range inputs have 48 px hit rows and 28 px visible thumbs. Native information disclosures are at least 44 px high. Tap makes one immediate step; holding repeats through the existing scene input path. Pointer capture, cancellation, leaving the control, pause, blur, orientation change and scene shutdown release holds. Separate fingers can move and aim simultaneously; releasing one only releases its own control.
- **Weapons and scrolling:** swipe horizontally to browse, tap to select, scroll vertically for details. Horizontal edge gestures stay in the strip while vertical gestures reach the enclosing arsenal (and stop there, not at the page). Keyboard/turn changes reveal the selected weapon without scrolling the page. Large native draft cards/actions replace tiny canvas hit targets at widths up to 1000 px or heights up to 600 px; the original desktop draft remains available on larger screens.
- **Browser viewport safety:** fixed app viewport, dynamic viewport height, safe-area insets, overscroll containment and no text/callout selection on gameplay controls. Canvas and hold/slider targets prevent unintended touch panning; menus and weapon information deliberately retain native scrolling. Viewport pinch zoom is not disabled. Visual-viewport/arena ResizeObserver updates remeasure Phaser's parent before refreshing its fit, preventing an opened HUD panel from stretching the canvas or skewing pointer aim.

The viewport matrix is **1920 × 1080, 1280 × 720, 1024 × 768, 768 × 1024, 390 × 844, 320 × 568, 844 × 390, 667 × 375 and 568 × 320**. Browser emulation is not a substitute for testing actual iOS/Android devices, notches, browser chrome, thermals or low-end performance.

Responsive gate (in addition to the complete default Chromium suite):

```sh
pnpm exec playwright install chromium webkit firefox
pnpm exec playwright test --config playwright.responsive.config.ts --project=chromium --project=webkit --workers=2
# Firefox is configured too, but this host currently fails before page launch:
pnpm exec playwright test --config playwright.responsive.config.ts --project=firefox --workers=2
```

Implementation: [per-pointer holds](apps/client/src/input/PointerHolds.ts), [native small-screen draft](apps/client/src/ui/ResponsiveDraft.ts), [responsive regression tests](tests/e2e/responsive.spec.ts), [cross-engine config](playwright.responsive.config.ts).

## Arsenal

The current normal arsenal is [Original 30 + Deluxe 30](docs/original-deluxe-weapons.md).
The twelve-entry table and balance descriptions below document the retired regression fixture,
not additional packs or selectable weapons in a normal game.

Each player has their own inventory, made up of the shared Standard Shell plus their five drafted weapons; in `?draft=off` practice mode it is the whole arsenal.

- Standard Shell is unlimited. Every other weapon has limited rounds, and one shot consumes exactly one round however many warheads it launches.
- Depleted weapons are greyed out and cannot be selected. A spent selection falls back to the first fireable weapon on the player's next turn.
- The arsenal dock shows weapon names, ammo and selected/depleted states. Its detail disclosure shows role, description, behaviour tags and numeric stats (damage cap, blast, crater, reach, wind), all derived directly from the same catalog used by combat. Procedural icons remain in draft/menu presentation.

| #   | Weapon         | Role                  | Ammo | Behaviour                                                       |
| --- | -------------- | --------------------- | ---- | --------------------------------------------------------------- |
| 1   | Standard Shell | Reliable all-rounder  | ∞    | Single impact shell                                             |
| 2   | Heavy Shell    | Close-range bruiser   | 3    | Highest damage, short reach                                     |
| 3   | Cluster Bloom  | Area saturation       | 2    | Bursts on impact into five bomblets                             |
| 4   | Trident Shot   | Forgiving spread      | 3    | Three shells in a fan from one shot                             |
| 5   | Ricochet Orb   | Bunker buster         | 3    | Two energy-losing bounces before detonating                     |
| 6   | Skyburst       | Forgiving airburst    | 2    | Proximity fuse 55 units above ground, enormous radius           |
| 7   | Burrower       | Undermining digger    | 3    | Drills 46 units into terrain, then erupts                       |
| 8   | Landbreaker    | Terrain demolition    | 2    | Massive crater; drops tanks for fall damage                     |
| 9   | Needle Dart    | Wind-proof poke       | 5    | Fast, flat, nearly unaffected by wind                           |
| 10  | Time Capsule   | Sticky delayed charge | 3    | Sticks to terrain or a tank, detonates after 1.4 s              |
| 11  | Forking Star   | Apex splitter         | 3    | Splits into three warheads at the top of its arc                |
| 12  | Rail Punch     | Direct-hit sniper     | 2    | Flat fire only (≤30°); most of its damage is a direct-hit bonus |

### Balance

Every weapon has a per-shot damage cap well under 100 HP, so nothing can destroy a healthy tank in one shot. `packages/simulation/src/balance/weaponBalance.test.ts` sweeps angle × power for all twelve weapons across six situations (long range, close range, gusty wind, a target in a pit, a wall between tanks, and opposite map edges). It scores both perfect aim and slightly-off aim, and asserts that no weapon wins more than three of the twelve situation/skill combinations, that at least five different weapons are the best choice somewhere, that no weapon is strictly dominated by another, and that every weapon deals real damage in at least two situations.

## Wide battlefield and aiming challenge

Historical first widening pass. See [latest 3200-wide seeded-terrain field](#wider-field-and-fresh-terrain--latest-2026-11-05) for current dimensions and behavior.

The user found the tanks too large/close and aiming too easy, and supplied a Pocket Tanks screenshot as a **scale/composition reference only**. The game retains its own Golden Valley art, interface and weapons.

- The physical world increases from 1280 × 720 to **2240 × 1260 world units**. A uniform 4/7 projection fits the world into the unchanged **1280 × 720 logical viewport**; the HUD, arsenal and touch controls now reflow independently outside the canvas. This is not a sprite-only scale change: terrain, tank roots, hitboxes, muzzles, projectiles and effects all share the same mapping.
- Spawn centers move from 220/1060 to **230/2010**, increasing separation from 840 to **1780 physical units**. A 106-unit tank chassis now occupies about **61 screen units instead of 106**, roughly 43% smaller. The target gap is over twice the previous gap relative to tank size.
- An original broad central ridge stands over 200 physical units above the level spawn pads. It is real destructible collision terrain and blocks flat cross-map fire, not a decorative background mountain.
- Catalog launch speeds increase by **1.4×** at unchanged gravity, giving approximately **1.96×** flat-ground reach. Tank/blast sizes and damage caps do not increase. Standard Shell can cross the map with deliberate high-power aiming, but the old **45° / 75%** default no longer hits the opponent. Short-range heavy/demolition roles remain distinct; Ricochet Orb trades its forgiving bounce reach for increased wind sensitivity.
- The optional preview shows only **0.55 seconds** of the launch path, down from 1.6. It does not reveal the landing point. Pointer coordinates map back into the physical world, and drag-power distance is retuned for the wider arena.
- Faster rounds use collision samples at most **one world unit** apart, retaining thin-wall collision. Projectile heads keep their full physics interpolation; smoke trail drawing retains spaced real observations instead of repainting every subpixel collision sample.
- Safe-area insets now define the actual canvas parent rectangle. This fixes an existing padded-parent aspect distortion on short landscape viewports. Player labels and damage text remain readable independently of world zoom.

Tests verify both players have real cross-ridge hits, default shots miss under several winds, flat shots hit the ridge, all twelve weapons remain viable in the balance scenarios, input projection is correct, and desktop/landscape-phone/portrait views retain their aspect ratio. These are automated correctness checks, not a substitute for further human difficulty playtesting.

[Updated battlefield capture](artifacts/ui/wide-battlefield/desktop.png).

### Adding a weapon

Weapons are pure data in `packages/content/src/weapons/weaponCatalog.ts`; the engine never branches on a weapon id. Compose a new weapon from the generic behaviours in `WeaponDefinition.ts`: multi-projectile launch, bounce, proximity or timed airburst, sticky fuse, drilling, apex/timer/impact splitting, flat-fire elevation limits, and a presentation-only trail (`smoke`, `spark`, `glow`, `dashed`, or `none`). Then pick an existing icon glyph. Every arsenal is validated when an engine is constructed. Definitions that could create an unbounded shot (too many projectiles, bounces that never lose energy, missing timers) or a one-shot kill are rejected with every problem listed.

### Projectile safety guarantees

- Swept collision: projectiles are substepped to at most 1 world unit per collision sample, with tank and thin-wall regression coverage for the retuned faster rounds.
- Each projectile detonates at most once, and each explosion damages each tank at most once. Total damage per tank per shot is clamped to the weapon's cap.
- The direct-hit bonus goes only to the tank a warhead physically struck. Impact bomblets ignore the struck hull briefly so they scatter instead of re-hitting it point blank.
- Spawned children never spawn again (two generations at most). A shot can create at most 32 projectiles.
- Every projectile has a lifetime limit, every shot has a 25-second timeout, and projectiles leaving the battlefield are discarded.
- When a tank is destroyed, the match ends immediately. Remaining warheads, bomblets, and stuck charges are cancelled and can never detonate afterwards, and all commands are ignored.
- Trails, bounce puffs, and split flashes are presentation-only and cannot affect simulation outcomes.

## Gameplay-linked animations

- **Movement:** wheels and tread cleats advance by accepted ground displacement, including reverse travel. Movement dust comes from actual track contact positions; stopped, blocked or in-flight movement commands cannot animate driving. Settling produces landing dust without delaying or easing the authoritative tank contact pose.
- **Barrel:** pointer/selection changes ease toward the real angle. A shot immediately synchronizes the barrel angle, then plays a short telescoping recoil and exact-position muzzle flash. Recoil never moves the simulation muzzle, hull, collision geometry or projectile.
- **Projectiles:** opt-in, bounded copies of the simulation's swept substep positions drive trails. Flying heads interpolate between known samples with at most one 60 Hz tick (16.7 ms) of visual delay; they never extrapolate, follow a decorative spline or feed coordinates back into physics. Orientation follows the sampled path tangent. Split children start at their real spawn point; stuck/drilling charges use their real attachment/depth. Removed projectiles disappear on the impact frame while their trails fade.
- **Impacts:** real explosion records drive expanding fireballs; actual terrain-deformed events drive crater-edge dust/debris. Airbursts that remove no terrain cannot throw dirt. Tank-damaged events drive short hull flashes, sparks and damage labels. Bounce/sticky/drill/split cues use event-time positions, even if the projectile disappears before the next render frame.
- **Destruction:** a single tank-destroyed event emits scrap, sparks, smoke and a shock ring. The disabled tank retains a darkened wreck with a broken barrel. Temporary effects continue fading after game over and are fully cleared by rematch.
- **Accuracy/accessibility:** all animation is read-only presentation. Terrain carving, health, ammo, shot completion and turn handoff retain the same rules. Pause freezes animation clocks. Reduced motion suppresses recoil and reduces nonessential particles/motion; the saved shake preference still applies.

Regression tests compare captured and uncaptured simulation outcomes for all twelve weapons, validate interpolation at 30/60/144 render Hz, and exercise an actual keyboard-played destruction/rematch sequence in Chromium. These are correctness checks, not a low-end-device performance qualification. Visual checks are saved under [animation captures](artifacts/ui/animations/terrain-impact.png).

## Audio

All audio is **original and synthesized at runtime with the Web Audio API** from the data in `apps/client/src/audio/WeaponVoices.ts`; there are no third-party samples, soundtrack assets or audio files to license or attribute.

- **Gameplay cues** come from the same authoritative drained combat events the renderer consumes: per-weapon firing voices, per-weapon explosion voices with an extra earthen rumble when terrain is actually removed, bounce boings, split shimmers, sticky-charge latches with fuse countdown ticks, drilling grind, damage clanks scaled by real damage (heavier for direct hits and falls), a single destruction sequence, turn handoff, and distinct victory (rising chord) and draw/defeat (falling line) endings.
- **Continuous layers** derive from read-only state copies per frame: an engine rattle only while a tank actually moves, servo ticks only while the authoritative aim angle changes, an airspeed-pitched whistle following the fastest live shell (stereo-panned by its real world X), and a two-layer original music loop that intensifies during flight and stops at game over.
- **Each weapon sounds different.** Voices are keyed by the weapon's icon family, and a unit test asserts every catalog entry resolves to a distinct firing and explosion voice. A new catalog weapon automatically gets a voice with no engine changes.
- **Controls.** The pause menu has master/music/effects sliders and a mute-all checkbox with 44 px touch targets; sliders apply live while dragging. Preferences persist in the same versioned local settings record (corrupt or out-of-range saves clamp safely) and `M`-free keyboard users can reach every control with Tab inside the dialog.
- **Autoplay restrictions.** No `AudioContext` exists until the first real user gesture (any key, pointer press, or the pause button); events that occur while locked are skipped, never queued. Suspended contexts resume on the next gesture, and a browser with no Web Audio API at all still plays a full match.
- **Gameplay isolation.** Audio observes events and state snapshots and schedules on the audio hardware clock; it never mutates the engine, is never awaited by the simulation loop, and every synthesis call is wrapped so failures are dropped silently. Unit tests replay identical engines with audio consuming events and assert byte-identical state, keeping local play and the future authoritative server in sync. Pause freezes music and loops without losing the music grid position.

## Workspace layout

```text
artillery-game/
├── apps/
│   └── client/             # Phaser 3 browser client
├── packages/
│   ├── content/            # Original identity and data-driven weapon definitions
│   ├── protocol/           # Versioned commands, events, and snapshots
│   └── simulation/         # Deterministic gameplay; no Phaser or browser APIs
├── tests/e2e/              # Playwright browser tests
├── .github/workflows/      # Continuous integration
├── plan.md                 # Full milestone plan and acceptance criteria
└── package.json            # Workspace development commands
```

## Architecture boundaries

- `apps/client` owns Phaser rendering, browser input, UI, audio, and presentation.
- `packages/simulation` owns authoritative game rules and deterministic simulation. It must not import Phaser, DOM APIs, or multiplayer frameworks.
- `packages/protocol` owns serializable, versioned client/server contracts.
- `packages/content` owns original weapon and game-content definitions shared by client and server.
- The physical world is 3200 × 1800 world units, with a top-left origin, positive X to the right, and positive Y downward. The client uses a separate 1280 × 720 logical viewport and uniform projection; HUD coordinates are never used as collision coordinates.
- Authoritative simulation will run at a fixed 60 Hz.
- Every future match will store a seed; authoritative gameplay must not call `Math.random()`.
- Local gameplay must become fully playable before online multiplayer implementation begins.

## Environment variables

Copy `.env.example` to `.env` only when local overrides are needed. `VITE_MULTIPLAYER_URL` is reserved for the later online milestone and is not used by the current client.

## Current gameplay

The game opens on an arcade main menu, routes through local setup/draft or quick practice, then moves to the battlefield with the selected original scenery:

- A draft board where players take turns claiming exclusive weapons by hand, with random picks, or with a fully random seeded deal
- A 3200 × 1800 physical battlefield projected into a responsive 1280 × 720 viewport, with smaller targets, 2688-unit spawn separation and fresh seeded rolling/valley/terrace/highland terrain
- A deterministic mutable terrain surface shared by simulation and rendering
- Horizontal spawn pads on opposite sides of the landscape
- Fourteen selectable original/reference-inspired vector tank designs with model-specific contact samples and rotating gun layers
- Track contact anchors that prevent floating, sinking, overlap, and battlefield escape
- Numeric angle, power, movement, health, wind, ammo, phase, and turn displays
- A visual barrel and a short, optional 0.55-second launch guide computed with the live simulation's integrator
- Fixed-step, swept projectile gravity and wind, capsule tank collision, explosions, direct hits, fall damage, craters, settling, victory, and turn handoff
- Sixty Original/Deluxe-scope adapted weapons with a native scrollable arsenal dock, pack/behavior notes, additive dirt, coatings and bounded special effects
- Per-weapon projectile trails, bounce puffs, split flashes, drilling and sticky-fuse countdown indicators
- Layered sky, mountains, HUD, touch controls, and distinct player colors
- 341 unit tests covering:
  - each weapon independently
  - every advanced behaviour
  - damage integrity
  - inventory
  - balance
  - draft rules, randomness, and fairness
  - validated and failure-tolerant saved visual settings
  - observational physics capture, trajectory interpolation and gameplay-driven animation lifecycles
  - wide-map separation, cover, cross-ridge reachability, default misses and projection accuracy
  - autoplay gating, distinct per-weapon voices, mute/volume behaviour and audio's read-only contract
  - read-only HUD status through real shot lifecycle, pause, win and draw
  - independent pointer holds, simultaneous controls, cancellation and idempotent release
  - five background assets, transfer budgets, texture caching and safe saved/session selection
  - matching graphite/regolith terrain materials, revision caching, clipping and crater preservation
- 24 normal-roster browser checks (Chromium/WebKit) plus 122 development-only legacy-fixture Chromium regressions (59 + 63). Built-game scope/articulation checks pass in both engines; this is not a new-roster competitive balance qualification.

See [plan.md](plan.md) for the required sequence from deterministic simulation through a complete local game, followed by authoritative Colyseus multiplayer and deployment.
