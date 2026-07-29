# Final visual review

This review covers the seven 1440×810 captures recorded in
`artifacts/captures/manifest.json` (`mode: full`, deterministic seed
`0x0c1de71e`). Scores are based on rendered pixels, not source-code intent.

## Verdict

The final pass is visually coherent and clearly playable. The profiled rifle,
round optic, dressed market frontage, stocked interior, shaped enemy equipment,
combat effects, and HUD are all visible improvements over the initial blockout.

It does **not** meet the prompt's strict visual acceptance rule requiring every
category to score at least 4/5. No category in the final captures supports a
strict 4. The result remains closer to a stylized procedural prototype than a
professional military-FPS art target. Functional acceptance and visual
acceptance are therefore reported separately.

## Pixel-only scores

| Capture | Composition / depth | Geometry | Materials | Lighting | Scale / construction | Weapon / character | Density | No placeholder art | Professional |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 01 wide street | 3 | 3 | 3 | 3 | 2 | 2 | 3 | 1 | 2 |
| 02 façade close | 3 | 3 | 3 | 3 | 3 | N/A | 3 | 2 | 3 |
| 03 interior | 3 | 3 | 3 | 3 | 2 | N/A | 3 | 1 | 2 |
| 04 hip weapon | 3 | 3 | 3 | 3 | 2 | 2 | 3 | 1 | 2 |
| 05 ADS weapon | 3 | 3 | 3 | 3 | 2 | 2 | 3 | 1 | 2 |
| 06 enemy | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 1 | 3 |
| 07 active combat | 2 | 3 | 3 | 2 | 3 | 3 | 2 | 1 | 2 |

## Evidence by capture

### 01 — Wide street

Scalloped awnings, framed openings, roof equipment, stalls, produce, barriers,
cones, a bench, and multiple depth layers are visible. The street is no longer
categorically empty. Large rectangular building masses, primitive prop
silhouettes, hard edges, stretched asphalt grain, and a segmented mannequin-like
soldier remain visible.

Automatic fails: box-like building shells; large uniform surfaces; unmodified
primitive props; weak hard-edge highlight response; mannequin-like enemy.

### 02 — Façade close

This is the strongest environment capture. The awning, headers, sills, frames,
vertical members, roof equipment, recessed storefront, and visible dressed
interior read clearly. A broad planar plaster field, mechanically sharp trim,
and primitive produce/container silhouettes remain.

Automatic fails: unmodified primitive props; close hard-surface edges; large
repetitive surface treatment.

### 03 — Interior

The shop is recognizable and enterable, with ceiling structure, suspended
lights, shelves, a work surface, shaped bottles, baskets, produce, and stocked
depth. Several bottles and fruit appear unsupported along the left wall/floor
area. The tiled foreground and right wall are repetitive, and many goods retain
sphere/cylinder silhouettes.

Automatic fails: unmodified primitive props; close hard-surface edges; large
repetitive surfaces. Additional placement failure: visibly floating goods.

### 04 — Hip-fire weapon

The circular optic, stepped mount, receiver silhouette, rail, surface
separation, and hip offset are readable. The optic/mount/receiver still read as
stacked simplified solids; the support hand reads as a mitten-like mass, its
contact is unclear, and the forearm remains an oversized taper.

Automatic fails: weapon still substantially reads as boxes/cylinders;
block-like hand contact; primitive environment props; close hard-surface edges.

### 05 — ADS weapon

The optic axis is precise and the circular sight is a clear improvement. The
reduced sleeve preserves the sight picture. At full-screen scale, controls,
seams, fasteners, magazine interface, and layered receiver construction remain
insufficiently readable; the broad lower weapon/forearm surface is featureless.

Automatic fails: simplified weapon construction; primitive environment props;
close hard-surface edges.

### 06 — Enemy

The shaped helmet, visor, layered pouches, aiming pose, spread stance, boots,
and horizontally shouldered rifle are substantial improvements. The neck,
tubular arms, torso/pelvis transitions, segmented legs, indistinct hands, and
two-hand contact still read as a procedural mannequin. A large box-like
background building remains.

Automatic fails: mannequin-like enemy; primitive environment props; close
hard-surface edges; decorated rectangular background shell.

### 07 — Active combat

The capture visibly contains an enemy and environment, impact starburst,
multiple tracers, an ejected shell, directional damage wedge, health/objective
HUD, and ammunition state. The manifest independently records a real projectile
hit (`100 → 24.4` target health), player damage, one consumed round, particles,
tracers, decals, and a shell.

The dark near-field canopy consumes much of the upper-right frame, weakens
material/depth separation, and leaves the target street underdressed. Weapon,
hand, enemy, buildings, and props retain the simplified defects above.

Automatic fails: simplified weapon; block-like hand; mannequin-like enemy;
box-like buildings; primitive props; hard edges; poor separation beneath the
canopy; underdressed combat composition.

## Acceptance summary

- Functional/gameplay validation: passed.
- Deterministic seven-view capture and browser diagnostics: passed.
- Real ballistic combat evidence: passed.
- Prompt-level visual requirement (all categories ≥4/5): **failed**.
