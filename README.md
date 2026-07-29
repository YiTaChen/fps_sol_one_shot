# Cinderline: One Shot

![Active combat](artifacts/captures/07-active-combat.png)

**Cinderline: One Shot** is an original, deterministic browser tactical FPS
built with Three.js and WebGL2. Its single industrial-market district is
authored, then assembled and dressed procedurally at runtime. The game includes
real projectile ballistics, combat AI, advanced first-person movement, a
code-built rifle and soldier rigs, pooled effects, a complete match loop, and
synthesized spatial audio.

The runtime downloads no models, textures, images, or audio samples. Geometry,
PBR maps, props, architecture, weapon and character assets, effects, ambience,
and sound effects are generated from code.

## Objective

Deploy into Ash Market and neutralize the six-hostile objective before your
health reaches zero. Seven active soldiers populate the district. They patrol,
investigate, pursue, use cover, reposition, aim, fire, react to hits, and reload.

Combat supports projectile travel, gravity, hit zones, headshots, penetrable
materials, shallow metal ricochets, surface-specific impacts, decals, particles,
tracers, hit markers, and directional damage feedback. Victory, defeat, pause,
resume, and deterministic restart are all playable.

## Controls

Click **Deploy** first to enable pointer-lock aiming and browser audio.

| Input | Action |
|---|---|
| `W A S D` | Move |
| Mouse | Look / aim |
| Hold `LMB` | Fire |
| Hold `RMB` | Aim down sights |
| `R` | Reload |
| Hold `Shift` while moving forward | Sprint |
| Hold `Ctrl` or `C` | Crouch |
| Sprint + `Ctrl` / `C` | Slide |
| `Space` | Jump; mantle at a valid ledge |
| `Q` / `E` | Protected lean left / right |
| `Esc` | Release pointer lock and pause |
| Menu buttons | Resume, restart, or change quality |

## Requirements and installation

- Node.js **20.19.0 or newer**
- npm
- A desktop browser with JavaScript, WebGL2, pointer lock, keyboard, and mouse

Install the locked dependencies:

```bash
npm ci
```

The automated checks need Playwright Chromium or an installed Google Chrome. If
Chromium is unavailable:

```bash
npx playwright install chromium
```

## Run locally

```bash
npm run dev
```

Vite binds to `127.0.0.1`; the usual URL is
`http://127.0.0.1:5173`, although it may select another free port.

A reproducible normal-game URL is:

```text
http://127.0.0.1:5173/?seed=20364033&quality=high
```

Valid quality values are `low`, `medium`, and `high`. Normal play defaults to
High.

## Production build

```bash
npm run build
npx vite preview
```

The ES2022 production bundle is written to `dist/`, includes source maps, and
separates Three.js into its own chunk. There is currently no `npm run preview`
alias.

## Quality presets

| Preset | Render scale | DPR cap | Shadow map | SSAO / bloom | Fog range |
|---|---:|---:|---:|---|---:|
| Low | 82% | 1.0 | 1024 | Off | 84 |
| Medium | 100% | 1.25 | 1536 | On | 105 |
| High | 100% | 1.75 | 2048 | On, stronger bloom | 128 |

Effect pools also respond to quality changes. Procedural material textures are
selected at startup: 128 px on Low and 256 px on Medium/High.

## Architecture

`Game` is the composition root and owns the state machine and subsystem
lifecycle:

```text
main.js
└── Game
    ├── core: fixed clock, named RNG streams, events, diagnostics
    ├── rendering: world scene, viewmodel scene, light and post-processing
    ├── materials + world: generated maps, architecture, props, colliders
    ├── player + physics: capsule, slopes, jump, slide, mantle, lean
    ├── rifle + projectiles + effects
    ├── enemy director + procedural soldier rigs
    ├── Web Audio synthesis
    └── DOM HUD and screens
```

Important properties:

- Gameplay uses a deterministic `1 / 60 s` fixed step.
- Rendering presentation is interpolated separately from simulation.
- World and first-person weapon render through separate scenes and cameras.
- Sibling systems communicate through an event bus.
- Named RNG streams isolate world dressing, AI, spread, effects, and audio.
- Restart resets the match without recreating the renderer, AudioContext, or
  global listeners.
- Hot systems reuse cached geometry/materials and fixed effect pools.

The runtime catalogs 12 building specifications, 8 façade families, 4
enterable interiors, 34 architectural modules, 40 prop archetypes, 19 material
families, and 7 active enemies. See [ARCHITECTURE.md](ARCHITECTURE.md) for the
full contract.

## Procedural assets

Runtime construction uses profiled, extruded, lathed, rounded, capsule, and
instanced geometry; seeded color/normal/roughness maps; code-built architecture,
interiors, props, rifle, hands, and soldiers; and ACES/sRGB rendering with
shadows, fog, SSAO, bloom, and a custom color-grade pass.

Combat effects use fixed pools for muzzle flashes, tracers, shells, particles,
and decals. Audio uses oscillators, generated noise buffers, convolution
ambience, HRTF positioning, and material-specific impact synthesis.

The map is not endlessly randomized: it is a deliberately authored layout whose
assembly, variants, materials, dressing, and simulation are seeded and
deterministic.

## Validation

```bash
npm run build
npm test
npm run capture
npm run profile
```

### Browser smoke suite

`npm test` runs 18 browser-level checks covering boot, test API, enemy
population, deterministic movement, jump/crouch/slide/lean, continuous-slope
collision, pause and input clearing, resize, firing, ADS, reload, player damage,
real two-way ballistic combat, effects, victory, defeat, three deterministic
restart cycles, pointer-lock loss, and browser/internal diagnostics.

Final result: **18/18 passed in 350.85 seconds**, with zero console errors, page
errors, failed requests, or HTTP errors.

Report: `artifacts/tests/smoke-report.json`

### Deterministic captures

`npm run capture` generates seven High-quality 1440×810 views:

```text
artifacts/captures/
├── 01-wide-street.png
├── 02-facade-close.png
├── 03-interior.png
├── 04-weapon-hip.png
├── 05-weapon-ads.png
├── 06-enemy.png
├── 07-active-combat.png
└── manifest.json
```

The final manifest is `mode: full`, contains seven SHA-256 hashes, and records
zero browser errors. The active-combat view verifies a real projectile hit
before saving; the final run recorded target health `100 → 24.4`, player health
`100 → 60.48`, one consumed round, 96 particles, 2 tracers, 5 decals, and one
shell.

Generate selected views with:

```bash
FPS_CAPTURE_VIEWS=wide-street,active-combat npm run capture
```

A filtered run writes `manifest.partial.json`; a complete run writes
`manifest.json`. `FPS_CAPTURE_SEED` and `FPS_CAPTURE_DIR` are also supported.

### Moving-combat profile

`npm run profile` performs 120 warm-up frames followed by 600 measured real
browser frames at Medium quality and a requested 1280×720 drawing buffer. It
requires at least 5 m of accumulated movement, 30 shots, one reload, active play
at completion, correct resolution, and zero browser errors.

Report: `artifacts/performance/moving-combat.json`

| Metric | Result |
|---|---:|
| Median FPS | `0.23` |
| Median frame time | `4315.4 ms` |
| p95 frame time | `5310.6 ms` |
| p99 frame time | `5912.3 ms` |
| Maximum frame time | `8850.1 ms` |
| Frames over 50 / 100 ms | `599 / 599` |
| Accumulated movement / displacement | `75.76 m / 45.58 m` |
| Shots / reloads | `60 / 2` |
| Target ≥45 median FPS | **Not met on this runner** |

The run completed all 600 samples at the exact 1280×720 drawing buffer, ended
in active play after 10 simulated seconds, and reported zero browser errors.
Headless Chrome's SwiftShader GPU process was the limiting environment: this is
an intentionally unfavorable software-rendering result, not a measurement of
the target modern-laptop hardware GPU. The raw 600-sample array and runner
metadata are preserved in the JSON report.

Automation starts a temporary Vite server at `127.0.0.1:4173`. To reuse a
running server:

```bash
FPS_BASE_URL=http://127.0.0.1:5173 npm test
```

The same variable works with capture and profile.

## Honest visual assessment

The final independent pixel review found visible gains in weapon geometry,
enemy equipment, façade construction, interior dressing, material scale, and
combat readability. It nevertheless scored every visual category below the
prompt's strict 4/5 acceptance threshold. Simplified primitives, hard edges,
mannequin-like anatomy/hand contact, repetitive surfaces, a few visibly floating
goods, and the active-combat canopy composition remain.

The result is a coherent, complete procedural FPS prototype, but the captures do
not support claiming professional military-FPS art quality. Full scores and
per-image evidence are in
[artifacts/visual-review.md](artifacts/visual-review.md).

## Known limitations

- WebGL2 and desktop pointer-lock controls are required; touch and gamepad
  controls are not implemented.
- This is a single-player, single-level, single-rifle, fixed-objective game. It
  has no networking, save system, or progression.
- Browser audio begins only after a user gesture.
- Live quality switching does not regenerate procedural material textures.
- Smoke, capture, and profile scripts exercise source through Vite; run
  `npm run build` separately to validate the production bundle.
- Capture hashes document outputs but are not pixel-diff regression tests.
- The profiler forces headless Chromium through SwiftShader software WebGL. Its
  results are reproducible runner measurements, not a hardware-GPU laptop
  benchmark.
- The 45 FPS target is recorded as `targetMet`; missing it does not make the
  profile command exit unsuccessfully.
- Vite assumes root-path hosting; subpath deployment requires an appropriate
  `base` setting.
