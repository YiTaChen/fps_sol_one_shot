# Cinderline: One Shot

An original, deterministic browser tactical FPS built with Three.js and WebGL2.
Equip a loadout, restore three relays, and extract from Ash Market. Cinderline
combines six switchable weapons and three tactical utilities with reactive
patrols, advanced first-person movement, and synthesized spatial audio. Endless
Sweep is available from the main menu.

**▶ [Play online](https://fps-gpt56-one-shot.web.app)** · **[Run locally](#quick-start)** ·
**[Explore the gameplay](#gameplay)** ·
**[See how it was built](#ai-agent-assisted-development)** ·
**[Review the evidence](#validation-and-evidence)**

<p align="center">
  <img src="artifacts/captures/07-active-combat.png" width="960" alt="High-quality active combat capture showing the rifle, enemy soldier, tactical HUD, muzzle effects, and code-generated industrial district">
  <br><sub><b>High-quality capture:</b> active combat rendered in the high quality preset.</sub>
</p>

The Ash Exchange exterior and North Service condenser are Blender meshes. Seven
surface families use authored PBR maps. The remaining architecture, equipment,
characters, effects and audio are generated at runtime. The mesh and textures
ship with the build. [Material provenance](artifacts/material-provenance.md)

## At a glance

| | |
|---|---|
| **Genre** | Single-player browser tactical FPS |
| **Engine** | Three.js `0.180.0`, WebGL2, Web Audio |
| **World** | Authored Ash Market layout with deterministic procedural assembly and dressing |
| **Simulation** | Fixed `1 / 60 s` gameplay step with isolated seeded RNG streams |
| **Modes** | Relay Run, Endless Sweep, and Practice Range |
| **Armory** | Six weapons, three throwables, reserve ammunition, and in-game credits |
| **Assets** | Blender exterior mesh, authored PBR textures and procedural world assets |

## Gameplay

### Relay Run

Choose **Deploy** to restore the relays in Saffron Arcade, North Service and
Kiln House, then reach the marked Cross Street extraction post. The HUD shows
the next location, distance and a route hint. Hold **F** at each station until
the progress bar fills. Leaving the station, releasing the key, getting hit
or pausing cancels the current hold.

Restoring power opens the arcade service shutter, then the Kiln freight shutter,
and finally lights the Cross Street extraction beacon. Each relay also charges
a remote decoy. Press **G** when you want the last powered station to emit an
audible signal after a short delay. Up to two eligible patrols can investigate
its location while you move through a different route.

Follow the active station's paint and signs. Powered doors open alternate
paths at Saffron Arcade and Kiln House. The debrief shows how many relays
you restored, elapsed time, and credits earned. The main menu remembers
your fastest extraction and total clears on the current browser.
See [the operation review](artifacts/operation-review.md) for the current
route, practice, and extraction captures.

### Practice Range

Choose **Practice range** to try the six weapons and three utilities with no
enemies or equipment costs. Aim at the 6, 13, and 20 m plates. The range tracks
shots, hits, center hits, accuracy, and best streak. Press **B** anywhere in
the range to switch gear. Practice purchases and stats belong to that session.

### Endless Sweep

Choose **Endless Sweep** to clear every enemy before your health reaches zero.
Operation 1 starts with seven enemies. Clearing it unlocks the next operation
on the same district with newly seeded positions and the following quota:

```text
total hostiles = 7 × current operation
```

Up to 12 enemies are active at once; reinforcements fill open slots until the
operation quota is exhausted. New operations keep enemies outside a 42 m safety
radius around the player spawn, so the player is not detected and fired upon
immediately.

The highest cleared operation is stored in versioned browser `localStorage` and
appears on the start screen after the first victory. Persisted values are treated
as untrusted input, validated, bounded, and rendered with `textContent`.
Client-only storage is convenient rather than tamper-proof; authoritative
competitive progression would require a backend.

## Armory and credits

Open **Armory** on the main menu to outfit a Relay Run before deploying. Select
an item image to see its details and in-game model. Drag the model to rotate
it and use **+ / −** for a closer look. The separate purchase button shows the price
and availability. Press **B** at the deployment locker or at a powered relay
when nearby hostiles have been cleared. Each new run starts with **1,400 credits**. An elimination earns
125, a restored relay earns 250, and an operation clear earns 400. Credits and
owned weapons carry into the next Endless Sweep operation. A retry restores
the opening loadout for the current operation and resets rewards earned during
the attempt.

| Slot | Equipment | Purchase |
| --- | --- | ---: |
| Primary | CR-27 Vesper · balanced automatic rifle | Included |
| Primary | SR-9 Flicker · fast SMG with quicker handling | 430 |
| Primary | LR-4 Meridian · scoped sniper with a manual cycle | 800 |
| Secondary | P-12 Ember · quick semi-automatic sidearm | Included |
| Secondary | H-7 Cinder · slower, heavier sidearm | 300 |
| Melee | Arc Cutter · close-range swing without ammunition | Included |
| Throwable | Pulse Orb · nearby damage checked against cover | 230 |
| Throwable | Haze Orb · temporary hostile sight obstruction | 160 |
| Throwable | Stasis Orb · temporarily interrupts nearby hostiles | 200 |
| Supply | Reserve Case · refills reserves for owned firearms | 180 |

Switching weapons preserves the magazine and reserve of each firearm. Already
owned weapons can be re-equipped in an armory at no charge. Carry up to two of
each throwable and four total.

The shoulder view shows the current equipment on the player model. A scoped
weapon uses its optic while aiming, and the camera returns to the player's
eyes if cover obstructs the shoulder camera. Press **T** to draw and throw
the selected utility. A charge is spent when the orb leaves the hand.

## Feature highlights

- **Tactical enemy perception** — soldiers detect only within a 35° half-angle,
  38 m range, and unobstructed line of sight. Approaching from behind remains
  unseen until sound or repositioning exposes the player.
- **Humanized return fire** — first detection has a deterministic 2–4 second
  reaction window. Aim turns and tracks with inertia; angular spread, burst
  bloom, suppression, and player movement produce both hits and misses.
- **Projectile combat** — travel time, gravity, body zones, headshots,
  penetrable materials, shallow-angle metal ricochets, tracers, decals,
  surface-specific impacts, and directional damage feedback.
- **Advanced movement** — sprint, crouch, slide, jump, protected lean, slopes,
  and grounded low-step traversal. The capsule may step or mantle only up to
  0.44 m, preventing tall props and buildings from lifting the player onto roofs.
- **Reactive enemies** — four distinct uniforms, articulated foot placement,
  and hit reactions. Patrols investigate, pursue, use cover, reposition, and
  reload.
- **Code-generated presentation** — procedural architecture and props, a
  separate first-person viewmodel scene, pooled combat effects, post-processing,
  and Web Audio synthesis with HRTF positioning.

## Visual tour

<table>
  <tr>
    <td width="50%">
      <img src="artifacts/captures/01-wide-street.png" alt="A wide Ash Market street showing the generated industrial architecture, market stalls, signs, fog, and lighting">
      <br><sub><b>Ash Market:</b> authored layout, procedurally assembled façades and street dressing.</sub>
    </td>
    <td width="50%">
      <img src="artifacts/captures/02-facade-close.png" alt="Close view of a generated industrial façade with layered masonry, windows, signs, pipes, and market props">
      <br><sub><b>Generated architecture:</b> layered façades, materials, signage, props, and weathering.</sub>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <img width="70%" src="artifacts/captures/06-enemy.png" alt="Procedurally rigged enemy soldier carrying a rifle at tactical combat distance">
      <br><sub><b>Combat AI:</b> procedural soldier rig with perception, movement, aiming, damage, and death states.</sub>
    </td>
  </tr>
</table>

Seven reproducible 1440×810 captures are tracked in
[`artifacts/captures/`](artifacts/captures/). Their manifest records the seed,
quality preset, SHA-256 hashes, combat state, and browser diagnostics.

## Controls

Click **Deploy** or **Endless Sweep** to enable pointer-lock aiming and browser
audio. The start and pause menus save mouse speed, aim speed, reduced
camera sway, master volume, and graphics quality in the browser.

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
| `Space` | Jump; mantle a valid ledge up to 0.44 m |
| `Q` / `E` | Protected lean left / right |
| Hold `F` | Operate the active relay or extract |
| `G` | Queue the decoy at the last powered station |
| `B` | Open a secure armory locker |
| `V` | Toggle first-person and shoulder view |
| `I` | Inspect the equipped weapon |
| `1` / `2` / `3` | Primary / sidearm / melee |
| `4` / `5` / `6` | Select Pulse / Haze / Stasis |
| `T` | Throw the selected utility |
| `Esc` | Release pointer lock and pause |
| Menu buttons | Resume, restart, advance operation, or change quality |

## Quick start

Requirements:

- Node.js **22.23.4 or a later 22.x release**
- npm
- A desktop browser with JavaScript, WebGL2, pointer lock, keyboard, and mouse

```bash
git clone https://github.com/YiTaChen/fps_sol_one_shot.git
cd fps_sol_one_shot
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. Vite may select the next free port if 5173 is
already occupied.

For a reproducible high-quality run:

```text
http://127.0.0.1:5173/?seed=20364033&quality=high
```

Valid quality values are `low`, `medium`, and `high`.

### Production build

```bash
npm run build
npx vite preview
```

The ES2022 build is written to `dist/` and separates
Three.js into its own chunk.

## AI-agent-assisted development

The project was built in two directed development passes on **2026-07-28** and
**2026-07-29** with an OpenAI Codex coding agent. The author supplied the
creative brief, acceptance criteria, play-test feedback, and product decisions;
the agent implemented the systems, drove browser verification, generated
evidence, and committed each completed milestone to GitHub.

| Milestone | Scope delivered | Commit evidence |
|---|---|---|
| Engine foundation | Fixed-step loop, deterministic RNG streams, event bus, renderer, input, diagnostics | [`6d9273c`](https://github.com/YiTaChen/fps_sol_one_shot/commit/6d9273c) |
| Complete combat loop | Player controller, rifle, projectiles, enemies, world, UI, audio, victory and defeat | [`044cf73`](https://github.com/YiTaChen/fps_sol_one_shot/commit/044cf73) |
| Visual and combat polish | Architecture, weapon and soldier rigs, materials, effects, spatial feedback | [`e1714d6`](https://github.com/YiTaChen/fps_sol_one_shot/commit/e1714d6) |
| Quality hardening | Hero art, collision, browser checks, deterministic captures, performance and visual review | [`914fdc6`](https://github.com/YiTaChen/fps_sol_one_shot/commit/914fdc6), [`49ed58f`](https://github.com/YiTaChen/fps_sol_one_shot/commit/49ed58f) |
| Fair enemy combat | Directional vision, LOS, reaction delay, gradual tracking, spread, return fire, corpse lifecycle | [`1653804`](https://github.com/YiTaChen/fps_sol_one_shot/commit/1653804) |
| Safe traversal | Strict capsule collision, grounded low-step rules, tall-wall and jump bypass prevention | [`53606ba`](https://github.com/YiTaChen/fps_sol_one_shot/commit/53606ba) |
| Endless operations | Same-map enemy reseeding, safe spawns, `7 × operation` scaling, local highest record | [`eed7b24`](https://github.com/YiTaChen/fps_sol_one_shot/commit/eed7b24) |

The iteration loop mirrored the
[`3d-battle-documentaries`](https://github.com/YiTaChen/3d-battle-documentaries)
workflow: implement a visible milestone, exercise it in a real browser, inspect
screenshots and diagnostics, add deterministic regression coverage, then commit
and push before beginning the next stage. Git history records the milestones;
exact agent token totals and complete wall-clock time are not encoded in the
repository, so they are not estimated here.

The November 2026 update uses the public Claude Fable 5.2 demo Saltline as a
reference for lighting, composition, interaction feedback, and level pacing.
See the [comparison and implementation review](artifacts/saltline-comparison.md).
The Ash Exchange follow-up added an in-engine opening composition, powered
service shutters and a decoy the player can time. The Blender source script
for the two exterior assets is [build-exchange-asset.py](scripts/build-exchange-asset.py).

## Architecture

`Game` is the composition root and owns the state machine and subsystem
lifecycle:

```text
main.js
└── Game
    ├── core: fixed clock, named RNG streams, events, diagnostics
    ├── rendering: world scene, viewmodel scene, lights, post-processing
    ├── materials + world: generated maps, architecture, props, colliders
    ├── player + physics: capsule, slopes, jump, slide, mantle, lean
    ├── rifle + projectiles + pooled effects
    ├── enemy director + procedural soldier rigs
    ├── Web Audio synthesis
    └── DOM HUD, menus, progression, and result screens
```

Key engineering properties:

- Gameplay simulation runs at a deterministic fixed step and rendering is
  interpolated separately.
- World and first-person weapon render through separate scenes and cameras.
- Sibling systems communicate through a small synchronous event bus.
- Named RNG streams isolate world dressing, AI, weapon spread, effects, and
  audio variation.
- Restart reuses the renderer, AudioContext, DOM shell, and global listeners.
- Geometry, materials, and hot combat effects use shared resources and fixed
  pools.

The runtime catalogs 12 building specifications, 8 façade families, 4
enterable interiors, 34 architectural modules, 40 prop archetypes, and 19
material families. The full technical contract is in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## Quality presets

| Preset | Render scale | DPR cap | Shadow map | SSAO / bloom | Fog range |
|---|---:|---:|---:|---|---:|
| Low | 82% | 1.0 | 1024 | Off | 84 |
| Medium | 100% | 1.25 | 1536 | Bloom | 105 |
| High | 100% | 1.75 | 2048 | On, stronger bloom | 128 |

Effect pools also respond to quality changes. Procedural material textures are
128 px on Low and 256 px on Medium/High. The authored surfaces keep their
baked resolution across presets. Medium is the default for normal play.

## Validation and evidence

```bash
npm run build
npm test
npm run capture
npm run profile
```

| Evidence | Result |
|---|---|
| Production build | Vite build |
| Contract and browser suite | See the linked smoke report |
| Enemy AI contract | 35° cone boundary, 2–4 s reaction, aim lag, mixed spread hits/misses |
| Physics contract | 10 high-wall, low-step, ceiling, airborne, landing, and controller cases |
| Progression contract | Hostile storage input, monotonic records, deterministic operation seeds |
| Full gameplay loop | Relay progress, interruption, extraction, replay, plus sweep victory, scaling, and defeat |
| Input | Short-click buffering, same-step aim, pointer lock, movement, stance, and reload |
| Equipment | Store prices and limits, weapon feel, ammo retention, utility effects, and retry |
| Browser diagnostics | Zero console errors, page errors, failed requests, or HTTP errors |
| Capture set | 7 deterministic 1440×810 views with hashes and zero browser errors |

Evidence files:

- [`artifacts/tests/smoke-report.json`](artifacts/tests/smoke-report.json)
- [`artifacts/captures/manifest.json`](artifacts/captures/manifest.json)
- [`artifacts/performance/moving-combat.json`](artifacts/performance/moving-combat.json)
- [`artifacts/visual-review.md`](artifacts/visual-review.md)

The July moving-combat profile records the original SwiftShader run.
See the comparison report for the hardware-GPU measurement conditions and
the current build results.

### Reproducing selected evidence

```bash
FPS_CAPTURE_VIEWS=wide-street,active-combat npm run capture
FPS_BASE_URL=http://127.0.0.1:5173 npm test
FPS_BROWSER_GPU=hardware npm test
```

`FPS_CAPTURE_SEED`, `FPS_CAPTURE_DIR`, and the same `FPS_BASE_URL` override are
supported by the capture and profile scripts.

<details>
<summary><strong>Scope and known limitations</strong></summary>

- Desktop WebGL2 and pointer-lock controls are required; touch, gamepad, and
  accessibility-specific input modes are not implemented.
- The game is single-player and takes place in Ash Market. Both modes share
  the map and armory.
- Highest-operation persistence stores no sensitive data and is not tamper-proof
  against DevTools, extensions, or local browser-profile modification.
- Browser audio starts only after a user gesture.
- Live quality switching does not regenerate procedural material textures.
- The July [visual review](artifacts/visual-review.md) documents the original
  prototype. The November comparison covers the current art and its remaining gaps.
- Capture hashes document generated outputs; they are not pixel-diff regression
  tests.
- Vite assumes root-path hosting. Subpath deployment requires an appropriate
  `base` setting.
- See [LICENSE](LICENSE) for license terms.

</details>
