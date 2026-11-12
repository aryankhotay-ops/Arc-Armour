# Background artwork and provenance

## Latest: pencil and lunar themes

The user asked to retain the original three despite quality feedback, and add pencil-drawn
scenery like their earlier image plus a Moon surface with Earth in space. The reference image
is not accessible in this chat/workspace, and generation again failed on unavailable models.
These are description-led additions, not exact reproductions of the unseen reference.

- [Pencil master](pencil-study-master.png): lossless 1920 x 1080 raster, warm paper, graphite contours and cross-hatching. Original code-authored drawing.
- [Lunar master](lunar-earthrise-master.png): lossless 1920 x 1080 raster, original cratered highlands with the NASA Apollo 17 Earth photograph composited into black space. [NASA provenance and use guidance](source/credits.md).
- [Pencil WebP](../../apps/client/src/assets/backgrounds/pencil-study.webp): 265,468 bytes.
- [Lunar WebP](../../apps/client/src/assets/backgrounds/lunar-earthrise.webp): 53,886 bytes.

Run `python3 scripts/build-special-backgrounds.py` with NumPy/Pillow available to rebuild
these two. The [builder](../../scripts/build-special-backgrounds.py) uses fixed seeds, retains
lossless masters locally and encodes quality-82 opaque RGB WebP. No server/image service or
runtime photo download is required. The two new WebPs total 319,354 bytes / 311.9 KiB. All five
runtime plates total 415,918 bytes / 406.2 KiB. Fine pencil texture deliberately receives more
bytes than the flat-color illustrations; it is not reduced to blurry flat silhouettes.

Runtime graphite/regolith ground uses the same heightfield and original crater samples as the
old palette. Only a terrain revision or material switch rebuilds that texture; no grain or
hatching is generated every frame. These plates do not include collision ground, tanks or UI.

## Original three (unchanged)

User intent: continue the Pocket Tanks-style Arc & Armor backgrounds from earlier game chats;
if image generation is unavailable, provide three optimized game backgrounds.

Neither those chat transcripts nor original reference-image attachments were present. Both
image-generation attempts returned unavailable-model errors. These masters are newly
code-authored from the saved Golden Valley art's style, not AI outputs and not modifications
of unseen reference images. Game screenshots were inspected for style but never cropped into
background textures (which would bake in UI, tanks and non-destructible ground).

- [Golden Valley](golden-valley.svg): sunset, faceted lavender snowcaps, green pine hills.
- [Desert Canyon](desert-canyon.svg): warm mesas, rock bands and distant dusty dunes.
- [Moonlit Alpine](moonlit-alpine.svg): snowy blue peaks, sparse stars and a subdued aurora.

All are editable 1920 x 1080 SVGs. The upper sky stays quiet for projectile legibility;
details are atmospheric/distant. Do not add tanks, soil cross-sections, foreground collision
terrain or UI to these plates. The original dynamic terrain is rendered over them.

Run `python3 scripts/build-backgrounds.py` from the game root with Node on PATH, installed
project dependencies, Playwright Chromium and Pillow available. The
[builder](../../scripts/build-backgrounds.py) writes these SVG masters, uses the
[Chromium rasterizer](../../scripts/rasterize-backgrounds.mjs), and creates opaque RGB,
quality-88 WebP assets. SVGs are not shipped to the game; only the optimized local WebPs are.
Rebuilding regenerates SVGs too, so edit the builder for changes that must survive regeneration.

- [Runtime Golden Valley](../../apps/client/src/assets/backgrounds/golden-valley.webp): 35,968 bytes.
- [Runtime Desert Canyon](../../apps/client/src/assets/backgrounds/desert-canyon.webp): 29,382 bytes.
- [Runtime Moonlit Alpine](../../apps/client/src/assets/backgrounds/moonlit-alpine.webp): 31,214 bytes.

Combined 96,564 bytes / 94.3 KiB. Exact width/height, image decode, cached placement, transfer
budget and paused-shot parity are covered by the game's unit/browser checks. See
[game background status](../../README.md#three-optimized-backgrounds--2026-11-05).