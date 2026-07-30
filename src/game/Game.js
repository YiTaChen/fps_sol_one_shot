import * as THREE from "three";
import {
  Diagnostics,
  EventBus,
  FixedClock,
  InputManager,
  RngService,
} from "../core/index.js";
import { AudioSystem } from "../audio/AudioSystem.js";
import { Effects } from "../effects/Effects.js";
import {
  ENEMY_INITIAL_SAFE_RADIUS,
  EnemyDirector,
  EnemyState,
} from "../enemies/EnemyDirector.js";
import { MaterialLibrary } from "../materials/MaterialLibrary.js";
import { PhysicsWorld } from "../physics/PhysicsWorld.js";
import { PlayerController } from "../player/PlayerController.js";
import { RendererSystem } from "../rendering/RendererSystem.js";
import { UI } from "../ui/UI.js";
import { Rifle } from "../weapons/Rifle.js";
import { WorldBuilder } from "../world/WorldBuilder.js";
import {
  deriveLevelSeed,
  readHighestClearedLevel,
  writeHighestClearedLevel,
} from "./Progression.js";

const FIXED_STEP = 1 / 60;
const BASE_ENEMY_COUNT = 7;
const ACTIVE_ENEMY_LIMIT = 12;
const _damageDirection = new THREE.Vector3(0, 0, 1);
const _capturePosition = new THREE.Vector3();
const _captureTarget = new THREE.Vector3();
const _captureDirection = new THREE.Vector3();
const _captureQuaternion = new THREE.Quaternion();

const FALLBACK_CAPTURE_POSES = Object.freeze({
  "wide-street": {
    position: [34, 6.4, 42],
    target: [-8, 3.2, -17],
    fov: 68,
  },
  "facade-close": {
    position: [-14.5, 2.6, 14],
    target: [-23, 3.1, 5],
    fov: 62,
  },
  interior: {
    position: [9.2, 1.72, -3.5],
    target: [13.4, 1.65, -11],
    fov: 67,
  },
  "weapon-hip": {
    position: [0, 1.66, 31],
    target: [0, 1.6, 5],
    fov: 72,
  },
  "weapon-ads": {
    position: [0, 1.66, 31],
    target: [0, 1.6, 5],
    fov: 66,
  },
  enemy: {
    position: [13, 2.35, -8],
    target: [8, 1.25, -16],
    fov: 58,
  },
  "active-combat": {
    position: [0, 1.66, 29],
    target: [0, 1.55, -6],
    fov: 72,
  },
});

const WORLD_CAPTURE_KEYS = Object.freeze({
  "wide-street": "wideStreet",
  "facade-close": "closeFacade",
  interior: "enterableInterior",
  "weapon-hip": "hipFire",
  "weapon-ads": "ads",
  enemy: "enemy",
  "active-combat": "activeCombat",
});

function toVector(value, target) {
  if (!value) return null;
  if (value.isVector3) return target.copy(value);
  if (Array.isArray(value)) {
    return target.set(
      Number(value[0]) || 0,
      Number(value[1]) || 0,
      Number(value[2]) || 0,
    );
  }
  if (
    Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z)
  ) {
    return target.set(value.x, value.y, value.z);
  }
  return null;
}

function vectorSnapshot(value) {
  return {
    x: Number(value?.x) || 0,
    y: Number(value?.y) || 0,
    z: Number(value?.z) || 0,
  };
}

function percentile(samples, fraction) {
  if (!samples.length) return 0;
  const values = [...samples].sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor(values.length * fraction))];
}

export class Game {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.events = new EventBus();
    this.baseSeed = Number(options.seed ?? 0x0c1de71e) >>> 0;
    this.rng = new RngService(this.baseSeed);
    this.clock = new FixedClock(FIXED_STEP);
    this.diagnostics = new Diagnostics();
    this.physics = new PhysicsWorld();
    this.rendering = new RendererSystem(
      container,
      options.quality || "high",
    );
    this.state = {
      phase: "menu",
      level: 1,
      baseEnemyCount: BASE_ENEMY_COUNT,
      highestClearedLevel: readHighestClearedLevel(),
      kills: 0,
      requiredKills: BASE_ENEMY_COUNT,
      elapsed: 0,
      seed: this.baseSeed,
      baseSeed: this.baseSeed,
      quality: this.rendering.quality.name,
    };
    this.context = {
      scene: this.rendering.scene,
      viewScene: this.rendering.viewScene,
      camera: this.rendering.camera,
      viewCamera: this.rendering.viewCamera,
      renderer: this.rendering.renderer,
      events: this.events,
      rng: this.rng,
      clock: this.clock,
      input: null,
      quality: this.rendering.quality,
      physics: this.physics,
      assets: {},
      state: this.state,
      diagnostics: this.diagnostics,
    };

    this.running = false;
    this.ready = false;
    this.manualSimulation = Boolean(options.test);
    this.performanceRunning = false;
    this.raf = 0;
    this.abort = new AbortController();
    this.unsubscribers = [];
    this.captureOverride = null;
    this.captureTargetId = null;
    this.captureMode = options.captureMode || null;
    this.performanceSamples = [];

    this.materials = MaterialLibrary.fromContext(this.context, {
      textureSize: this.rendering.quality.name === "low" ? 128 : 256,
    });
    this.context.assets.materials = this.materials;
    this.context.assets.materialLibrary = this.materials;

    this.worldBuilder = new WorldBuilder({
      materials: this.materials,
      physics: this.physics,
    });
    this.world = this.worldBuilder.build(this.context);
    this.context.assets.world = this.world;
    if (this.world?.root && !this.world.root.parent) {
      this.rendering.worldRoot.add(this.world.root);
    }

    this.input = new InputManager(
      this.rendering.renderer.domElement,
      this.events,
    );
    this.context.input = this.input;

    this.player = new PlayerController(this.context);
    const spawn = this.world?.spawn?.position
      ?? this.world?.spawn
      ?? this.world?.playerSpawn?.position
      ?? this.world?.playerSpawn;
    if (toVector(spawn, _capturePosition)) {
      this.player.setSpawn(
        _capturePosition,
        Number(this.world?.spawn?.yaw ?? this.world?.playerSpawn?.yaw ?? 0),
      );
    }
    this.state.player = this.player.snapshot;
    this.state.playerSnapshot = this.player.snapshot;

    this.rifle = new Rifle(this.context);
    this.state.weapon = this.rifle.snapshot;
    this.state.weaponSnapshot = this.rifle.snapshot;
    this.player.setEnabled(false);
    this.rifle.setEnabled(false);
    this.input.enabled = false;

    this.effects = new Effects(this.context, {
      particleBudget: this.rendering.quality.particles,
      decalBudget: this.rendering.quality.decals,
    });

    this.enemies = new EnemyDirector({
      world: this.world,
      player: this.player,
      count: BASE_ENEMY_COUNT,
      activeLimit: ACTIVE_ENEMY_LIMIT,
      safeRadius: ENEMY_INITIAL_SAFE_RADIUS,
    });
    this.enemies.init(this.context);
    this.state.requiredKills = BASE_ENEMY_COUNT;

    this.audio = new AudioSystem();
    this.audio.init(this.context);
    this.ui = new UI({
      container: document.body,
      quality: this.rendering.quality.name,
    });
    this.ui.init(this.context);

    this.installLifecycle();
    this.rendering.prewarm();
    this.ready = true;
    this.exposeTestInterface();
    if (this.captureMode) this.setCapturePose(this.captureMode);
  }

  installLifecycle() {
    const signal = this.abort.signal;
    window.addEventListener("resize", () => {
      const size = this.rendering.resize();
      this.events.emit("render:resize", size);
    }, { signal });
    window.addEventListener("blur", () => {
      if (this.state.phase === "playing" && !this.options.capture) {
        this.events.emit("game:pause", { source: "focus-loss" });
      }
    }, { signal });
    window.addEventListener("error", (event) => {
      this.diagnostics.recordError(event.error || event.message);
    }, { signal });
    window.addEventListener("unhandledrejection", (event) => {
      this.diagnostics.recordError(event.reason);
    }, { signal });

    this.unsubscribers.push(
      this.events.on("game:start", () => this.activateMatch()),
      this.events.on("game:pause", () => this.applyPause()),
      this.events.on("game:resume", () => this.applyResume()),
      this.events.on("game:restart", () => this.applyRestart()),
      this.events.on("game:next-level", () => this.advanceLevel()),
      this.events.on("quality:change", (event) =>
        this.applyQuality(event?.name ?? event?.preset ?? event)),
      this.events.on("input:pointer-lock", ({ locked }) => {
        if (!locked && this.state.phase === "playing" && !this.options.capture) {
          this.events.emit("game:pause", { source: "pointer-lock-loss" });
        }
      }),
      this.events.on("enemy:death", (event) => this.onEnemyDeath(event)),
      this.events.on("player:death", (event) => this.onPlayerDeath(event)),
    );
  }

  activateMatch() {
    if (this.state.phase === "playing") return;
    if (this.state.phase === "victory" || this.state.phase === "defeat") {
      this.applyRestart();
      return;
    }
    this.state.phase = "playing";
    this.captureOverride = null;
    this.player.setEnabled(true);
    this.rifle.setEnabled(true);
    this.input.enabled = true;
    this.clock.clearAccumulator();
    this.audio.resume();
    if (!this.options.capture && !this.manualSimulation) {
      this.input.requestPointerLock().catch(() => {});
    }
  }

  applyPause() {
    if (this.state.phase !== "playing") return;
    this.state.phase = "paused";
    this.player.setEnabled(false);
    this.rifle.setEnabled(false);
    this.input.enabled = false;
    this.input.reset();
    this.clock.clearAccumulator();
    if (!this.options.capture) this.input.exitPointerLock();
  }

  applyResume() {
    if (this.state.phase !== "paused") return;
    this.state.phase = "playing";
    this.player.setEnabled(true);
    this.rifle.setEnabled(true);
    this.input.enabled = true;
    this.clock.clearAccumulator();
    this.audio.resume();
    if (!this.options.capture && !this.manualSimulation) {
      this.input.requestPointerLock().catch(() => {});
    }
  }

  applyRestart() {
    this._resetRound();
  }

  advanceLevel() {
    if (this.state.phase !== "victory") return false;
    this.state.level += 1;
    this.state.seed = deriveLevelSeed(this.baseSeed, this.state.level);
    this.state.requiredKills = this._enemyCountForLevel(this.state.level);
    this._resetRound();
    return true;
  }

  _enemyCountForLevel(level = this.state.level) {
    return Math.max(
      BASE_ENEMY_COUNT,
      Math.min(
        Number.MAX_SAFE_INTEGER,
        BASE_ENEMY_COUNT * Math.max(1, Math.floor(level)),
      ),
    );
  }

  _resetRound() {
    this.state.phase = "playing";
    this.state.kills = 0;
    this.state.elapsed = 0;
    this.state.requiredKills = this._enemyCountForLevel();
    this.rng.reset(this.state.seed);
    this.input.reset();
    this.player.reset(this.state.seed);
    this.rifle.reset(this.state.seed);
    this.effects.reset(this.state.seed);
    this.enemies.reset(this.state.seed, {
      totalCount: this.state.requiredKills,
      activeLimit: ACTIVE_ENEMY_LIMIT,
      playerSpawn: this.player.spawnPosition,
      safeRadius: ENEMY_INITIAL_SAFE_RADIUS,
    });
    this.player.setEnabled(true);
    this.rifle.setEnabled(true);
    this.input.enabled = true;
    this.captureOverride = null;
    this.captureTargetId = null;
    this.clock.clearAccumulator();
    if (!this.options.capture && !this.manualSimulation) {
      this.input.requestPointerLock().catch(() => {});
    }
  }

  applyQuality(name) {
    if (!["low", "medium", "high"].includes(name)) return;
    this.context.quality = this.rendering.applyQuality(name);
    this.state.quality = this.context.quality.name;
  }

  onEnemyDeath() {
    if (this.state.phase !== "playing") return;
    this.state.kills += 1;
    if (this.state.kills >= this.state.requiredKills) {
      this.finishMatch("victory");
    }
  }

  onPlayerDeath() {
    if (this.state.phase === "playing") this.finishMatch("defeat");
  }

  finishMatch(result) {
    this.state.phase = result;
    if (result === "victory") {
      const persisted = writeHighestClearedLevel(this.state.level);
      this.state.highestClearedLevel = Math.max(
        this.state.highestClearedLevel,
        persisted,
        this.state.level,
      );
    }
    this.player.setEnabled(false);
    this.rifle.setEnabled(false);
    this.input.enabled = false;
    this.input.reset();
    this.input.exitPointerLock();
    this.events.emit(`game:${result}`, {
      kills: this.state.kills,
      elapsed: this.state.elapsed,
      level: this.state.level,
      highestClearedLevel: this.state.highestClearedLevel,
      requiredKills: this.state.requiredKills,
    });
  }

  fixedUpdate(dt) {
    if (this.state.phase !== "playing") {
      if (this.state.phase === "victory" || this.state.phase === "defeat") {
        this.enemies.fixedUpdate(dt);
      }
      return;
    }
    this.state.elapsed += dt;
    this.player.fixedUpdate(dt);
    this.rifle.fixedUpdate(dt);
    this.enemies.fixedUpdate(dt);
    this.effects.fixedUpdate(dt);
  }

  update(dt, alpha = 1) {
    this.player.update(dt, alpha);
    this.rifle.update(dt, alpha);
    this.enemies.update(dt, alpha);
    this.effects.update(dt, alpha);
    this.audio.setListener(this.rendering.camera);
    if (this.captureOverride) this.applyCaptureCamera();
    this.ui.render({
      dt,
      player: this.player.snapshot,
      weapon: this.rifle.snapshot,
      effects: this.effects.snapshot,
      enemies: this.enemies.snapshot,
      state: this.state,
    });
    this.rendering.render();
    this.diagnostics.recordFrame(dt);
    this.diagnostics.rendererInfo = {
      memory: { ...this.rendering.renderer.info.memory },
      render: { ...this.rendering.renderer.info.render },
    };
    this.diagnostics.set("listeners", this.events.listenerCount());
    this.diagnostics.set("enemies", this.enemies.livingCount);
    this.diagnostics.set("particles", this.effects.snapshot.activeParticles);
    this.input.endFrame();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.reset();
    const loop = (timestamp) => {
      if (!this.running) return;
      if (!this.manualSimulation) {
        const frame = this.clock.tick(
          timestamp * 0.001,
          (dt) => this.fixedUpdate(dt),
        );
        this.update(frame.frame, frame.alpha);
      } else if (!this.performanceRunning) {
        this.rendering.render();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  async manualStep(frames = 1) {
    const count = THREE.MathUtils.clamp(Math.floor(frames), 0, 3600);
    for (let i = 0; i < count; i += 1) this.fixedUpdate(FIXED_STEP);
    // Fixed simulation can be advanced in one deterministic batch, but
    // presentation dampers must still receive the elapsed wall-clock span.
    // Cap it to avoid feeding multi-second deltas into camera/effect easing.
    const presentationDelta = THREE.MathUtils.clamp(
      count * FIXED_STEP,
      FIXED_STEP,
      0.25,
    );
    this.update(presentationDelta, 1);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return this.snapshot();
  }

  async fireTest(count = 1) {
    const shots = THREE.MathUtils.clamp(Math.floor(count), 1, 40);
    const startingShot = this.rifle.shotIndex;
    this.rifle.triggerDown();
    let guard = 0;
    while (this.rifle.shotIndex - startingShot < shots && guard < shots * 12) {
      this.fixedUpdate(FIXED_STEP);
      guard += 1;
    }
    this.rifle.triggerUp();
    this.update(FIXED_STEP, 1);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return this.rifle.snapshot;
  }

  async runPerformance(frameCount = 600, options = {}) {
    const frames = THREE.MathUtils.clamp(Math.floor(frameCount), 60, 1200);
    if (options.quality) this.applyQuality(options.quality);
    if (
      Array.isArray(options.resolution)
      && Number.isFinite(options.resolution[0])
      && Number.isFinite(options.resolution[1])
    ) {
      this.rendering.resize(options.resolution[0], options.resolution[1]);
    }
    const samples = [];
    const movementStart = this.player.position.clone();
    const previousPosition = this.player.position.clone();
    const startingAmmo = this.rifle.magazine + this.rifle.reserve;
    const healthFloor = Number(options.healthFloor);
    const previousDamageFloor = this.player.damageFloor;
    let movementDistance = 0;
    let reloads = 0;
    let previous = performance.now();
    this.performanceRunning = true;
    if (Number.isFinite(healthFloor)) this.player.damageFloor = healthFloor;
    try {
      for (let i = 0; i < frames; i += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const now = performance.now();
        samples.push(now - previous);
        previous = now;
        if (options.movement) {
          const phase = i % 240;
          this.input.setSynthetic({
            KeyW: phase < 160,
            KeyD: phase >= 160,
            ShiftLeft: phase < 80,
            fire: Boolean(options.combat && i % 7 < 2),
          });
        }
        if (
          options.combat
          && !this.rifle.reloading
          && this.rifle.magazine <= 0
          && this.rifle.reserve > 0
          && this.rifle.requestReload()
        ) {
          reloads += 1;
        }
        this.fixedUpdate(FIXED_STEP);
        this.update(FIXED_STEP, 1);
        movementDistance += this.player.position.distanceTo(previousPosition);
        previousPosition.copy(this.player.position);
      }
    } finally {
      this.input.clearSynthetic();
      this.performanceRunning = false;
      this.player.damageFloor = previousDamageFloor;
    }
    this.performanceSamples = samples;
    const medianFrameMs = percentile(samples, 0.5);
    const p95FrameMs = percentile(samples, 0.95);
    const endingAmmo = this.rifle.magazine + this.rifle.reserve;
    return {
      frames,
      frameTimes: [...samples],
      medianFrameMs,
      p95FrameMs,
      medianFps: medianFrameMs > 0 ? 1000 / medianFrameMs : 0,
      movementDistance,
      displacement: this.player.position.distanceTo(movementStart),
      shotsFired: Math.max(0, startingAmmo - endingAmmo),
      reloads,
      healthFloor: Number.isFinite(Number(options.healthFloor))
        ? Number(options.healthFloor)
        : null,
    };
  }

  getCapturePose(name) {
    const poses = this.world?.capturePoses;
    if (poses instanceof Map && poses.has(name)) return poses.get(name);
    if (poses?.[name]) return poses[name];
    const worldKey = WORLD_CAPTURE_KEYS[name];
    if (worldKey && poses?.[worldKey]) return poses[worldKey];
    return FALLBACK_CAPTURE_POSES[name] || FALLBACK_CAPTURE_POSES["wide-street"];
  }

  setCapturePose(name) {
    this.captureMode = name;
    this.captureTargetId = null;
    const pose = this.getCapturePose(name);
    this.captureOverride = {
      position: toVector(pose.position ?? pose.camera, _capturePosition)?.clone()
        ?? new THREE.Vector3(...FALLBACK_CAPTURE_POSES["wide-street"].position),
      target: toVector(pose.target ?? pose.lookAt, _captureTarget)?.clone()
        ?? new THREE.Vector3(...FALLBACK_CAPTURE_POSES["wide-street"].target),
      fov: Number(pose.fov) || 68,
    };

    const isActive = name === "active-combat";
    const isWeapon = name === "weapon-hip" || name === "weapon-ads";
    this.state.phase = isActive ? "playing" : "capture";
    this.player.setEnabled(isActive);
    this.rifle.setEnabled(isActive || isWeapon);
    const wantsADS = name === "weapon-ads";
    this.rifle.setADS(wantsADS);
    for (const enemy of this.enemies.enemies) {
      enemy.rig.root.visible = !isWeapon;
    }
    if (isWeapon) {
      this.rifle.ads = wantsADS ? 1 : 0;
      for (let frame = 0; frame < 72; frame += 1) {
        this.rifle.update(FIXED_STEP, 1);
      }
    }

    if (isActive) {
      this.captureOverride = null;
      const playerPose = pose.player ?? pose;
      const feet = toVector(playerPose.playerPosition, _capturePosition)
        ?? toVector(pose.position, _capturePosition);
      if (feet) {
        _capturePosition.y = Number(playerPose.groundY ?? 0.04);
        const target = toVector(pose.target, _captureTarget);
        const directionX = target ? target.x - _capturePosition.x : 0;
        const directionZ = target ? target.z - _capturePosition.z : -1;
        const authoredYaw = Number(playerPose.yaw ?? pose.yaw);
        const yaw = Number.isFinite(authoredYaw)
          ? authoredYaw
          : Math.atan2(-directionX, -directionZ);
        this.player.teleport(
          _capturePosition,
          yaw,
        );

        const heroEnemy = this.enemies.enemies.find((entry) => entry.alive);
        if (heroEnemy) {
          _captureDirection.set(directionX, 0, directionZ);
          if (_captureDirection.lengthSq() < 0.001) {
            _captureDirection.set(1, 0, 0);
          } else {
            _captureDirection.normalize();
          }
          heroEnemy.rig.root.position
            .copy(this.player.position)
            .addScaledVector(_captureDirection, 8.6);
          heroEnemy.rig.root.position.y = 0.015;
          heroEnemy.groundY = 0.015;
          heroEnemy.rig.lastGroundY = 0.015;
          heroEnemy.destination.copy(heroEnemy.rig.root.position);
          _captureDirection
            .subVectors(this.player.position, heroEnemy.rig.root.position)
            .setY(0)
            .normalize();
          heroEnemy.rig.root.rotation.y = Math.atan2(
            -_captureDirection.x,
            -_captureDirection.z,
          );
          heroEnemy.alerted = true;
          heroEnemy.detection = 1;
          heroEnemy.canSeePlayer = true;
          heroEnemy.reactionTimer = 0;
          heroEnemy.aimPoint.copy(this.player.eyePosition);
          heroEnemy.aimVelocity.set(0, 0, 0);
          heroEnemy.aimAlignment = 1;
          heroEnemy.accuracy = 1;
          heroEnemy.burstRemaining = 4;
          heroEnemy.shotTimer = 0;
          heroEnemy.state = EnemyState.FIRE;
          heroEnemy.renderAim = 1;
          this.captureTargetId = heroEnemy.id;
          for (let frame = 0; frame < 72; frame += 1) {
            heroEnemy.rig.animate(FIXED_STEP, 0, 1, frame > 64, 0, false);
          }
        }
      }
      this.enemies.forceAlert(this.player.position);
      this.ui.setScreen("playing");
    } else {
      this.ui.setScreen("capture");
      if (name === "enemy") {
        const enemy = this.enemies.enemies.find((entry) => entry.alive);
        if (enemy) {
          for (const entry of this.enemies.enemies) {
            entry.rig.root.visible = entry === enemy;
          }
          this.captureOverride.position
            .copy(enemy.rig.root.position)
            .add(new THREE.Vector3(2.35, 1.55, 2.65));
          this.captureOverride.target
            .copy(enemy.rig.root.position)
            .add(new THREE.Vector3(0, 1.18, 0));
          this.captureOverride.fov = 43;
          _captureDirection
            .subVectors(this.captureOverride.position, enemy.rig.root.position)
            .setY(0)
            .normalize();
          enemy.rig.root.rotation.y = Math.atan2(
            -_captureDirection.x,
            -_captureDirection.z,
          ) + 0.78;
          enemy.renderMotion = 0.38;
          enemy.renderAim = 1;
          for (let frame = 0; frame < 84; frame += 1) {
            enemy.rig.animate(FIXED_STEP, 0.38, 1, false, 0, false);
          }
        }
      }
      this.applyCaptureCamera();
    }
    return this.captureOverride ?? {
      mode: name,
      targetId: this.captureTargetId,
    };
  }

  applyCaptureCamera() {
    if (!this.captureOverride) return;
    this.rendering.camera.position.copy(this.captureOverride.position);
    this.rendering.camera.fov = this.captureOverride.fov;
    this.rendering.camera.updateProjectionMatrix();
    this.rendering.camera.lookAt(this.captureOverride.target);
    _captureQuaternion.copy(this.rendering.camera.quaternion);
  }

  stateSnapshot() {
    return {
      phase: this.state.phase,
      level: this.state.level,
      baseEnemyCount: this.state.baseEnemyCount,
      highestClearedLevel: this.state.highestClearedLevel,
      kills: this.state.kills,
      requiredKills: this.state.requiredKills,
      elapsed: this.state.elapsed,
      seed: this.state.seed,
      quality: this.state.quality,
    };
  }

  snapshot() {
    return {
      state: this.stateSnapshot(),
      player: {
        position: vectorSnapshot(this.player.snapshot.position),
        eyePosition: vectorSnapshot(this.player.snapshot.eyePosition),
        velocity: vectorSnapshot(this.player.snapshot.velocity),
        yaw: this.player.snapshot.yaw,
        pitch: this.player.snapshot.pitch,
        health: this.player.snapshot.health,
        maxHealth: this.player.snapshot.maxHealth,
        alive: this.player.snapshot.alive,
        grounded: this.player.snapshot.grounded,
        crouched: this.player.snapshot.crouched,
        sliding: this.player.snapshot.sliding,
        sprinting: this.player.snapshot.sprinting,
        mantling: this.player.snapshot.mantling,
        lean: this.player.snapshot.lean,
        speed: this.player.snapshot.speed,
        moveState: this.player.snapshot.moveState,
      },
      weapon: { ...this.rifle.snapshot },
      enemies: this.enemies.snapshot.enemies.map((enemy) => ({
        ...enemy,
        position: vectorSnapshot(enemy.position),
      })),
      effects: { ...this.effects.snapshot },
      camera: {
        position: vectorSnapshot(this.rendering.camera.position),
        rotation: {
          x: this.rendering.camera.rotation.x,
          y: this.rendering.camera.rotation.y,
          z: this.rendering.camera.rotation.z,
        },
      },
      world: {
        facadeFamilies: this.world?.stats?.facadeFamilies ?? 8,
        interiors: this.world?.stats?.enterableInteriors ?? 4,
        propArchetypes: this.world?.stats?.propArchetypes ?? 30,
        materialFamilies: this.materials.familyCount,
      },
      listenerCount: this.events.listenerCount(),
    };
  }

  frameStats() {
    const snapshot = this.diagnostics.snapshot();
    return {
      ...snapshot,
      frameTimes: [...this.performanceSamples],
      samples: [...this.performanceSamples],
    };
  }

  exposeTestInterface() {
    if (!this.options.test) return;
    const api = {
      version: 2,
      ready: () => this.ready,
      state: () => this.stateSnapshot(),
      diagnostics: () => ({
        ...this.diagnostics.snapshot(),
        rendererInfo: this.diagnostics.rendererInfo,
      }),
      start: async () => {
        this.events.emit("game:start", { source: "test" });
        return this.stateSnapshot();
      },
      pause: async () => {
        this.events.emit("game:pause", { source: "test" });
        return this.stateSnapshot();
      },
      resume: async () => {
        this.events.emit("game:resume", { source: "test" });
        return this.stateSnapshot();
      },
      restart: async () => {
        this.events.emit("game:restart", { source: "test" });
        return this.stateSnapshot();
      },
      nextLevel: async () => {
        this.events.emit("game:next-level", { source: "test" });
        return this.stateSnapshot();
      },
      resize: async (width, height) => this.rendering.resize(width, height),
      captureReady: async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return true;
      },
      snapshot: () => this.snapshot(),
      setInput: (record) => this.input.setSynthetic(record),
      step: (frames) => this.manualStep(frames),
      teleport: async (position, yaw = 0) => {
        if (toVector(position, _capturePosition)) {
          this.player.teleport(_capturePosition, yaw);
        }
        return this.snapshot();
      },
      fire: (count) => this.fireTest(count),
      damagePlayer: async (amount) => {
        this.player.applyDamage(amount, _damageDirection, "test");
        return this.player.snapshot.health;
      },
      killEnemy: async (id, zone = "torso") =>
        this.enemies.applyDamage(id, 1000, zone, _damageDirection),
      setCapturePose: async (name) => this.setCapturePose(name),
      frameStats: async () => this.frameStats(),
      runPerformance: (frames, performanceOptions) =>
        this.runPerformance(frames, performanceOptions),
      pointerLock: async () => {
        const supported = typeof this.rendering.renderer.domElement
          .requestPointerLock === "function";
        if (!supported) return false;
        try {
          await this.input.requestPointerLock();
        } catch {
          // Headless browsers can deny non-gesture requests. API support still
          // proves the production path is wired and the UI click probes it.
        }
        return true;
      },
      pointerLocked: async () =>
        document.pointerLockElement === this.rendering.renderer.domElement,
      simulatePointerLockLoss: async () => {
        this.events.emit("input:pointer-lock", {
          locked: false,
          source: "test-simulation",
        });
        return this.stateSnapshot();
      },
    };
    window.__FPS_TEST__ = Object.freeze(api);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    for (let i = this.unsubscribers.length - 1; i >= 0; i -= 1) {
      this.unsubscribers[i]();
    }
    this.unsubscribers.length = 0;
    this.ui.dispose();
    this.audio.dispose();
    this.enemies.dispose();
    this.effects.dispose();
    this.rifle.dispose();
    this.player.dispose();
    this.input.dispose();
    this.worldBuilder.dispose?.();
    this.materials.dispose();
    this.physics.dispose();
    this.rendering.dispose();
    this.events.clear();
    delete window.__FPS_TEST__;
    delete window.__CINDERLINE__;
  }
}

export default Game;
