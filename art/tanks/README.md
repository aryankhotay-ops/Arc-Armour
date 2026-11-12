# Tank art and articulation intent

## Latest visual refinement

The user asked for closer resemblance to their actual tank sheet without losing the game
theme. [TankDetailArtwork](../../apps/client/src/rendering/TankDetailArtwork.ts) now adds
model-specific curved/box/wedge hull/turret contours, cast-turret seams, overlapping Tiger/
Panther road wheels, sprockets, skirts, bustle shapes, hatches, optics, rivets and restrained
camouflage. Team colors remain accents; broad silhouettes and common-scale proportions are
not replaced by uniform tinted rectangles. These remain original arcade adaptations, not
photorealistic/historical replicas. Track contacts, gun pivots and collision data are unchanged.

- [Refined complete roster](../../artifacts/ui/tanks/refined-roster.png)
- [Built game with approved 60-weapon arsenal](../../artifacts/ui/tanks/refined-original-deluxe-production-chromium.png)

The normal arsenal is now Original+Deluxe only; the later mention of Rail Punch below is
historical regression-fixture information, not a normal-game weapon.

User reference: the attached 12-tank photographic/profile sheet, with a request to choose
tanks and make the nozzle/barrel movable and rotatable. The sheet was inspected visually.
These are newly authored stylized side-profile vectors, not cropped photos or copied tank
images. Do not bake the gun back into the hull or stretch all designs to identical proportions.

Catalog: Tiger I, Panther, T-34/85, IS-2, AMX-13, Strv 103, Churchill, Abrams, Merkava Mk.4,
Leopard 2A7, Renault FT-17 and Mark V, plus the two existing arcade models.

The [shared catalog](../../packages/content/src/tanks/tankCatalog.ts) contains deliberately
chosen **game-unit** silhouette and interface data, not researched real-world dimensions.
These are arcade adaptations. Strv 103 and Mark V do not represent conventional historical
turret mechanisms; their elevation joints are explicitly fictional game articulation.
Reference context for this distinction: [tank recognition references](https://archive.org/stream/Janes_Tanks_And_Combat_Vehicles_Recognition_Guide_2Nd_Ed_2000/Janes_Tanks_And_Combat_Vehicles_Recognition_Guide_2Nd_Ed_2000_djvu.txt).

[TankSprites](../../apps/client/src/rendering/TankSprites.ts) supplies separate original
SVG hull/gun layers, encoded as local data URLs. Transparent textures are cached at load;
there are no image downloads or frame-by-frame chassis redraws. Every preview shares a
224 x 138 game-unit viewport: compact/tall/long/low designs stay distinguishable.

Gun texture origin is the model trunnion; the forward tip equals `barrelLength`. Sprite
rotation supplies elevation and translation supplies recoil. Hull slope lives on the parent
container. The shared simulation drives launch point, collision footprint and track sampling,
not a second guessed barrel endpoint. Tests compare the actual sprite-world matrix with the
authoritative muzzle coordinates for both facings. HP/ammo/weapon stats are unchanged; differing
footprints/muzzles mean these models are not asserted to have identical match outcomes.

- [Selection preview](../../artifacts/ui/tanks/selection-roster.png)
- [Actual low elevation](../../artifacts/ui/tanks/panther-t34-15-production-chromium.png)
- [Actual high elevation](../../artifacts/ui/tanks/panther-t34-75-production-chromium.png)
- [Phone landscape](../../artifacts/ui/tanks/panther-t34-75-production-webkit.png)
- [Browser tests](../../tests/e2e/tankSelection.spec.ts)
- [Production checker](../../scripts/check-tank-production.mjs)

No engineering-scale fidelity, historical suspension behavior, unrestricted 360-degree
traverse or human-qualified cross-model balance is claimed. Standard gun elevation is 5-85
degrees; Rail Punch remains capped at 30. Physical-device/Firefox qualification remains open.