# Original + Deluxe weapon scope

User request (2026-11-05): improve tank resemblance to the supplied tank photographs while
retaining Arc & Armor's arcade presentation, and use only the **Original and Deluxe packs**
from <https://classic.blitwise.com/ptanksdepot.html>.

The official page was read directly. It identifies **#1 Original: 30 weapons**, and **#2
Deluxe: 30 weapons**. No Nuke/Ambush/Flamethrower or other later expansion is included, even
when a later pack is free or requires Deluxe ownership. This is not a claim of affiliation
with or endorsement by BlitWise. Referenced names are used with newly written game code,
paraphrased descriptions, original graphics and synthesized audio; vendor image assets,
executables, artwork and audio were not imported.

## Original (30)

Single Shot; Big Shot; 3 Shot; 5 Shot; Jackhammer; Heatseeker; Tracer; Pile Driver;
Dirt Mover; Crazy Ivan; Spider; Sniper Rifle; Magic Wall; Dirt Slinger; Zapper; Napalm;
Hail Storm; Ground Hog; Worm; Homing Worm; Skipper; Chain Reaction; Pineapple; Firecracker;
Homing Missile; Dirtball; Tommy Gun; Mountain Mover; Scatter Shot; Cruiser.

## Deluxe (30)

Jump Jets; Mud Pie; Pin Cushion; Laser Battery; Cannon Ball; Wacky Tank; Digger; Glue Bomb;
Fission Bomb; Late Bloomer; Fire Bolt; Color Bomb; Potholes; Boomerang; Popcorn; Sprinkler;
Well Digger; Bouncy Dirt; Super Tracer; Minigun; Laser; Super Skipper; Crater Maker;
Big Dirtball; Super Zapper; Cruball; Mega Cruiser; Roller; Heavy Roller; Flash Blast.

## Actual integration

- Normal development and production use the complete 60-entry roster, in official group order.
- Weapon Selection browses every entry and displays pack/adaptation information.
- Practice gives both players all 60. Draft/quick-random retain **five exclusive picks each**
  from 59 available weapons, plus unlimited **Single Shot** for both. No 58-pick draft.
- The normal 60-item draft is a scrollable native interface at desktop and mobile sizes.
- Retired 12-weapon content exists only as deterministic regression fixtures, enabled only
  by a development test-process environment flag. There is no menu or URL selector for it,
  and production ignores that flag. It is not another active weapon pack.

The [catalog](../packages/content/src/weapons/originalDeluxeCatalog.ts) is data-driven and
contains original HP/launch/ammo/timing settings. Normal play uses
[GameArsenal](../apps/client/src/game/GameArsenal.ts). Names are not just alternate labels for
one shell: there are real additive/subtractive terrain changes, guidance, vertical hopping,
bounded split bursts, staggered volleys, ground travel, coatings and tank repositioning.

## Deliberate adaptations and limits

This is **not pixel-identical Pocket Tanks or its point-scoring simulation**. Arc & Armor
retains 100-HP matches, per-shot damage caps, one-column heightfield collision, seeded state,
32-warhead safety budget and a 25-second shot timeout.

- **Napalm, Hail Storm, Color Bomb, Spider, Pin Cushion:** bounded fragment/projectile
  approximations rather than hundreds of particles, persistent fluid/webs or independently
  simulated child laser emitters. Hail Storm uses 12 bouncing fragments. Pin Cushion uses
  bounded energy-splash fragments. Color Bomb uses a color-accented burst, not a recreation
  of the original rainbow effect.
- **Ground Hog/Worm/Homing Worm/Digger/Late Bloomer:** a travelling trench opens through the
  heightfield; emerging shots and Late Bloomer's five children are real. Enclosed underground
  cavities/overhangs are not supported by the terrain representation and are not faked as
  verified tunnels. These are surface-exposing tunneling adaptations.
- **Dirtball/Magic Wall/Dirt Slinger/Mud Pie/Cruball:** actually raise solid terrain. Tanks
  settle on the new exposed top; enclosed burial/suffocation and soil-volume conservation
  are not simulated. Dirt Slinger uses a V-shaped placement profile, not original fluid dirt.
- **Dirt Mover:** wide local trench excavation, not a precise directional clipping beam.
- **Bouncy Dirt/Glue Bomb:** bounded persistent surface intervals (at most 64), shown in
  pink/lavender. Later coatings override earlier coatings locally. Rubber reflects ordinary
  shells; glue cancels rubber and halts ground cruisers. These are not liquid simulations.
- **Tracer/Super Tracer:** non-damaging 5/10-shot fans report signed range error and a suggested
  direction of elevation adjustment. They are not exact next-shot angle solvers.
- **Jump Jets:** quarter-speed bounded ballistic tank repositioning with ground settling;
  does not change the rest of the game's suspension/physics system.
- **Jackhammer:** initial impact plus five actual vertical hops, with unique per-hop IDs and
  one shared shot ledger. **Super Skipper:** up to eight physical terrain skips.
- **Zapper/Super Zapper:** real nearby-target energy damage and an event-driven beam visual,
  without a terrain crater. Laser is a straight zero-gravity projectile. Laser Battery is
  eight bounded ordered pulses near the landing region, not original laser animation code.
- **Fission Bomb:** one bounded generation of 12 fragments, not recursively exponential splits.
- **Fire Bolt:** short flight lifetime; no continuous flame decay/heat-field simulation.
- **Cannon Ball/Popcorn/Sniper Rifle:** direct-impact damage, not radial explosion damage.
  Sniper knockback changes real tank position subject to world/clearance checks.
- **Flash Blast:** real broad HP damage without terrain excavation; persistent scorch coloring
  on otherwise unchanged ground is not implemented.

These distinctions are intentional, disclosed, and still need human gameplay tuning. Passing
finite-state/cap tests is not a claim that all 60 match the original's tactics, visual effects,
point values or balance.

## Verification

- All **341 unit tests** pass; 84 new pack tests verify the exact 30+30 groups, every weapon's
  launch/ammo/finite resolution/deterministic replay/caps and actual dirt/hops/trenches/coating/
  repositioning/beam effects. Earlier tests retain the 12-weapon fixture to detect regressions.
- **24 normal-roster browser checks** pass: 12 each in Chromium/WebKit, covering catalog scope,
  native 59-item draft, exclusivity, phone layout, real fired samples from the major behavior
  groups and refined tank-art/muzzle agreement.
- **122 legacy-fixture Chromium checks** also pass in completed 59+63 batches. These verify
  continuity, not a 60-weapon balance qualification.
- Lint, typecheck and production build pass, with the pre-existing Phaser bundle warning.
- The production checker verifies the real built 60-item roster (not a dev fixture), refined
  tanks, independent rotating guns and actual terrain-tool firing in Chromium/WebKit.

Commands from the game root:

```sh
pnpm test
pnpm exec playwright test --config playwright.original-deluxe.config.ts --workers=2
pnpm exec playwright test --workers=2 # legacy fixture, isolated port 4185
pnpm build
node scripts/check-tank-production.mjs
```

Previews:
- [Refined tank roster](../artifacts/ui/tanks/refined-roster.png)
- [Full-pool draft](../artifacts/ui/original-deluxe/full-roster-draft.png)
- [Real Magic Wall after firing](../artifacts/ui/original-deluxe/magic-wall-resolved.png)
- [Built game, refined tanks and 60-weapon arsenal](../artifacts/ui/tanks/refined-original-deluxe-production-chromium.png)
