# Cinderline: One Shot — Architecture Contract

This contract governs the implementation of the original browser tactical FPS
**Cinderline: One Shot**. It is intentionally written before parallel subsystem
work begins and remains the integration authority for the project.

## Product and Coordinate Contract

- Runtime: client-only Vite application using Three.js `0.180.x` and WebGL2.
- Units: one Three.js world unit equals one metre.
- Axes: `+Y` is up, `-Z` is the authored forward direction, X/Z form the ground
  plane, and positive yaw rotates left.
- Level bounds: approximately `[-50, 50]` on X and Z. Playable height is
  `0–16 m`; the kill plane is `-12 m`.
- Angles are radians, time is seconds, velocity is metres/second.
- Gameplay data is deterministic for a given seed. `Math.random()` is forbidden
  in `src/`; all variation comes from named streams owned by `RngService`.

## Dependency Direction

Imports point down this list and never upward:

1. `core/` — engine clock, RNG, events, lifecycle, constants, diagnostics
2. `physics/` — spatial queries and collision data; depends only on core
3. `materials/` — generated texture/material factories; depends only on core
4. `world/` — environment construction; depends on core, physics, materials
5. `rendering/` — renderer, cameras, lighting, sky, quality; depends on core
6. `player/`, `weapons/`, `effects/`, `enemies/`, `audio/`, `ui/` — feature
   subsystems; may depend on layers 1–5, but never on sibling feature internals
7. `game/` — composition root and state machine; the only layer allowed to
   coordinate all subsystems
8. `main.js` — creates and starts one `Game`, with no gameplay logic

Sibling communication uses the event bus or the public interfaces below. No
feature subsystem may import `game/Game.js`. Circular imports are a build failure.

## Central Context

`GameContext` is created by the composition root and passed into subsystem
constructors. Its stable shape is:

```js
{
  scene, viewScene, camera, viewCamera, renderer,
  events, rng, clock, input, quality, physics, assets,
  state, diagnostics
}
```

Subsystems retain only the fields they need. They do not add arbitrary fields.
Game-owned mutable state is exposed as a small `state` record: `phase`, `level`,
`baseEnemyCount`, `highestClearedLevel`, `kills`, `requiredKills`, `elapsed`,
`baseSeed`, `seed`, and read-only references to player/weapon snapshots.

## Public Subsystem Interfaces

Every subsystem may implement:

```js
init(context)        // allocate and attach; called once
reset(seed)          // restore deterministic match state without listener leaks
fixedUpdate(dt)      // gameplay at the fixed step
update(dt, alpha)    // render interpolation and presentation
dispose()            // remove listeners and dispose owned resources
```

Additional stable feature contracts:

- `PhysicsWorld.addStatic(collider)`, `moveCapsule(position, delta, capsule)`,
  `raycast(origin, direction, maxDistance, mask)`, `lineOfSight(a, b)`,
  `queryCover(origin, radius)`.
- `WorldBuilder.build(context) -> { root, spawn, enemySpawns, colliders,
  coverPoints, materialAt(point), capturePoses }`.
- `PlayerController.snapshot`, `applyDamage(amount, direction, source)`,
  `teleport(position, yaw)`, `setEnabled(boolean)`.
- `Rifle.snapshot`, `triggerDown()`, `triggerUp()`, `setADS(boolean)`,
  `requestReload()`, `rayOrigin`, `rayDirection`.
- `EnemyDirector.enemies`, `livingCount`, `snapshot`,
  `reset(seed, { totalCount, activeLimit, playerSpawn, safeRadius })`,
  `applyProjectileHit(hit)`, `forceAlert(position)`.
- `Effects.spawnImpact(hit)`, `spawnMuzzle(data)`, `spawnTracer(a, b, kind)`,
  `reset()`.
- `AudioSystem.resume()`, `play(name, options)`, `setListener(transform)`.
- `UI.setScreen(name, data)`, `render(snapshot)`, `announce(text, tone)`.

## Event Vocabulary

Events are plain immutable payloads. Public names:

- Lifecycle: `game:start`, `game:pause`, `game:resume`, `game:restart`,
  `game:next-level`, `game:victory`, `game:defeat`, `quality:change`.
- Player: `player:move-state`, `player:land`, `player:jump`, `player:damage`,
  `player:death`, `player:mantle`.
- Weapon: `weapon:fire`, `weapon:dry`, `weapon:reload-start`,
  `weapon:reload-phase`, `weapon:reload-complete`, `weapon:ads`.
- Combat: `projectile:spawn`, `projectile:impact`, `enemy:alert`,
  `enemy:damage`, `enemy:death`, `combat:hitmarker`, `combat:kill`.
- UI/audio: `ui:announce`, `audio:play`.

Payload coordinates are cloned by the publisher or treated as read-only for the
duration of synchronous dispatch. Events never request return values.

## Initialization and Disposal Order

Initialization:

1. events, diagnostics, RNG, fixed clock
2. renderer/scenes/cameras and quality
3. procedural materials/assets
4. physics and world
5. input
6. player
7. weapon and effects
8. enemies
9. audio
10. UI
11. game-state listeners and loop

Disposal is exactly the reverse order. Restart calls `reset(seed)` and does not
recreate the renderer, DOM shell, global input listeners, or AudioContext.

## Simulation and Rendering

- Fixed simulation step: `1 / 60 s`.
- Maximum accumulated time: `0.25 s`; maximum fixed steps per render: 8.
- Render uses `alpha = accumulator / fixedStep` for presentation interpolation.
- Ballistics, player collision, AI decisions, damage, and timers run only in
  `fixedUpdate`. Terminal victory/defeat simulation advances corpse timers but
  not living actors.
- Camera/viewmodel sway and particle interpolation run in `update`.
- When paused or pointer lock is lost during play, the accumulator is cleared and
  input state reset. The menu can animate, but gameplay simulation is frozen.
- Hot paths reuse module-scope or instance-owned vectors, matrices, raycasters,
  arrays, and particle slots. No geometry/material/texture creation per frame.

## Deterministic RNG Ownership

`RngService` hashes the match seed plus a stream name and returns an independent
`Rng` (xorshift32) stream. Required streams:

- `world-layout`, `world-dressing`, `materials`
- `enemy-spawn`, `enemy-ai:<id>`, `enemy-visual:<id>`
- `weapon-spread`, `effects`, `audio-variation`
- `capture`

Restart recreates streams from the current operation seed. Advancing derives a
new deterministic operation seed from `baseSeed` while retaining the same
immutable world. Visual-only consumption cannot change gameplay outcomes because
streams are isolated.

## Rendering Contract

- World and viewmodel use separate scenes; world renders first, depth clears,
  then the viewmodel renders with its own camera to prevent wall clipping.
- Renderer uses sRGB output, ACES filmic tone mapping, capped pixel ratio, and
  stable exposure. Shadow/map size and render scale come from quality presets.
- The world owns authored daylight, fog, horizon/sky, baked-style fill cards, and
  contact-shadow meshes. Rendering owns renderer configuration and resize.
- Materials use runtime-generated Canvas/typed-array textures only. No network or
  static raster assets.
- Geometry that is user-visible at normal distance must be an assembled,
  bevelled/profiled asset with macro, meso, and micro detail. Raw primitives are
  only substrates, tiny components, invisible colliders, or distant LOD.

## Quality and Performance Budgets

Medium preset at 1280×720 internal resolution:

- target median ≥45 FPS on a modern laptop after warm-up
- ≤450 draw calls in the densest deterministic capture
- ≤1.2M visible triangles; ≤180 material programs
- world shadow casters limited to authored hero geometry and actors
- ≤96 active particles, 32 tracers, 48 impact decals, 24 shells
- up to 12 simultaneously active enemies, with total operation quota equal to
  `7 × level` and reinforcements filling vacated active slots
- textures default to 256²/512² generated maps and share families
- device pixel ratio cap: low `1.0`, medium `1.25`, high `1.75`
- no recurring >100 ms frame after shader warm-up

Low/medium/high may adjust shadows, DPR, AO-like contact detail, particles, and
view distance, but not remove gameplay or required authored silhouettes.

## Ownership During Initial Parallel Work

- **Lead/integration owner:** root files, `src/core/`, `src/rendering/`,
  `src/physics/`, `src/game/`, `src/main.js`, global integration and final QA.
- **World/material owner:** `src/materials/`, `src/world/` only.
- **Player/weapon/effects owner:** `src/player/`, `src/weapons/`,
  `src/effects/` only.
- **Enemy/UI/audio/tooling owner:** `src/enemies/`, `src/ui/`, `src/audio/`,
  `tests/`, `scripts/` only.

Agents must not edit another owner’s files. Root package/config files remain lead
owned. If a contract is insufficient, an agent reports the needed assumption
instead of changing a foreign subsystem.

## Integration and Validation Responsibilities

The lead alone integrates subsystem outputs and owns:

- complete combat-loop validation
- pointer-lock, focus, resize, restart, victory and defeat regression
- deterministic capture review and scoring
- renderer/material/lighting coherence and all sequential art passes
- actual moving-combat profiling
- final `npm run build`, `npm run test`, and `npm run capture`
- disposal/listener/restart checks and console/page-error collection

Subsystem agents must provide build/static-test evidence for their owned files,
enumerate assumptions, and flag remaining integration work. Their success claims
are provisional until the lead executes the integrated game.
