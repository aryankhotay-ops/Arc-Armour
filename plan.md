# Artillery Game Development Plan

## 1. Product goal

Build an original two-player, turn-based artillery game for the web using TypeScript and Phaser 3. The game will feature generated destructible terrain, tanks that settle onto the terrain, adjustable firing angle and power, deterministic projectile physics, multiple original weapons, explosions, local two-player play, and later authoritative online multiplayer.

The reference establishes the artillery-game genre only. The project must use an original name, artwork, audio, interface, terrain, balancing, and weapon designs.

## 2. Delivery priorities

1. Establish a deterministic, testable shared simulation.
2. Deliver a fully playable two-player local game before starting online multiplayer.
3. Add online play without creating a separate gameplay implementation.
4. Test every milestone; do not postpone all validation until the end.
5. Keep Phaser responsible for presentation while shared TypeScript modules own game rules and simulation.

## Current implementation checkpoint — 2026-11-10 (multiplayer reliability + match cycle)

Protocol v3 reliability pass: indexed accepted-command log (live rebroadcast + reconnect
replay), one-fire-per-turn enforcement (stale-turn/already-fired rejections before the
engine), disconnect grace with resume tokens and held seats (configurable GRACE_SECONDS),
ping/pong latency, abandoned-room sweep, and rematch voting that fully resets the engine on
a fresh deterministic seed. Client gains a connection-status/latency strip, opponent
disconnect notices, automatic backoff reconnection that rebuilds the mirror from the command
log without reload, ordered command delivery by log index, and a native results panel with
winner announcement, rematch voting and return-to-menu; both players start rematches without
refreshing. Verified: 9 reliability server tests, 25 total server tests, 505 unit tests, and
4 browser tests including the complete UI cycle (probe-engine aiming to a real winner,
rematch reset of health/terrain/inventory/projectiles/turn order, second match on the same
sockets) and an abrupt-transport-drop auto-reconnect preserving match state. Open: TLS/WSS
deployment, snapshot-checksum auto-resync, local release-gate items.

## Earlier checkpoint — 2026-11-10 (online rooms and synchronized matches)

Milestone 14's private-room scope is now implemented on the client: a real ONLINE lobby
(create room with 4-letter code + shareable `?join=CODE` invitation link, join by code,
two named players, live ready states, acknowledged departure/seat reuse), and synchronized
gameplay through deterministic mirror engines. Local input becomes intents; the server
validates and rebroadcasts each accepted command; both clients replay the identical stream
(byte-identical trajectories/terrain) while the server owns health/damage/results including
forfeit verdicts. Verified by 3 complete-match server tests with browser-equivalent mirror
clients (496 unit tests total) and 2 two-context Chromium UI tests against the production
server bundle. Open: reconnection grace, snapshot resync, TLS/WSS deployment, release gate.

## Earlier checkpoint — 2026-11-10 (authoritative server started)

Milestones 12–13 began ahead of the formal local release gate at the user's request: the
protocol package now carries versioned commands/events/snapshots with a structural validator
(intents only — no client-authored damage/health/results can even be expressed), and
`apps/server` hosts a dependency-free RFC 6455 WebSocket server over node:http running the
shared deterministic GameEngine authoritatively (sessions, 4-letter room codes, rate limits,
turn/phase gating, aim clamping, engine-enforced movement/weapons, 20Hz tick, snapshot +
combat-event broadcast, forfeit on disconnect). 13 real client-server connection tests pass
through Node's built-in WebSocket client (493 total unit tests), and a live smoke against the
esbuild production bundle played a real shot to turn handoff over actual sockets. The online
browser client/lobby (Milestone 14), reconnection/resync and TLS deployment remain open; the
in-game ONLINE menu still truthfully reports no deployed public server.

## Earlier checkpoint — 2026-11-10 (pre-hosting qualification)

Pre-hosting validation run on the current build: 480 unit tests, the complete 122-check
Chromium offline suite, 34 full-depot checks (Chromium+WebKit), 30 responsive cross-engine
checks, production build + built-game qualification in both engines, and a new reproducible
connectivity gate (`scripts/check-online-offline.mjs`) proving fully offline local play with
zero external requests/WebSockets and a truthful no-server online destination. Six
terrain-variety assertions were updated for the full-width arena (proportional small-target
bound). Local play is static-host ready from `apps/client/dist`. Online multiplayer remains
unimplemented behind the local release gate; results flow, replay checksums, human balance
testing and Firefox/real-device qualification are still open.

## Earlier implementation checkpoint — 2026-11-10

Full-depot roster continuation: 194 weapons in normal play (Original 30 + Deluxe 30 + 13
expansion packs, 134 original bounded adaptations referencing depot names/roles only), a
seeded random 20-weapon draft pool per match (`createRandomPoolDraftConfig`), per-weapon
derived audio voices with blast-scaled booms, O(1) projectile/trail animation lookups, and
data-driven jagged energy-arc visuals. Lint, client typecheck, 480 unit tests and 17+17
Chromium/WebKit full-depot browser checks pass. Expanded-roster competitive balance and
human playtesting remain open; the balance sweep still targets the legacy fixture.

## Previous implementation checkpoint — 2026-11-05

This is the resumable file-based status, not a claim that every numbered milestone is complete.
The saved implementation already contained the exclusive seeded weapon draft, twelve balanced
data-driven weapons, swept combat, terrain craters/settling, and Golden Valley procedural art.

The latest continuation adds a native pause/help dialog, confirmed restart/new-draft actions,
focus-loss/background pause, device-persisted trajectory/shake preferences, reduced-motion
override, and keyboard/touch menu access. Pause freezes simulation, particles, landscape and
tweens without changing the shared game rules. Restarts retain drafted loadouts, and scene
shutdown removes DOM controls and global listeners.

The animation continuation adds distance-driven tracks/wheels and track-contact dust, eased
barrel aim with launch synchronization/recoil, authoritative swept-path trail samples and
one-tick projectile interpolation, actual crater-edge impact debris, damage flashes, and a
single event-driven destruction burst followed by a persistent wreck. Root poses, terrain and
all combat rules remain authoritative; animation state never writes back into simulation.
Pause freezes effects and reduced motion suppresses recoil/reduces secondary motion.

The wide-map continuation responds to the user's scale/difficulty reference: a **2240 x 1260**
physical battlefield is projected uniformly into the separate **1280 x 720** logical UI.
Tank centers are 1780 physical units apart (previously 840); chassis are about 43% smaller
on screen. A real central ridge blocks flat shots. Catalog launch speeds are 1.4x the original
values, with unchanged tank/blast dimensions and damage caps, one-unit collision sampling,
and greater wind sensitivity for the otherwise overly forgiving Ricochet Orb. The optional
launch guide is shortened to 0.55 seconds. Pointer aiming and safe-area aspect handling are
verified separately from world coordinates; player/damage labels retain readable sizing.

The audio continuation adds fully original, browser-synthesized sound: per-weapon firing and
explosion voices keyed by icon family, movement/aiming/flight/fuse loops from read-only state,
damage/destruction/turn/victory/defeat cues from authoritative events, an original two-layer
music loop on the WebAudio clock, and persistent master/music/effects/mute controls in the
pause menu. No AudioContext exists before a user gesture (autoplay compliance), locked-period
events are skipped rather than queued, synthesis failures are swallowed, and unit tests prove
audio consumption leaves engine state byte-identical — the simulation/server contract is
untouched. Audio qualification on real devices and the accessibility caption work remain open.

The main-menu continuation makes MenuScene the default entry. Original arcade tank art and
an animated landscape back the native front end. Play Local has draft/seeded-random/practice
setup; Weapon Selection browses live catalog data and enters the real draft. Controls,
shared persisted Settings, quick mute and Credits work with keyboard/mouse/touch. The Online
Multiplayer destination is explicitly an unavailable-server status, not implemented networking.
Draft and pause screens return home, with confirmation for abandoning an active match. Scene
shutdown cleans up native DOM, audio contexts and global listeners. Explicit deep links are
`?draft=on&seed=N` and `?draft=off`; normal `/` always starts on the menu. No combat simulation
runs behind the front end. A stale-frame wait in the older aiming browser test was corrected.

The HUD continuation replaces the canvas sky card/control overlays with reserved native header
and footer rows. Both health bars, selected weapons, turn/active player, phase/wind, actual ammo,
angle/power, movement remaining and weapon description/behaviour/stats observe the live engine.
Owned/depleted weapons and firing/aiming/movement locks reflect its legal input state; pause
updates immediately without advancing simulation. Native sliders use exported simulation limits
and per-weapon elevation caps; hold/step controls, Space isolation, rematch/new draft and clean
scene teardown are implemented. Small-screen weapon information scrolls independently so FIRE
and movement remain visible, and no HUD rectangle overlaps the battlefield. The canvas retains
its world projection while its CSS size adapts to the remaining space. The HUD is complete for
the existing local-match rules, not a claim of configurable names, timers or online state.

The responsive continuation adds safe-area/dynamic-viewport layout with 48px native controls,
full-row narrow-phone sliders and a right-hand dock on short landscape screens. Native small
screen draft cards/actions call the same WeaponDraft methods as the original desktop UI.
Per-pointer capture tracks simultaneous movement/aiming without one finger cancelling another;
tap steps once and hold repeats via existing input. Cancel, release outside, pause, blur,
resize and shutdown release held state. Native horizontal arsenal and vertical info scrolling
are isolated from the fixed page; keyboard/turn selection reveals the proper slot. A stale
Phaser parent-size issue on HUD disclosure resize was fixed by measuring before refresh, not
by distorting canvas CSS. Portrait/landscape changes do not reset simulation or draft state.

Verified: lint, typecheck, **206 unit tests**, production build, and **82 Chromium browser
tests**, including all prior draft/combat/pause tests, all-weapon capture-on/off parity,
30/60/144 Hz interpolation checks, and a full keyboard-played destruction/rematch regression.
New coverage proves default shots miss, both players can deliberately hit across the actual
ridge, flat shots are blocked, and scaled input/canvas aspect remain correct across viewports.
All audio tests were rerun successfully. Thirteen new browser tests cover menu destinations,
exclusive seeded quick matches, settings propagation, repeated scene round trips, input focus,
and touch at 320 x 740, 390 x 844 and 844 x 390. Vitest is capped at two workers; the full browser
suite was verified with `pnpm exec playwright test --workers=2`. Difficulty still needs human
playtesting; automated reach/balance checks are not a claim of final gameplay qualification.
The build succeeds with a large-bundle warning for the Phaser-containing client chunk.

Four HUD status unit tests and twelve native-HUD browser tests additionally cover real
health/damage/winner/rematch, live aim/power/movement, ammo/flight locks, drafted ownership,
keyboard and touch input, held-movement exhaustion/release, pause/scene cleanup and no-overlap
layout at 1440 x 900, 844 x 390, 390 x 844 and 320 x 740. Existing depleted-ammo browser coverage
now also asserts the rendered EMPTY/disabled state. These changes leave simulation outcomes,
draft fairness, wide-map dimensions and the local-release gate unchanged.

Six pointer-ownership unit tests and seventeen responsive browser tests cover nine desktop,
tablet and phone viewports (1920 x 1080 down to 320 x 568 / 568 x 320), minimum touch sizes,
clear arena/control separation, aspect-preserving fit, landscape rotation, preserved state,
touch step/hold/aim/fire, genuine multi-contact movement/aiming, native range drags, horizontal
and vertical weapon scrolling, cancellation and mobile draft. The responsive subset also
passes **13 WebKit tests**, with four Chromium/CDP-only gesture tests explicitly skipped in
WebKit. Firefox's Playwright process fails before loading a page with "Could not find profile
folder" on this host (including a /tmp profile attempt); Firefox is configured but unverified.
Real iOS/Android devices, low-end performance and browser chrome/safe-area hardware behaviour
remain release qualification work. [Responsive test commands and limitations](README.md#responsive-desktop-tablet-and-mobile-play).

### Background continuation — 2026-11-05

The user requested the backgrounds from the other game chats, with image optimization as
fallback. Those transcripts/reference-image attachments were not available in the workspace;
two image-generation calls failed because their prompt models were unavailable. Continued
from the saved Golden Valley renderer instead, without claiming to edit unseen references.

Delivered three original code-authored landscape plates: Golden Valley sunset, Desert Canyon
and Moonlit Alpine. Each has an editable SVG master and a 1920 x 1080 RGB WebP runtime asset,
96,564 bytes combined. Plates contain decorative scenery only, not baked-in HUD, tanks or
destructible ground. A quiet sky occupies most of each image.

Play Local and Settings have a native background selector and preview; the pause menu can
change backgrounds without restarting the match, including a paused live projectile. Choice
persists with safe denied-storage/session fallback. Scene texture caches and Vite fingerprinted
asset URLs avoid repeated rasterization. Missing assets retain the original procedural renderer.
Simulation, original live grass/soil, map shape, spawn geometry, loadouts and weapon physics
are unchanged: this is three backgrounds, **not** three gameplay maps.

Verified after fixes: lint, strict typecheck, **219 unit tests**, production build and the full
**92 Chromium browser tests** pass. Ten new browser tests verify asset pixels/dimensions,
desktop/phone composition, selection/persistence, denied storage, missing-image fallback and
exact paused-shot state parity. Production smoke checks additionally pass all three themes
in both Chromium and WebKit (fingerprinted assets + paused-shot selection). Real-device and
Firefox qualification are still open; the existing Phaser bundle-size warning remains.
[Background assets, provenance and controls](README.md#three-optimized-backgrounds--2026-11-05).

### Pencil and lunar continuation — latest, 2026-11-05

User feedback: the first three backgrounds were not up to the requested quality; keep them
but add a pencil-drawn landscape like the earlier supplied image and a Moon surface with Earth
in space. The earlier attachment is still unavailable, so this is description-led artwork,
not an asserted exact visual match. The image generator remains blocked by model availability.

Added Pencil Study (paper grain, broken graphite marks, cross-hatched mountains) and Lunar
Earthrise (original cratered gray lunar highlands plus the NASA Apollo 17 full-Earth photo).
NASA credit is in the menu and source provenance. Two deterministic local raster masters,
1920 x 1080 WebP deployments, quality 82, 319,354 bytes combined. First three assets unchanged.
All five are 415,918 bytes. Lossless masters/source photo do not ship to the browser.

The existing selector now exposes all five choices. Pencil/grey regolith material also styles
the live heightfield; plants and colored strata are absent from these two themes. Original
themes keep their old terrain. Rendering is cached until a heightfield/material revision;
switching in pause redraws presentation without resetting original samples, craters or a shot.
No gravity, wind, collision, map shape, tank, inventory or balance changes.

Verified lint, strict typecheck, **224 unit tests**, production build and the complete
**98 Chromium browser tests**. Sixteen background regressions now include the added desktop/
phone cases, exact paused-shot state parity across all five choices and palette changes after
real crater formation. Five terrain units cover no per-frame rebuild, clipping and read-only
material switching. Both new themes additionally pass production-build checks in Chromium and
WebKit with bundled assets and paused-shot selection. Hardware/Firefox qualification and the
existing Phaser bundle-size warning remain open.
[Current backgrounds and previews](README.md#pencil-study-and-lunar-earthrise--latest-addition-2026-11-05).

### Wider field and random terrain — latest, 2026-11-05

User supplied three actual Pocket Tanks screenshots to request more space relative to tanks
and a new randomly arranged playfield rather than the same single lump each game. Inspected
the attachments directly; no reference artwork was copied.

World changed to 3200 x 1800 with a uniform 0.4 projection; fixed spawn centers 256/2944,
2688-unit gap (51% more than 1780), unchanged 106-unit chassis/hitbox now 42.4 logical pixels.
Native controls/labels remain separate. Six deterministic generator families replace the
mandatory center hump: rolling, valley, terraces, escarpment, twin-ridges, broken-highlands.
Random amplitudes/phases/control heights, finite one-column samples, bounded natural slopes
and exactly level pads provide collision-ready maps without spawn trapping.

Browser crypto chooses new terrain entropy at match boundaries, separate from draft seed.
New local/draft/quick/practice matches and completed-game rematches (Space/R/FIRE) get new maps;
pause Restart repeats the original map, with fresh health/ammo/craters. Explicit terrainSeed
URL overrides are reproducible even on rematch. Background/resize/pause do not regenerate maps.
Bounded immutable source cache (32 maps) avoids repeated generation; mutable terrain is copied
per engine. Launch speed adjusted by sqrt(2688/1780) for playable reach; gravity/damage/blast/
ammo unchanged. Legal-angle/power balance sweeps cover current seeded cover and distances.

Verified lint/typecheck/build, all 231 unit tests (120 map seeds, both-player real shots across
24 maps, balance, crater/animation/audio regressions). The 106 Chromium checks passed across
runs: final all-suite execution hit the shell time budget after 101 successful tests, remaining
five passed in a targeted continuation. Not a single full-run 106-pass claim. Pointer-rounding
test fixed and repeated three times. Production Chromium/WebKit smoke verified three terrain/
background combinations with real crater formation and exact retries. Human terrain fairness/
difficulty, physical-device/Firefox qualification, replay release gate and large Phaser warning
remain open. [Current status and previews](README.md#wider-field-and-fresh-terrain--latest-2026-11-05).

### Selectable tanks and gun articulation — latest, 2026-11-05

User supplied a sheet containing Tiger I, Panther, T-34/85, IS-2, AMX-13, Strv 103, Churchill,
Abrams, Merkava Mk.4, Leopard 2A7, Renault FT-17 and Mark V; requested independent tank choices
and moving/rotating nozzles. Added all 12 reference-inspired original arcade designs alongside
Marigold/Cobalt. Not photo cutouts or historical engineering-scale replicas. Different lengths,
heights, turret shapes and track layouts survive a common portrait viewport. Strv/Mark gun
articulation is labeled an arcade adaptation, not a historical turret mechanism.

Native radio-card selection in Play Local/Settings, per-player tabs, same-model games and a
live gun-only rotation preview. Versioned saved/session preferences apply at new match start,
not during a live shot. Choices survive draft/restart/rematch and appear in actual HUD/labels.
Shared content geometry drives track samples, collision capsule, gun pivot and muzzle length.
Twelve new hull textures have no barrel; the distinct gun sprite rotates/translates for aim/
recoil. Cached original vector textures load for selected IDs only. Original two graphic
barrels retain their separate rendering. Sloped pointer aiming corrected for both facings.
5-85 elevation / rail 30 cap, ammo/HP/movement allowance unchanged; footprints affect hit
geometry, so competitive cross-model fairness still needs human testing.

Verified lint/typecheck/build, 257 unit tests, 122 Chromium checks in two completed runs
(59 gameplay/tank + 63 flow/responsive/terrain). Sixteen new browser checks cover all 12 new
tanks, actual sprite-transform muzzle parity, both-facing gun orientation, slope/movement,
recoil/pause, P2 turn aim, native mobile selection, denied storage, draft/restart propagation.
Production native selection/articulation checks pass in Chromium/WebKit. Reproducible script
is committed; photos, remote dependencies and per-frame chassis rasterization are not used.
Physical-device/Firefox qualification and cross-model playtesting remain open; existing large
Phaser bundle warning persists. [Current tank status](README.md#tank-selection-and-articulated-guns--latest-2026-11-05).

### Closer tank references and approved weapon packs — latest, 2026-11-05

User requested more resemblance to their real-tank sheet while retaining the arcade theme,
and only Original/Deluxe weapons from the official BlitWise depot. Read the actual page:
exact scope is #1 Original 30 and #2 Deluxe 30, not all expansions that require Deluxe.

Refined all 12 reference designs with curved cast/box/wedge turret profiles, Tiger/Panther
overlapping wheels, armor/skirts/bustles, hatches/optics/rivets and subtle camo/highlights.
Original vector art, no photo cropping; common-scale proportions, split guns and model physics
interfaces retained. Art is cached at load, not redrawn per frame.

Normal game now uses the exact two-pack 60-entry roster, unlimited Single Shot, a 59-item
draft pool and five exclusive picks each. All 60 in practice. Full roster gets native scrollable
desktop/mobile drafting. Pack/adaptation notes are visible in the weapon browser. Retired
12-weapon content remains an isolated DEV-only regression fixture, not a selectable user mode
or URL override; production ignores its environment flag.

New generic runtime behaviors: actual dirt construction/excavation, proximity steering/energy
damage, vertical hops, bounded splits, staggered volleys, ground cruising/rolling, rubber/glue
intervals, deterministic aim scrambles/knockback and Jump Jets repositioning. Matching dirt,
coating and energy-beam visuals. Terrain edits and damage remain authoritative, finite and
ledger-capped. Not original point values or exact physics: tunnels are surface-exposing trenches,
fluid/web/ice effects use bounded fragment approximations, dirt doesn't simulate enclosed
burial, and tracers report range error/direction rather than an exact angle solution. Pin
Cushion/Laser Battery/Color Bomb are adapted rather than original emitter/animation clones;
Flash Blast does not persist scorch coloring on unchanged terrain.

Verified lint/typecheck/build, all **341 unit tests**, including 84 two-pack tests covering
every entry and actual special effects. **24 normal-roster browser checks** pass (12 each
Chromium/WebKit); **122 legacy-fixture Chromium checks** also pass in 59+63 batches. Production
checker confirms compiled 60-only roster, refined tanks, true gun/muzzle alignment, pause and
actual terrain-tool shots in Chromium/WebKit. No normal-roster all-situation balance/human
qualification claim: earlier twelve-weapon balance table is regression-only. Existing Phaser
bundle warning, Firefox/real-device, human balance and release gates remain open.
[Roster/source/limits](docs/original-deluxe-weapons.md), [latest checkpoint and previews](README.md#refined-tank-art-and-original--deluxe-arsenal--latest-2026-11-05).

**Still unfinished before the local release gate:**

- Dedicated results flow, configurable names/maps/extended match settings and turn timer.
  Main-menu/local loadout setup is implemented; these broader milestone criteria remain open.
- Accepted-command/replay log and checksum validation, plus broader deterministic seed/soak tests.
- First-use tutorial, audio captions/visual cues for audio-only events, wider
  accessibility/browser and low-end performance qualification.
- All acceptance criteria not explicitly demonstrated above; the new complete-match self-hit
  regression covers destruction/rematch, not the unfinished dedicated results flow or a
  representative balanced multiplayer playtest.

Milestones 10 and 11 are therefore **in progress**, not complete. No server or online work has
started. Continue the local flow first; preserve the current artwork, draft fairness and shared
simulation/presentation boundary. [Project overview and controls](README.md).

## 3. Proposed technology stack

- **Language:** TypeScript
- **Client/rendering:** Phaser 3
- **Build tooling:** Vite
- **Package management/workspace:** pnpm workspaces
- **Shared simulation:** framework-independent TypeScript package
- **Local state:** explicit finite-state match controller
- **Online server:** Node.js, Colyseus, WebSockets
- **Persistence (after online MVP):** PostgreSQL with Drizzle ORM
- **Unit/integration testing:** Vitest
- **Browser end-to-end testing:** Playwright
- **Code quality:** ESLint and Prettier
- **Web deployment:** static client host plus a persistent Node.js/WebSocket host
- **Optional later packaging:** Capacitor for mobile; Electron or Tauri for desktop

## 4. Architecture rules

- Use a fixed simulation timestep and explicit seeded random-number generator.
- Store authoritative terrain collision data separately from its rendered texture.
- Keep gameplay code independent of Phaser, browser APIs, and Colyseus.
- Represent player actions as validated commands and simulation outcomes as events.
- In local play, an in-browser match host executes commands.
- In online play, the server executes the same commands authoritatively.
- The server owns official shot results, terrain deformation, damage, scoring, inventory, and turn order.
- Clients may preview trajectories, but previews never determine official outcomes.

## 5. Proposed repository layout

```text
artillery-game/
├── plan.md
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.js
├── .prettierrc
├── .env.example
├── apps/
│   ├── client/
│   │   ├── index.html
│   │   ├── package.json
│   │   └── src/
│   │       ├── main.ts
│   │       ├── game/
│   │       ├── scenes/
│   │       ├── rendering/
│   │       ├── input/
│   │       ├── ui/
│   │       ├── audio/
│   │       └── online/
│   └── server/
│       ├── package.json
│       └── src/
│           ├── index.ts
│           ├── rooms/
│           ├── matchmaking/
│           └── persistence/
├── packages/
│   ├── simulation/
│   │   └── src/
│   ├── protocol/
│   │   └── src/
│   └── content/
│       └── src/
├── tests/
│   ├── fixtures/
│   └── e2e/
└── deploy/
    ├── Dockerfile.server
    ├── docker-compose.yml
    └── README.md
```

Expected files below describe the intended files for each milestone. Files may be split further when implementation makes that useful.

---

# Phase A — Foundations and core simulation

## Milestone 0 — Project setup and empty application

**Status:** Completed and validated on 2026-11-02.

### Features

- Create the pnpm monorepo and workspace packages.
- Configure strict TypeScript for browser, server, and shared packages.
- Configure Vite and launch an empty Phaser scene.
- Configure Vitest, Playwright, ESLint, and Prettier.
- Add scripts for development, builds, tests, linting, and type checking.
- Establish shared coordinate conventions, units, simulation tick rate, and seeded-random policy.
- Add continuous integration for install, lint, typecheck, unit tests, and client build.

### Expected files

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `eslint.config.js`
- `.prettierrc`
- `.gitignore`
- `.env.example`
- `.github/workflows/ci.yml`
- `apps/client/package.json`
- `apps/client/index.html`
- `apps/client/vite.config.ts`
- `apps/client/src/main.ts`
- `apps/client/src/scenes/BootScene.ts`
- `packages/simulation/package.json`
- `packages/simulation/src/index.ts`
- `packages/protocol/package.json`
- `packages/protocol/src/index.ts`
- `packages/content/package.json`
- `packages/content/src/index.ts`
- `tests/e2e/smoke.spec.ts`
- `README.md`

### Dependencies

- None.

### Acceptance criteria

- `pnpm install` succeeds from a clean checkout.
- `pnpm dev` opens a Phaser canvas with an identifiable boot scene.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all pass.
- A Playwright smoke test loads the client without browser-console errors.
- Shared packages can be imported by the client without path hacks.
- The README records development commands and the architecture boundaries.

## Milestone 1 — Deterministic simulation foundation

### Features

- Define simulation units, world bounds, gravity, wind, and fixed timestep.
- Add vector, bounds, interpolation, and numeric utility functions.
- Add a seeded pseudo-random-number generator.
- Define serializable match state, tank state, projectile state, and simulation events.
- Implement a simulation clock that does not depend on Phaser frame rate.
- Add state hashing or checksums for later multiplayer verification.

### Expected files

- `packages/simulation/src/config/SimulationConfig.ts`
- `packages/simulation/src/math/Vec2.ts`
- `packages/simulation/src/math/numeric.ts`
- `packages/simulation/src/random/SeededRandom.ts`
- `packages/simulation/src/time/FixedStepClock.ts`
- `packages/simulation/src/state/GameState.ts`
- `packages/simulation/src/events/GameEvent.ts`
- `packages/simulation/src/serialization/stateChecksum.ts`
- `packages/simulation/src/**/*.test.ts`

### Dependencies

- Milestone 0.

### Acceptance criteria

- Running an identical simulation seed and command sequence produces identical state and checksums.
- Simulation results do not change when render frame rate changes.
- Core state serializes to JSON and restores without data loss.
- Unit tests cover clock accumulation, seeded randomness, vector math, and checksum stability.

## Milestone 2 — Terrain generation and rendering

### Features

- Represent solid and empty terrain with a typed-array occupancy grid.
- Generate playable terrain from a deterministic seed.
- Apply smoothing and enforce minimum/maximum slopes and elevation ranges.
- Reserve safe tank spawn zones near opposing sides.
- Query terrain occupancy, surface height, and surface normal.
- Render terrain from simulation data using a Phaser canvas texture or render texture.
- Add a deterministic fallback map for tests.

### Expected files

- `packages/simulation/src/terrain/TerrainGrid.ts`
- `packages/simulation/src/terrain/TerrainGenerator.ts`
- `packages/simulation/src/terrain/TerrainQueries.ts`
- `packages/simulation/src/terrain/TerrainRules.ts`
- `packages/simulation/src/terrain/TerrainGrid.test.ts`
- `packages/simulation/src/terrain/TerrainGenerator.test.ts`
- `apps/client/src/rendering/TerrainRenderer.ts`
- `apps/client/src/scenes/LocalGameScene.ts`
- `tests/fixtures/terrainSeeds.ts`

### Dependencies

- Milestone 1.

### Acceptance criteria

- The same seed creates byte-identical terrain.
- At least 100 automated seeds remain within configured height and slope limits.
- Every tested map supplies two valid, separated spawn zones.
- Surface queries agree with the occupancy grid at sampled locations.
- Rendered terrain contains no visible gaps caused by mismatched simulation/render coordinates.
- The terrain fills the intended play area at supported viewport sizes.

## Milestone 3 — Tanks, terrain placement, and settling physics

### Features

- Define two tank entities with position, hull angle, health, and muzzle origin.
- Place tanks into valid spawn zones.
- Align each tank to the sampled terrain surface.
- Settle unsupported tanks downward after terrain changes.
- Prevent tanks from spawning inside terrain, outside world bounds, or on top of one another.
- Render original placeholder tank graphics with clear player colors.
- Keep collision geometry independent from sprites.

### Expected files

- `packages/simulation/src/tanks/TankState.ts`
- `packages/simulation/src/tanks/TankPlacement.ts`
- `packages/simulation/src/tanks/TankPhysics.ts`
- `packages/simulation/src/tanks/TankCollision.ts`
- `packages/simulation/src/tanks/TankPhysics.test.ts`
- `apps/client/src/rendering/TankRenderer.ts`
- `apps/client/src/game/TankView.ts`
- `apps/client/src/assets/placeholder/README.md`

### Dependencies

- Milestone 2.

### Acceptance criteria

- Two tanks spawn on all approved test seeds without overlap or terrain penetration.
- Tank hull angle follows the local terrain normal within the configured angular limit.
- Removing support causes a tank to settle to the next valid surface.
- Tanks never leave world bounds during placement or settling.
- Gameplay collision dimensions are documented and tested independently of visual size.

## Milestone 4 — Aiming and firing controls

### Features

- Add adjustable turret angle and firing power.
- Support keyboard, mouse/pointer, and touch-friendly controls.
- Enforce angle and power limits.
- Display turret direction, power, angle, wind, active player, and selected weapon.
- Add an optional short trajectory preview calculated from the shared simulation.
- Lock aiming controls while a shot or explosion sequence is active.

### Expected files

- `packages/simulation/src/aiming/AimState.ts`
- `packages/simulation/src/aiming/AimRules.ts`
- `packages/simulation/src/aiming/TrajectoryPreview.ts`
- `packages/protocol/src/commands/SetAimCommand.ts`
- `packages/protocol/src/commands/FireCommand.ts`
- `apps/client/src/input/AimingController.ts`
- `apps/client/src/ui/AimingHud.ts`
- `apps/client/src/rendering/TrajectoryPreviewRenderer.ts`
- `apps/client/src/input/AimingController.test.ts`

### Dependencies

- Milestone 3.

### Acceptance criteria

- Both players can set angle and power with keyboard and pointer input.
- Touch controls remain usable at the smallest supported mobile viewport.
- Controls cannot exceed configured angle or power ranges.
- The muzzle origin and displayed turret direction agree with simulation coordinates.
- A preview generated from the same initial conditions matches the early live trajectory within defined numeric tolerance.
- Inactive players cannot alter the current aim state.

## Milestone 5 — Projectile physics and collision

### Features

- Add fixed-step projectile integration with gravity and wind.
- Spawn projectiles from the tank muzzle using angle and power.
- Detect continuous or swept collisions with terrain, tanks, and world bounds to prevent tunneling.
- Emit launch, sampled-motion, impact, miss, and resolved events.
- Render and interpolate projectiles independently from simulation ticks.
- Add debug visualization for paths and collision samples in development builds.

### Expected files

- `packages/simulation/src/projectiles/ProjectileState.ts`
- `packages/simulation/src/projectiles/Ballistics.ts`
- `packages/simulation/src/projectiles/ProjectileSystem.ts`
- `packages/simulation/src/collision/SweptCollision.ts`
- `packages/simulation/src/projectiles/ProjectileSystem.test.ts`
- `apps/client/src/rendering/ProjectileRenderer.ts`
- `apps/client/src/rendering/DebugTrajectoryRenderer.ts`

### Dependencies

- Milestone 4.

### Acceptance criteria

- Known shot fixtures land within a documented collision-cell tolerance.
- Results are identical across repeated runs and different render frame rates.
- High-speed projectiles do not pass through tanks or one-cell terrain features in test cases.
- Projectiles resolve correctly after terrain impact, tank impact, and leaving world bounds.
- Only one unresolved projectile sequence exists for the initial single-shot weapon.

---

# Phase B — Combat systems and the local playable game

## Milestone 6 — Explosions, damage, and presentation events

### Features

- Resolve an explosion at a projectile impact point.
- Calculate radial tank damage with configurable falloff.
- Apply impulse or visual shake without making presentation authoritative.
- Emit structured explosion, damage, score, camera-shake, particle, and sound-cue events.
- Render temporary explosion animation, particles, flash, and camera shake.
- Prevent the next turn from beginning until the simulation marks the shot resolved.

### Expected files

- `packages/simulation/src/explosions/ExplosionDefinition.ts`
- `packages/simulation/src/explosions/ExplosionSystem.ts`
- `packages/simulation/src/combat/DamageSystem.ts`
- `packages/simulation/src/combat/ScoreSystem.ts`
- `packages/simulation/src/explosions/ExplosionSystem.test.ts`
- `apps/client/src/rendering/ExplosionRenderer.ts`
- `apps/client/src/game/PresentationEventPlayer.ts`

### Dependencies

- Milestone 5.

### Acceptance criteria

- Damage at configured test distances matches the documented falloff function.
- A tank outside the explosion radius receives no damage.
- Each impact produces one authoritative explosion and no duplicate damage.
- Presentation consumes events without modifying authoritative match state.
- The shot resolves only after projectile and explosion simulation are complete.

## Milestone 7 — Terrain destruction and post-impact settling

### Features

- Subtract circular and irregular crater masks from the terrain grid.
- Record a compact dirty rectangle and terrain-change event.
- Update only affected terrain rendering regions.
- Re-run tank support and settling checks after terrain deformation.
- Define rules for buried, falling, or out-of-bounds tanks.
- Add terrain checksums and patch serialization for future online resynchronization.

### Expected files

- `packages/simulation/src/terrain/TerrainDeformation.ts`
- `packages/simulation/src/terrain/CraterMasks.ts`
- `packages/simulation/src/terrain/TerrainPatch.ts`
- `packages/simulation/src/terrain/TerrainChecksum.ts`
- `packages/simulation/src/terrain/TerrainDeformation.test.ts`
- `apps/client/src/rendering/TerrainPatchRenderer.ts`
- `tests/fixtures/craterCases.ts`

### Dependencies

- Milestones 3 and 6.

### Acceptance criteria

- An explosion removes only terrain inside its configured deformation mask.
- Terrain render data and collision data match after repeated overlapping craters.
- Dirty rectangles fully contain every modified cell without requiring a full redraw.
- A tank left unsupported settles to valid terrain before the next turn.
- Deformation results and terrain checksums remain deterministic.
- Terrain patches serialize and restore to the same checksum.

## Milestone 8 — Data-driven weapon system

### Features

- Define a versioned, data-driven weapon schema.
- Track per-player weapon inventories and ammo.
- Add reusable weapon behaviors rather than hard-coded scene logic.
- Implement an initial original weapon set:
  - Standard shell: single impact and medium crater.
  - Heavy shell: slower projectile and larger explosion.
  - Cluster shell: parent projectile splits into several smaller projectiles.
  - Bouncer: rebounds a limited number of times before exploding.
- Add weapon selection UI and concise descriptions.
- Validate weapon data on client and server-compatible shared code.

### Expected files

- `packages/content/src/weapons/WeaponDefinition.ts`
- `packages/content/src/weapons/weaponCatalog.ts`
- `packages/content/src/weapons/standardShell.ts`
- `packages/content/src/weapons/heavyShell.ts`
- `packages/content/src/weapons/clusterShell.ts`
- `packages/content/src/weapons/bouncer.ts`
- `packages/simulation/src/weapons/WeaponSystem.ts`
- `packages/simulation/src/weapons/behaviors/`
- `packages/simulation/src/inventory/WeaponInventory.ts`
- `packages/content/src/weapons/weaponCatalog.test.ts`
- `apps/client/src/ui/WeaponSelector.ts`

### Dependencies

- Milestones 5–7.

### Acceptance criteria

- All four weapons can be selected, fired, resolved, and rendered in local simulation.
- Weapons are defined in shared content files and require no weapon-specific code in the Phaser scene.
- Ammo decrements exactly once after an accepted shot.
- A weapon with no ammunition cannot be fired.
- Cluster child projectiles and bounces resolve deterministically.
- Automated tests cover each weapon's defining behavior, damage, crater, and completion condition.

## Milestone 9 — Turn and match management

### Features

- Implement an explicit match-state machine: setup, aiming, projectile flight, resolving, settling, turn transition, and match over.
- Alternate turns between exactly two players.
- Apply a configurable turn timer.
- Define valid commands for each state and reject invalid commands.
- Determine victory by configurable health/elimination rules for the MVP.
- Record a replayable command and event log.
- Support rematch and return-to-menu flows.

### Expected files

- `packages/simulation/src/match/MatchState.ts`
- `packages/simulation/src/match/MatchStateMachine.ts`
- `packages/simulation/src/match/MatchRules.ts`
- `packages/simulation/src/match/MatchHost.ts`
- `packages/simulation/src/match/CommandValidator.ts`
- `packages/simulation/src/replay/ReplayLog.ts`
- `packages/protocol/src/commands/`
- `packages/protocol/src/events/`
- `packages/simulation/src/match/MatchStateMachine.test.ts`

### Dependencies

- Milestone 8.

### Acceptance criteria

- Turns alternate only after the current shot, explosion, deformation, and settling finish.
- Inactive, duplicate, stale, or state-inappropriate commands are rejected without changing state.
- Turn timeout behavior is deterministic and documented.
- The match ends once and identifies the correct winner or draw.
- Replaying an accepted command log from the same initial seed produces the same final checksum.
- A rematch starts with clean state and a new documented seed.

## Milestone 10 — Fully playable two-player local game

### Features

- Add a title/menu scene and local-game setup screen.
- Let players choose names, colors, map seed/random map, and initial weapon loadout.
- Connect all core systems into a complete local hot-seat match.
- Add pause, resume, restart, rematch, and return-to-menu flows.
- Add minimum viable HUD, help overlay, and keyboard/touch instructions.
- Add local settings for volume, screen shake, trajectory preview, and turn duration.
- Persist preferences locally without requiring an account.

### Expected files

- `apps/client/src/scenes/MenuScene.ts`
- `apps/client/src/scenes/LocalSetupScene.ts`
- `apps/client/src/scenes/LocalGameScene.ts`
- `apps/client/src/scenes/ResultsScene.ts`
- `apps/client/src/game/LocalMatchController.ts`
- `apps/client/src/ui/GameHud.ts`
- `apps/client/src/ui/PauseMenu.ts`
- `apps/client/src/ui/HelpOverlay.ts`
- `apps/client/src/settings/LocalSettings.ts`
- `tests/e2e/localMatch.spec.ts`

### Dependencies

- Milestones 0–9.

### Acceptance criteria

- Two people sharing one device can start, play, finish, and rematch without developer tools.
- A complete match exercises aiming, power, wind, all initial weapons, explosions, damage, and destructible terrain.
- Input is handed to the correct local player each turn.
- Pause and resume do not advance simulation time.
- The game remains playable with keyboard-only, pointer-only, and touch input at supported viewports.
- A Playwright test completes a deterministic shortened match and reaches the results screen.
- No online service, account, or network connection is required.

## Milestone 11 — Interface, accessibility, audio, and local-game polish

### Features

- Replace debug UI with a coherent responsive interface.
- Add original tank, projectile, terrain, explosion, and interface artwork.
- Add original or properly licensed firing, impact, explosion, UI, and ambient sounds.
- Add music and independent master/music/effects controls.
- Add captions or visual cues for important audio-only events.
- Add colorblind-safe player identification using shape/pattern as well as color.
- Improve mobile safe-area handling, focus management, and readable scaling.
- Add first-use tutorial prompts and clear turn transitions.
- Profile rendering, allocations, terrain patch updates, and low-end-device behavior.

### Expected files

- `apps/client/src/ui/theme.ts`
- `apps/client/src/ui/ResponsiveLayout.ts`
- `apps/client/src/ui/AccessibilitySettings.ts`
- `apps/client/src/audio/AudioManager.ts`
- `apps/client/src/audio/SoundCueMap.ts`
- `apps/client/src/scenes/PreloadScene.ts`
- `apps/client/public/assets/`
- `apps/client/public/assets/ATTRIBUTION.md`
- `tests/e2e/accessibility.spec.ts`
- `tests/e2e/responsive.spec.ts`

### Dependencies

- Milestone 10.

### Acceptance criteria

- UI remains readable and usable at agreed desktop, tablet, and mobile viewport sizes.
- The two players remain distinguishable in a colorblind simulation.
- All audio has clear provenance and license documentation.
- Muting persists across reloads and prevents new sound playback.
- Critical state changes have both visual and audio cues.
- A full local match meets the agreed performance target on a representative low-end device.
- No copied Pocket Tanks names, artwork, audio, UI, terrain, or weapon designs are present.

## Local release gate — mandatory before online work

Online implementation must not begin until all of the following are true:

- Milestones 0–11 meet their acceptance criteria.
- Two-player local matches are complete and enjoyable from menu through results.
- At least four original weapons are balanced enough for repeatable playtests.
- Terrain destruction and tank settling remain stable across a long seeded soak test.
- Replay checksums prove deterministic command execution.
- Core simulation, local integration, and browser end-to-end tests pass in CI.
- Remaining local issues are triaged, with no open blocker or critical-severity defect.

---

# Phase C — Online multiplayer

## Milestone 12 — Network protocol and online architecture

### Features

- Define versioned network commands, events, snapshots, and error responses.
- Separate public player state from server-private state.
- Add runtime schema validation at network boundaries.
- Define room lifecycle, readiness, turn deadlines, disconnection grace period, and forfeits.
- Define snapshot and terrain-patch resynchronization.
- Add protocol compatibility and simulation/content version checks.
- Write a concise threat model for cheating, malformed messages, and denial-of-service risks.

### Expected files

- `packages/protocol/src/version.ts`
- `packages/protocol/src/commands/ClientCommand.ts`
- `packages/protocol/src/events/ServerEvent.ts`
- `packages/protocol/src/snapshots/MatchSnapshot.ts`
- `packages/protocol/src/schemas/`
- `packages/protocol/src/errors/ProtocolError.ts`
- `packages/protocol/src/**/*.test.ts`
- `docs/online-architecture.md`
- `docs/threat-model.md`

### Dependencies

- Local release gate.

### Acceptance criteria

- Every online message is versioned, typed, and runtime-validated.
- Invalid, oversized, unknown, or state-inappropriate messages fail safely.
- Snapshot plus terrain data can reconstruct a running match to the same checksum.
- Protocol tests cover accepted and rejected message examples.
- No Phaser or DOM types appear in the protocol or simulation packages.

## Milestone 13 — Authoritative Colyseus match server

### Features

- Create the Node.js/Colyseus server.
- Add room creation, two-player joins, readiness, match start, and room cleanup.
- Run the existing shared match host on the server.
- Validate active player, turn, angle, power, inventory, rate limits, and command sequence.
- Broadcast authoritative events and periodic state checksums.
- Add heartbeat, disconnect grace period, reconnection token, and forfeit handling.
- Add structured logs and basic health/readiness endpoints.

### Expected files

- `apps/server/package.json`
- `apps/server/tsconfig.json`
- `apps/server/src/index.ts`
- `apps/server/src/config.ts`
- `apps/server/src/rooms/ArtilleryRoom.ts`
- `apps/server/src/rooms/RoomStateAdapter.ts`
- `apps/server/src/security/CommandRateLimiter.ts`
- `apps/server/src/observability/logger.ts`
- `apps/server/src/health.ts`
- `apps/server/src/**/*.test.ts`
- `tests/integration/onlineRoom.test.ts`

### Dependencies

- Milestone 12.

### Acceptance criteria

- Exactly two clients can join, become ready, and complete an authoritative match.
- A client cannot fire out of turn, reuse ammunition, submit illegal values, or submit duplicate commands.
- Server results match the same deterministic local fixture.
- A disconnected player can reconnect within the grace period and receive a valid snapshot.
- Exceeding the grace period produces the documented forfeit result.
- Empty and completed rooms release timers and memory.
- Integration tests complete multiple matches without state leaking between rooms.

## Milestone 14 — Online client, lobby, and resilience

### Features

- Add online menu, create-room, join-code, ready, waiting-room, and match screens.
- Add a Colyseus client adapter behind the same local/remote match-controller interface.
- Animate authoritative server events without changing official state locally.
- Show latency, connection state, turn deadlines, disconnects, reconnection progress, and errors.
- Request a snapshot when checksums disagree.
- Handle browser refresh and mobile background/foreground transitions.
- Keep initial online scope to private room codes; defer ranked matchmaking and accounts.

### Expected files

- `apps/client/src/online/OnlineMatchController.ts`
- `apps/client/src/online/ColyseusConnection.ts`
- `apps/client/src/online/SnapshotReconciler.ts`
- `apps/client/src/scenes/OnlineMenuScene.ts`
- `apps/client/src/scenes/OnlineLobbyScene.ts`
- `apps/client/src/ui/ConnectionStatus.ts`
- `apps/client/src/ui/RoomCodePanel.ts`
- `tests/e2e/onlineMatch.spec.ts`
- `tests/e2e/reconnection.spec.ts`

### Dependencies

- Milestone 13.

### Acceptance criteria

- Two separate browsers can create/join a room and complete a match.
- Both clients show the same terrain, tank state, inventory, health, active turn, and winner.
- Artificial latency and packet delay do not allow double firing or divergent official state.
- Refresh or temporary disconnect reconnects within the configured grace period.
- A forced checksum mismatch is repaired by snapshot resynchronization.
- Online connection failures produce actionable UI and never block local play.

## Milestone 15 — Online identity, persistence, and matchmaking expansion

### Features

- Add guest identity first; evaluate full accounts only when product requirements justify them.
- Persist match summaries, disconnect outcomes, and aggregate player statistics.
- Add PostgreSQL and Drizzle migrations.
- Add public matchmaking only after private rooms are stable.
- Add abuse reporting, display-name validation, privacy controls, and data-retention rules.
- Add ranking only after anti-cheat and match-completion behavior is understood.

### Expected files

- `apps/server/src/persistence/schema.ts`
- `apps/server/src/persistence/db.ts`
- `apps/server/src/persistence/migrations/`
- `apps/server/src/identity/GuestIdentity.ts`
- `apps/server/src/matchmaking/Matchmaker.ts`
- `apps/server/src/moderation/DisplayNamePolicy.ts`
- `apps/client/src/online/IdentityStore.ts`
- `apps/client/src/scenes/MatchmakingScene.ts`
- `tests/integration/persistence.test.ts`
- `docs/privacy-and-retention.md`

### Dependencies

- Milestone 14.
- Provisioned PostgreSQL for non-unit environments.

### Acceptance criteria

- Guest identity survives a normal browser reload without exposing private credentials.
- Completed matches are stored once, including deterministic result identifiers.
- Database migrations work from an empty database and during upgrades.
- Matchmaking pairs only compatible game/protocol versions.
- Duplicate completion messages do not create duplicate match records.
- Privacy and retention behavior is documented before collecting persistent user data.

---

# Phase D — Hardening, deployment, and release

## Milestone 16 — Comprehensive testing and quality hardening

### Features

- Expand unit coverage for terrain, projectiles, weapons, damage, turns, and protocol validation.
- Add property-based or generated-seed tests for terrain and projectile edge cases.
- Add deterministic replay regression fixtures.
- Add client/server integration and two-browser end-to-end suites.
- Add load tests for concurrent rooms and reconnect storms.
- Add accessibility checks, responsive-layout checks, and browser compatibility coverage.
- Add profiling budgets for client frame time, memory, server tick time, and message size.
- Add security review for command validation, rate limits, secrets, dependencies, and logs.

### Expected files

- `tests/fixtures/replays/`
- `tests/property/terrain.property.test.ts`
- `tests/property/projectiles.property.test.ts`
- `tests/integration/clientServer.test.ts`
- `tests/load/rooms.k6.ts`
- `tests/e2e/localMatch.spec.ts`
- `tests/e2e/onlineMatch.spec.ts`
- `playwright.config.ts`
- `vitest.workspace.ts`
- `docs/test-matrix.md`
- `docs/performance-budgets.md`
- `.github/workflows/ci.yml`

### Dependencies

- Milestones 0–15, with tests added incrementally during every earlier milestone.

### Acceptance criteria

- All unit, integration, and end-to-end suites pass repeatedly in CI.
- Seeded soak tests complete the agreed run count without crashes, stuck turns, or divergent checksums.
- Supported browsers pass local and online match tests.
- Load tests meet documented concurrent-room, latency, memory, and server-tick budgets.
- Automated accessibility checks report no unresolved serious or critical issue.
- Dependency and secret scanning report no unresolved release-blocking issue.
- A release candidate has no open blocker or critical-severity defect.

## Milestone 17 — Deployment and operations

### Features

- Build a production client bundle with environment-specific server URL configuration.
- Containerize the persistent WebSocket server.
- Configure TLS, secure WebSockets, CORS/origin policy, health checks, and graceful shutdown.
- Deploy the client to a static host/CDN and server to a Node.js host that supports long-lived WebSockets.
- Provision PostgreSQL only if Milestone 15 is included in the release.
- Add logs, metrics, error reporting, backups, alerts, and rollback instructions.
- Add staging and production environments.
- Run post-deployment local and two-browser online smoke tests.
- Document optional PWA installation; defer mobile/desktop wrappers until the web release is stable.

### Expected files

- `apps/client/.env.example`
- `apps/server/.env.example`
- `deploy/Dockerfile.server`
- `deploy/docker-compose.yml`
- `deploy/README.md`
- `deploy/healthcheck.sh`
- `docs/operations-runbook.md`
- `docs/release-checklist.md`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-production.yml`

### Dependencies

- Milestone 16.
- Production hosting, DNS, TLS, and secret-management decisions.
- PostgreSQL only when persistent online features are enabled.

### Acceptance criteria

- A clean tagged revision deploys reproducibly to staging.
- The public client uses HTTPS and connects to the server using secure WebSockets.
- Local play remains functional when the multiplayer server is unavailable.
- Two remote browsers can complete an online match in the deployed environment.
- Health checks, structured logs, metrics, and alerts expose server failures.
- Graceful shutdown stops new rooms and gives active rooms the documented drain behavior.
- Rollback to the previous compatible release is documented and successfully rehearsed.

## Milestone 18 — Optional platform packaging after web release

### Features

- Evaluate PWA installability and offline caching first.
- Package with Capacitor for iOS/Android only if app-store distribution is required.
- Package with Electron or Tauri for desktop only if native distribution is required.
- Keep platform services behind adapters for storage, lifecycle, notifications, and purchases.
- Verify online compatibility with the same protocol and server.

### Expected files

- `apps/client/public/manifest.webmanifest`
- `apps/client/src/platform/PlatformServices.ts`
- `apps/client/src/platform/WebPlatformServices.ts`
- `apps/mobile/` if approved
- `apps/desktop/` if approved
- `docs/platform-release-checklist.md`

### Dependencies

- Milestone 17.
- Store accounts, signing identities, and platform-specific requirements.

### Acceptance criteria

- The PWA installs and launches using the production build.
- Offline local play works within the documented cached-asset limitations.
- Optional wrappers introduce no gameplay fork and pass the shared simulation tests.
- Background/foreground, resize, audio focus, reconnect, and safe-area behavior pass on target devices.
- Store-specific builds are signed and satisfy their respective release checklists.

---

# 6. Recommended implementation sequence

```text
0 Setup
  → 1 Deterministic simulation
  → 2 Terrain generation
  → 3 Tank placement/physics
  → 4 Aiming
  → 5 Projectile physics
  → 6 Explosions/damage
  → 7 Terrain destruction
  → 8 Weapons
  → 9 Turns/match rules
  → 10 Complete local game
  → 11 Interface/audio/accessibility polish
  → LOCAL RELEASE GATE
  → 12 Network protocol
  → 13 Authoritative server
  → 14 Online client/private rooms
  → 15 Optional persistence/matchmaking
  → 16 Hardening
  → 17 Deployment
  → 18 Optional platform packaging
```

# 7. Deferred scope

The following should not block the first fully playable local game or the first private-room online build:

- Accounts and social login
- Public ranked matchmaking
- Spectators
- More than two players
- In-game purchases
- Large weapon catalogs
- User-generated maps
- Mobile and desktop store packaging
- Global leaderboards
- Replays shared through a backend
- Live-service content systems

# 8. Definition of done for the first major releases

## Local MVP

- Two local players can complete a match from menu to results.
- Terrain is generated, destructible, and synchronized with collision.
- Tanks settle correctly after craters remove support.
- Angle, power, wind, projectile flight, explosions, damage, turns, and four weapons work.
- The game supports desktop and touch-friendly browser controls.
- Deterministic tests and a complete-match browser test pass in CI.

## Online MVP

- Two remote players can create or join a private room and complete a server-authoritative match.
- Invalid or out-of-turn commands cannot alter the match.
- Reconnection and snapshot resynchronization work.
- Online failure never prevents local play.
- Two-browser end-to-end and server integration tests pass in CI.

## Web release

- Local and online MVP criteria pass in staging and production.
- Responsive UI, accessibility basics, original/licensed audiovisual assets, security checks, monitoring, and rollback procedures are complete.
- Deployment is reproducible from a tagged revision.
