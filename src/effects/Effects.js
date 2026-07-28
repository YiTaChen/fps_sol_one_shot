import * as THREE from 'three';

const MAX_PARTICLES = 96;
const MAX_TRACERS = 32;
const MAX_DECALS = 48;
const MAX_SHELLS = 24;
const MAX_FLASHES = 6;
const MAX_FLASH_LIGHTS = 2;
const OFFSCREEN = new THREE.Vector3(0, -1000, 0);
const ZERO_SCALE = new THREE.Vector3(0, 0, 0);
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const NEG_Z_AXIS = new THREE.Vector3(0, 0, -1);
const GRAVITY = new THREE.Vector3(0, -9.81, 0);
const POINT = new THREE.Vector3();
const NORMAL = new THREE.Vector3();
const DIRECTION = new THREE.Vector3();
const TANGENT = new THREE.Vector3();
const BITANGENT = new THREE.Vector3();
const SEGMENT = new THREE.Vector3();
const MIDPOINT = new THREE.Vector3();
const TRACER_ENDPOINT = new THREE.Vector3();
const RENDER_POSITION = new THREE.Vector3();
const SCALE = new THREE.Vector3();
const SHELL_SCALE = new THREE.Vector3(1, 1, 1);
const MATRIX = new THREE.Matrix4();
const QUATERNION = new THREE.Quaternion();
const DECAL_QUATERNION = new THREE.Quaternion();
const INVERSE_CAMERA = new THREE.Quaternion();
const COLOR = new THREE.Color();
const LOOK = new THREE.Matrix4();

const SURFACE_COLORS = Object.freeze({
  concrete: 0x8e897d,
  plaster: 0xc4b8a2,
  metal: 0xf3bd64,
  wood: 0x9b6a35,
  glass: 0xa8e8ed,
  dirt: 0x9b744b,
  fabric: 0x8d8272,
  flesh: 0x982f2b,
  rubber: 0x363936,
});

const DECAL_COLORS = Object.freeze({
  concrete: 0x201d1a,
  plaster: 0x342a25,
  metal: 0x151719,
  wood: 0x2e2117,
  glass: 0x66777b,
  dirt: 0x4b3726,
  fabric: 0x3f3832,
  flesh: 0x531314,
  rubber: 0x171817,
});

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function emit(events, name, payload) {
  if (!events) return;
  if (typeof events.emit === 'function') events.emit(name, payload);
  else if (typeof events.dispatch === 'function') events.dispatch(name, payload);
  else if (typeof events.publish === 'function') events.publish(name, payload);
}

function listen(events, name, callback, disposers) {
  if (!events) return;
  if (typeof events.on === 'function') {
    const result = events.on(name, callback);
    if (typeof result === 'function') disposers.push(result);
    else if (typeof events.off === 'function') disposers.push(() => events.off(name, callback));
  } else if (typeof events.addEventListener === 'function') {
    events.addEventListener(name, callback);
    disposers.push(() => events.removeEventListener(name, callback));
  }
}

function vectorLike(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function surfaceName(value) {
  const name = String(value ?? 'concrete').toLowerCase();
  if (/flesh|enemy|body|blood/.test(name)) return 'flesh';
  if (/glass|window/.test(name)) return 'glass';
  if (/fabric|cloth|canvas/.test(name)) return 'fabric';
  if (/wood|timber|ply/.test(name)) return 'wood';
  if (/metal|steel|iron|alum/.test(name)) return 'metal';
  if (/dirt|sand|soil/.test(name)) return 'dirt';
  if (/plaster|stucco|drywall/.test(name)) return 'plaster';
  if (/rubber/.test(name)) return 'rubber';
  return 'concrete';
}

function hashSeed(value) {
  const string = String(value ?? 'effects');
  let hash = 2166136261;
  for (let i = 0; i < string.length; i += 1) {
    hash ^= string.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0xa511e9b3;
}

class LocalRng {
  constructor(seed) {
    this.initialSeed = hashSeed(seed);
    this.state = this.initialSeed;
  }

  reset(seed) {
    this.initialSeed = hashSeed(seed);
    this.state = this.initialSeed;
  }

  float() {
    let value = this.state | 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 4294967296;
  }
}

function acquireStream(service, name, seed) {
  if (service) {
    if (typeof service.stream === 'function') return service.stream(name);
    if (typeof service.getStream === 'function') return service.getStream(name);
    if (typeof service.fork === 'function') return service.fork(name);
  }
  return new LocalRng(`${seed}:${name}`);
}

function randomFloat(stream) {
  if (!stream) return 0.5;
  if (typeof stream.float === 'function') return stream.float();
  if (typeof stream.nextFloat === 'function') return stream.nextFloat();
  if (typeof stream.range === 'function') return stream.range(0, 1);
  if (typeof stream.next === 'function') {
    const result = stream.next();
    return typeof result === 'number' ? result : Number(result?.value) || 0.5;
  }
  return 0.5;
}

function makeFlashTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5 - size * 0.5) / (size * 0.5);
      const ny = (y + 0.5 - size * 0.5) / (size * 0.5);
      const radial = Math.sqrt(nx * nx + ny * ny);
      const cross = Math.max(
        Math.exp(-Math.abs(nx) * 12) * Math.exp(-Math.abs(ny) * 1.8),
        Math.exp(-Math.abs(ny) * 12) * Math.exp(-Math.abs(nx) * 1.8),
      );
      const core = Math.max(0, 1 - radial);
      const alpha = clamp01(core * core * 0.86 + cross * 0.32);
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = Math.floor(165 + core * 90);
      data[index + 2] = Math.floor(42 + core * 160);
      data[index + 3] = Math.floor(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeParticleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      pixelRatio: { value: Math.min(2, globalThis.devicePixelRatio || 1) },
    },
    vertexShader: `
      uniform float pixelRatio;
      attribute vec3 effectColor;
      attribute float effectSize;
      attribute float effectAlpha;
      attribute float effectKind;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vKind;
      void main() {
        vColor = effectColor;
        vAlpha = effectAlpha;
        vKind = effectKind;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float perspective = 260.0 / max(0.3, -mvPosition.z);
        gl_PointSize = clamp(effectSize * perspective * pixelRatio, 1.0, 42.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vKind;
      void main() {
        vec2 p = gl_PointCoord - vec2(0.5);
        float radius = length(p) * 2.0;
        float soft = 1.0 - smoothstep(0.38, 1.0, radius);
        float shard = 1.0 - smoothstep(0.15, 0.82, abs(p.x) + abs(p.y) * 0.32);
        float shape = mix(soft, shard, step(vKind, 1.5));
        float smokeSoftness = mix(shape, soft * 0.72, step(3.5, vKind));
        if (smokeSoftness <= 0.01 || vAlpha <= 0.001) discard;
        gl_FragColor = vec4(vColor, vAlpha * smokeSoftness);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexColors: false,
  });
}

function createParticleSlot(index) {
  return {
    index,
    active: false,
    position: new THREE.Vector3(),
    previous: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    color: new THREE.Color(),
    age: 0,
    life: 1,
    size: 0.04,
    startSize: 0.04,
    endSize: 0.01,
    gravity: 1,
    drag: 0,
    kind: 0,
  };
}

function createTimedSlot(index) {
  return { index, active: false, age: 0, life: 0 };
}

/**
 * Budgeted pooled combat effects. This system listens to public weapon/combat
 * events and can also be driven explicitly through its stable public methods.
 */
export class Effects {
  constructor(context = null, options = {}) {
    this.options = {
      particleBudget: MAX_PARTICLES,
      tracerBudget: MAX_TRACERS,
      decalBudget: MAX_DECALS,
      shellBudget: MAX_SHELLS,
      ...options,
    };
    this.context = null;
    this.events = null;
    this.scene = null;
    this.viewScene = null;
    this.camera = null;
    this.physics = null;
    this.rng = new LocalRng('cinderline:effects');
    this._disposers = [];
    this._geometries = [];
    this._materials = [];
    this._textures = [];
    this._initialized = false;
    this._sequence = 0;

    this.particleLimit = Math.min(MAX_PARTICLES, this.options.particleBudget);
    this.tracerLimit = Math.min(MAX_TRACERS, this.options.tracerBudget);
    this.decalLimit = Math.min(MAX_DECALS, this.options.decalBudget);
    this.shellLimit = Math.min(MAX_SHELLS, this.options.shellBudget);

    this.particles = Array.from({ length: MAX_PARTICLES }, (_, i) => createParticleSlot(i));
    this.tracers = Array.from({ length: MAX_TRACERS }, (_, i) => createTimedSlot(i));
    this.decals = Array.from({ length: MAX_DECALS }, (_, i) => ({
      ...createTimedSlot(i),
      matrix: new THREE.Matrix4(),
    }));
    this.shells = Array.from({ length: MAX_SHELLS }, (_, i) => ({
      ...createTimedSlot(i),
      position: new THREE.Vector3(),
      previous: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      angularAxis: new THREE.Vector3(1, 0, 0),
      angularSpeed: 0,
      bounces: 0,
    }));
    this.flashes = Array.from({ length: MAX_FLASHES }, (_, i) => ({
      ...createTimedSlot(i),
      group: null,
    }));
    this.flashLights = Array.from({ length: MAX_FLASH_LIGHTS }, (_, i) => ({
      ...createTimedSlot(i),
      light: null,
    }));

    this.snapshot = {
      activeParticles: 0,
      activeTracers: 0,
      activeDecals: 0,
      activeShells: 0,
      particleBudget: this.particleLimit,
      hitMarker: 0,
      hitHeadshot: false,
      hitKill: false,
    };
    this._hitMarkerTime = 0;
    this._hitHeadshot = false;
    this._hitKill = false;
    if (context) this.init(context);
  }

  init(context) {
    if (this._initialized) return this;
    this._initialized = true;
    this.context = context;
    this.events = context.events;
    this.scene = context.scene;
    this.viewScene = context.viewScene;
    this.camera = context.camera;
    this.physics = context.physics;
    this.rng = acquireStream(context.rng, 'effects', context.state?.seed);
    this._buildPools();

    listen(this.events, 'weapon:fire', (event) => {
      this.spawnMuzzle(event);
      const start = event?.muzzle ?? event?.position;
      const end = event?.tracerEnd;
      if (vectorLike(start) && vectorLike(end)) this.spawnTracer(start, end, 'player');
      if (event?.kind !== 'enemy' && !String(event?.source ?? '').startsWith('enemy:')) {
        this._spawnShellFromShot(event);
      }
    }, this._disposers);
    listen(this.events, 'projectile:spawn', (event) => {
      if (event?.kind !== 'enemy') return;
      const origin = event?.origin ?? event?.position;
      const direction = event?.direction ?? event?.velocity;
      if (!vectorLike(origin) || !vectorLike(direction)) return;
      DIRECTION.copy(direction).normalize();
      const distance = Math.min(32, Number(event?.targetDistance ?? event?.maxDistance ?? 26));
      TRACER_ENDPOINT.copy(origin).addScaledVector(DIRECTION, distance);
      this.spawnTracer(origin, TRACER_ENDPOINT, 'enemy');
    }, this._disposers);
    listen(this.events, 'projectile:impact', (event) => {
      if (event?.kind !== 'tracer-end') this.spawnImpact(event);
    }, this._disposers);
    listen(this.events, 'combat:hitmarker', (event) => this._signalHitMarker(event), this._disposers);
    listen(this.events, 'combat:kill', (event) => this._signalHitMarker({ ...event, kill: true }), this._disposers);
    listen(this.events, 'quality:change', (event) => this._applyQuality(event), this._disposers);
    return this;
  }

  _buildPools() {
    const particlePositions = new Float32Array(MAX_PARTICLES * 3);
    const particleColors = new Float32Array(MAX_PARTICLES * 3);
    const particleSizes = new Float32Array(MAX_PARTICLES);
    const particleAlphas = new Float32Array(MAX_PARTICLES);
    const particleKinds = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      particlePositions[i * 3 + 1] = -1000;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute('effectColor', new THREE.BufferAttribute(particleColors, 3));
    particleGeometry.setAttribute('effectSize', new THREE.BufferAttribute(particleSizes, 1));
    particleGeometry.setAttribute('effectAlpha', new THREE.BufferAttribute(particleAlphas, 1));
    particleGeometry.setAttribute('effectKind', new THREE.BufferAttribute(particleKinds, 1));
    const particleMaterial = makeParticleMaterial();
    this.particlePoints = new THREE.Points(particleGeometry, particleMaterial);
    this.particlePoints.name = 'pooled-impact-particles';
    this.particlePoints.frustumCulled = false;
    this.scene?.add(this.particlePoints);
    this._geometries.push(particleGeometry);
    this._materials.push(particleMaterial);

    const tracerGeometry = new THREE.CylinderGeometry(0.004, 0.008, 1, 5, 1, true);
    const tracerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc170,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.tracerMesh = new THREE.InstancedMesh(tracerGeometry, tracerMaterial, MAX_TRACERS);
    this.tracerMesh.name = 'pooled-tracers';
    this.tracerMesh.frustumCulled = false;
    this.scene?.add(this.tracerMesh);
    this._geometries.push(tracerGeometry);
    this._materials.push(tracerMaterial);

    const decalGeometry = new THREE.CircleGeometry(1, 10);
    const decalMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      side: THREE.DoubleSide,
    });
    this.decalMesh = new THREE.InstancedMesh(decalGeometry, decalMaterial, MAX_DECALS);
    this.decalMesh.name = 'pooled-impact-decals';
    this.decalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.decalMesh.frustumCulled = false;
    this.scene?.add(this.decalMesh);
    this._geometries.push(decalGeometry);
    this._materials.push(decalMaterial);

    const shellGeometry = new THREE.CylinderGeometry(0.005, 0.0058, 0.031, 8, 1, false);
    const shellMaterial = new THREE.MeshStandardMaterial({
      color: 0xc89742,
      metalness: 0.88,
      roughness: 0.28,
    });
    this.shellMesh = new THREE.InstancedMesh(shellGeometry, shellMaterial, MAX_SHELLS);
    this.shellMesh.name = 'pooled-shell-casings';
    this.shellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shellMesh.frustumCulled = false;
    this.scene?.add(this.shellMesh);
    this._geometries.push(shellGeometry);
    this._materials.push(shellMaterial);

    this.flashTexture = makeFlashTexture();
    this._textures.push(this.flashTexture);
    const flashMaterial = new THREE.SpriteMaterial({
      map: this.flashTexture,
      color: 0xffd08a,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffa13f,
      transparent: true,
      opacity: 0.84,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const coreGeometry = new THREE.ConeGeometry(0.038, 0.2, 7, 1, true);
    coreGeometry.rotateX(-Math.PI * 0.5);
    coreGeometry.translate(0, 0, -0.08);
    this._materials.push(flashMaterial, coreMaterial);
    this._geometries.push(coreGeometry);
    const flashParent = this.scene;
    for (let i = 0; i < MAX_FLASHES; i += 1) {
      const group = new THREE.Group();
      group.name = `pooled-muzzle-flash-${i}`;
      const sprite = new THREE.Sprite(flashMaterial);
      sprite.scale.set(0.24, 0.24, 0.24);
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      core.scale.set(1, 1, 1);
      const side = new THREE.Mesh(coreGeometry, coreMaterial);
      side.rotation.z = Math.PI * 0.5;
      side.scale.set(0.62, 0.62, 0.62);
      group.add(sprite, core, side);
      group.visible = false;
      flashParent?.add(group);
      this.flashes[i].group = group;
    }
    for (let i = 0; i < MAX_FLASH_LIGHTS; i += 1) {
      const light = new THREE.PointLight(0xff9a42, 0, 4.2, 2);
      light.name = `pooled-muzzle-light-${i}`;
      light.castShadow = false;
      this.scene?.add(light);
      this.flashLights[i].light = light;
    }

    this._hideAllInstances();
  }

  spawnMuzzle(data) {
    const position = data?.muzzle ?? data?.position;
    const direction = data?.direction;
    if (!vectorLike(position) || !vectorLike(direction)) return false;
    const flash = this._claimTimed(this.flashes, MAX_FLASHES);
    flash.active = true;
    flash.age = 0;
    flash.life = 0.055;
    flash.group.visible = true;

    flash.group.position.copy(position);
    DIRECTION.copy(direction).normalize();
    QUATERNION.setFromUnitVectors(NEG_Z_AXIS, DIRECTION);
    flash.group.quaternion.copy(QUATERNION);
    const scale = 0.82 + randomFloat(this.rng) * 0.42;
    flash.group.scale.setScalar(scale);
    flash.group.rotation.z += (randomFloat(this.rng) - 0.5) * 1.2;

    const lightSlot = this._claimTimed(this.flashLights, MAX_FLASH_LIGHTS);
    lightSlot.active = true;
    lightSlot.age = 0;
    lightSlot.life = 0.048;
    lightSlot.light.position.copy(position);
    lightSlot.light.intensity = 3.8;
    lightSlot.light.distance = 4.4;

    POINT.copy(position).addScaledVector(direction, 0.05);
    for (let i = 0; i < 3; i += 1) {
      this._spawnParticle({
        position: POINT,
        normal: direction,
        color: 0x69645b,
        speed: 0.28 + randomFloat(this.rng) * 0.25,
        life: 0.4 + randomFloat(this.rng) * 0.25,
        startSize: 0.035,
        endSize: 0.16,
        gravity: -0.04,
        drag: 2.8,
        kind: 4,
        spread: 0.35,
      });
    }
    return true;
  }

  spawnTracer(a, b, kind = 'player') {
    if (!vectorLike(a) || !vectorLike(b)) return false;
    const tracer = this._claimTimed(this.tracers, this.tracerLimit);
    tracer.active = true;
    tracer.age = 0;
    tracer.life = kind === 'enemy' ? 0.085 : 0.07;
    SEGMENT.subVectors(b, a);
    const length = Math.min(32, SEGMENT.length());
    if (length <= 0.001) {
      tracer.active = false;
      return false;
    }
    DIRECTION.copy(SEGMENT).normalize();
    MIDPOINT.copy(a).addScaledVector(DIRECTION, length * 0.5);
    QUATERNION.setFromUnitVectors(Y_AXIS, DIRECTION);
    SCALE.set(kind === 'enemy' ? 1.25 : 1, length, kind === 'enemy' ? 1.25 : 1);
    MATRIX.compose(MIDPOINT, QUATERNION, SCALE);
    this.tracerMesh.setMatrixAt(tracer.index, MATRIX);
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    return true;
  }

  spawnImpact(hit) {
    const position = hit?.point ?? hit?.position;
    if (!vectorLike(position)) return false;
    POINT.copy(position);
    if (vectorLike(hit?.normal)) NORMAL.copy(hit.normal).normalize();
    else if (vectorLike(hit?.direction)) NORMAL.copy(hit.direction).normalize().multiplyScalar(-1);
    else NORMAL.set(0, 1, 0);
    const surface = surfaceName(hit?.surface ?? hit?.material);

    if (surface !== 'glass' || !hit?.penetrated) {
      this._spawnDecal(POINT, NORMAL, surface);
    }

    switch (surface) {
      case 'metal':
        this._burst(POINT, NORMAL, 9, 0xf8b85c, 3.2, 0.25, 0.022, 0.006, 1, 1.2, 0.72);
        this._burst(POINT, NORMAL, 2, 0x5b5d5c, 0.48, 0.75, 0.045, 0.15, 4, -0.05, 0.8);
        break;
      case 'wood':
        this._burst(POINT, NORMAL, 8, 0x9b642d, 1.7, 0.52, 0.038, 0.012, 2, 1.25, 0.85);
        this._burst(POINT, NORMAL, 5, 0x7c654c, 0.52, 0.72, 0.05, 0.16, 4, -0.08, 0.95);
        break;
      case 'glass':
        this._burst(POINT, NORMAL, 10, 0xa8eff7, 2.4, 0.5, 0.028, 0.008, 2, 1.4, 0.92);
        break;
      case 'dirt':
        this._burst(POINT, NORMAL, 13, 0x9e774f, 0.85, 0.9, 0.07, 0.24, 4, 0.08, 1.0);
        break;
      case 'flesh':
        this._burst(POINT, NORMAL, 9, 0x9d2728, 1.5, 0.58, 0.045, 0.012, 3, 1.15, 0.82);
        this._burst(POINT, NORMAL, 3, 0x68191c, 0.45, 0.68, 0.06, 0.15, 4, 0.04, 0.9);
        break;
      case 'fabric':
        this._burst(POINT, NORMAL, 6, 0x8c8171, 0.56, 0.7, 0.045, 0.14, 4, 0.04, 0.9);
        break;
      case 'plaster':
        this._burst(POINT, NORMAL, 6, 0xc2b49d, 1.4, 0.55, 0.035, 0.012, 2, 1.2, 0.84);
        this._burst(POINT, NORMAL, 9, 0xb1a590, 0.65, 0.82, 0.065, 0.22, 4, 0.02, 0.95);
        break;
      default:
        this._burst(POINT, NORMAL, 6, 0x928b7e, 1.35, 0.55, 0.032, 0.01, 2, 1.3, 0.85);
        this._burst(POINT, NORMAL, 7, 0x8b8579, 0.62, 0.78, 0.058, 0.19, 4, 0.02, 0.92);
        break;
    }
    return true;
  }

  _burst(
    position,
    normal,
    count,
    color,
    speed,
    life,
    startSize,
    endSize,
    kind,
    gravity,
    spread,
  ) {
    for (let i = 0; i < count; i += 1) {
      this._spawnParticle({
        position,
        normal,
        color,
        speed: speed * (0.45 + randomFloat(this.rng) * 0.75),
        life: life * (0.72 + randomFloat(this.rng) * 0.62),
        startSize: startSize * (0.7 + randomFloat(this.rng) * 0.7),
        endSize: endSize * (0.75 + randomFloat(this.rng) * 0.5),
        kind,
        gravity,
        drag: kind >= 4 ? 2.4 : 0.4,
        spread,
      });
    }
  }

  _spawnParticle(data) {
    const particle = this._claimParticle();
    if (!particle) return false;
    particle.active = true;
    particle.age = 0;
    particle.life = Math.max(0.03, data.life);
    particle.position.copy(data.position);
    particle.previous.copy(data.position);
    particle.color.setHex(data.color);
    particle.startSize = data.startSize;
    particle.endSize = data.endSize;
    particle.size = data.startSize;
    particle.gravity = data.gravity;
    particle.drag = data.drag;
    particle.kind = data.kind;

    NORMAL.copy(data.normal).normalize();
    if (Math.abs(NORMAL.y) < 0.91) TANGENT.crossVectors(NORMAL, Y_AXIS).normalize();
    else TANGENT.crossVectors(NORMAL, Z_AXIS).normalize();
    BITANGENT.crossVectors(NORMAL, TANGENT).normalize();
    const angle = randomFloat(this.rng) * Math.PI * 2;
    const radial = Math.sqrt(randomFloat(this.rng)) * data.spread;
    DIRECTION.copy(NORMAL)
      .multiplyScalar(Math.max(0.18, 1 - radial))
      .addScaledVector(TANGENT, Math.cos(angle) * radial)
      .addScaledVector(BITANGENT, Math.sin(angle) * radial)
      .normalize();
    particle.velocity.copy(DIRECTION).multiplyScalar(data.speed);
    return true;
  }

  _spawnDecal(position, normal, surface) {
    const decal = this._claimTimed(this.decals, this.decalLimit);
    decal.active = true;
    decal.age = 0;
    decal.life = surface === 'flesh' ? 16 : 24;
    const size = surface === 'flesh'
      ? 0.065 + randomFloat(this.rng) * 0.05
      : 0.025 + randomFloat(this.rng) * 0.025;
    POINT.copy(position).addScaledVector(normal, 0.006);
    QUATERNION.setFromUnitVectors(Z_AXIS, normal);
    DECAL_QUATERNION.setFromAxisAngle(Z_AXIS, randomFloat(this.rng) * Math.PI * 2);
    QUATERNION.multiply(DECAL_QUATERNION);
    SCALE.set(size * (0.7 + randomFloat(this.rng) * 0.45), size, 1);
    decal.matrix.compose(POINT, QUATERNION, SCALE);
    this.decalMesh.setMatrixAt(decal.index, decal.matrix);
    COLOR.setHex(DECAL_COLORS[surface] ?? DECAL_COLORS.concrete);
    this.decalMesh.setColorAt(decal.index, COLOR);
    this.decalMesh.instanceMatrix.needsUpdate = true;
    if (this.decalMesh.instanceColor) this.decalMesh.instanceColor.needsUpdate = true;
  }

  _spawnShellFromShot(event) {
    const muzzle = event?.muzzle ?? event?.position;
    if (!vectorLike(muzzle) || !this.camera) return;
    const shell = this._claimTimed(this.shells, this.shellLimit);
    shell.active = true;
    shell.age = 0;
    shell.life = 5.5;
    this.camera.getWorldDirection(DIRECTION).normalize();
    RIGHTFromCamera(this.camera, TANGENT);
    UPFromCamera(this.camera, BITANGENT);
    shell.position.copy(muzzle)
      .addScaledVector(DIRECTION, -0.23)
      .addScaledVector(TANGENT, 0.075)
      .addScaledVector(BITANGENT, 0.035);
    shell.previous.copy(shell.position);
    shell.velocity.copy(TANGENT).multiplyScalar(1.7 + randomFloat(this.rng) * 0.85)
      .addScaledVector(BITANGENT, 1 + randomFloat(this.rng) * 0.65)
      .addScaledVector(DIRECTION, (randomFloat(this.rng) - 0.5) * 0.55);
    shell.rotation.identity();
    shell.angularAxis.set(
      randomFloat(this.rng) - 0.5,
      randomFloat(this.rng) - 0.5,
      randomFloat(this.rng) - 0.5,
    ).normalize();
    shell.angularSpeed = 16 + randomFloat(this.rng) * 19;
    shell.bounces = 0;
  }

  _signalHitMarker(event) {
    this._hitMarkerTime = Math.max(this._hitMarkerTime, event?.kill ? 0.34 : 0.19);
    this._hitHeadshot = Boolean(event?.headshot);
    this._hitKill = Boolean(event?.kill);
    this.snapshot.hitMarker = 1;
    this.snapshot.hitHeadshot = this._hitHeadshot;
    this.snapshot.hitKill = this._hitKill;
  }

  _applyQuality(event) {
    const level = String(event?.name ?? event?.quality ?? event?.preset ?? 'medium').toLowerCase();
    if (level === 'low') {
      this.particleLimit = 58;
      this.tracerLimit = 20;
      this.decalLimit = 28;
      this.shellLimit = 14;
    } else if (level === 'high') {
      this.particleLimit = MAX_PARTICLES;
      this.tracerLimit = MAX_TRACERS;
      this.decalLimit = MAX_DECALS;
      this.shellLimit = MAX_SHELLS;
    } else {
      this.particleLimit = Math.min(84, MAX_PARTICLES);
      this.tracerLimit = 28;
      this.decalLimit = 40;
      this.shellLimit = 20;
    }
    this.snapshot.particleBudget = this.particleLimit;
  }

  fixedUpdate(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || !this._initialized) return;
    for (let i = 0; i < this.particleLimit; i += 1) {
      const particle = this.particles[i];
      if (!particle.active) continue;
      particle.age += dt;
      if (particle.age >= particle.life) {
        particle.active = false;
        continue;
      }
      particle.previous.copy(particle.position);
      particle.velocity.addScaledVector(GRAVITY, particle.gravity * dt);
      particle.velocity.multiplyScalar(Math.exp(-particle.drag * dt));
      particle.position.addScaledVector(particle.velocity, dt);
      particle.size = THREE.MathUtils.lerp(
        particle.startSize,
        particle.endSize,
        clamp01(particle.age / particle.life),
      );
    }

    for (let i = 0; i < this.tracerLimit; i += 1) {
      const tracer = this.tracers[i];
      if (!tracer.active) continue;
      tracer.age += dt;
      if (tracer.age >= tracer.life) this._hideTracer(tracer);
    }

    for (let i = 0; i < this.decalLimit; i += 1) {
      const decal = this.decals[i];
      if (!decal.active) continue;
      decal.age += dt;
      if (decal.age >= decal.life) this._hideDecal(decal);
    }

    for (let i = 0; i < this.shellLimit; i += 1) {
      const shell = this.shells[i];
      if (!shell.active) continue;
      shell.age += dt;
      if (shell.age >= shell.life) {
        this._hideShell(shell);
        continue;
      }
      shell.previous.copy(shell.position);
      shell.velocity.addScaledVector(GRAVITY, dt);
      SEGMENT.copy(shell.velocity).multiplyScalar(dt);
      const distance = SEGMENT.length();
      let hit = null;
      if (distance > 0.001) {
        DIRECTION.copy(SEGMENT).multiplyScalar(1 / distance);
        hit = this.physics?.raycast?.(shell.position, DIRECTION, distance, 0xffffffff);
      }
      if (hit) {
        shell.position.copy(hit.point).addScaledVector(hit.normal, 0.008);
        shell.velocity.reflect(hit.normal).multiplyScalar(0.34);
        shell.velocity.x *= 0.72;
        shell.velocity.z *= 0.72;
        shell.angularSpeed *= 0.68;
        shell.bounces += 1;
        if (shell.bounces === 1) {
          emit(this.events, 'audio:play', {
            name: 'shell-impact',
            position: shell.position.clone(),
            strength: shell.velocity.length(),
          });
        }
        if (shell.velocity.lengthSq() < 0.08) shell.velocity.set(0, 0, 0);
      } else {
        shell.position.add(SEGMENT);
      }
      if (shell.angularSpeed > 0.05) {
        QUATERNION.setFromAxisAngle(shell.angularAxis, shell.angularSpeed * dt);
        shell.rotation.premultiply(QUATERNION);
        shell.angularSpeed *= Math.exp(-0.36 * dt);
      }
    }

    for (let i = 0; i < MAX_FLASHES; i += 1) {
      const flash = this.flashes[i];
      if (!flash.active) continue;
      flash.age += dt;
      if (flash.age >= flash.life) {
        flash.active = false;
        flash.group.visible = false;
      } else {
        const fade = 1 - flash.age / flash.life;
        flash.group.scale.multiplyScalar(0.84 + fade * 0.16);
      }
    }
    for (let i = 0; i < MAX_FLASH_LIGHTS; i += 1) {
      const light = this.flashLights[i];
      if (!light.active) continue;
      light.age += dt;
      const fade = Math.max(0, 1 - light.age / light.life);
      light.light.intensity = 3.8 * fade * fade;
      if (light.age >= light.life) {
        light.active = false;
        light.light.intensity = 0;
      }
    }

    if (this._hitMarkerTime > 0) {
      this._hitMarkerTime = Math.max(0, this._hitMarkerTime - dt);
      this.snapshot.hitMarker = clamp01(this._hitMarkerTime / (this._hitKill ? 0.34 : 0.19));
      if (this._hitMarkerTime === 0) {
        this._hitHeadshot = false;
        this._hitKill = false;
        this.snapshot.hitHeadshot = false;
        this.snapshot.hitKill = false;
      }
    }
  }

  update(_dt, alpha = 1) {
    if (!this._initialized) return;
    const positionAttribute = this.particlePoints.geometry.getAttribute('position');
    const colorAttribute = this.particlePoints.geometry.getAttribute('effectColor');
    const sizeAttribute = this.particlePoints.geometry.getAttribute('effectSize');
    const alphaAttribute = this.particlePoints.geometry.getAttribute('effectAlpha');
    const kindAttribute = this.particlePoints.geometry.getAttribute('effectKind');
    let activeParticles = 0;
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const particle = this.particles[i];
      if (particle.active && i < this.particleLimit) {
        RENDER_POSITION.lerpVectors(particle.previous, particle.position, clamp01(alpha));
        positionAttribute.setXYZ(i, RENDER_POSITION.x, RENDER_POSITION.y, RENDER_POSITION.z);
        colorAttribute.setXYZ(i, particle.color.r, particle.color.g, particle.color.b);
        sizeAttribute.setX(i, particle.size);
        const fade = 1 - clamp01(particle.age / particle.life);
        alphaAttribute.setX(i, particle.kind >= 4 ? fade * 0.56 : fade);
        kindAttribute.setX(i, particle.kind);
        activeParticles += 1;
      } else {
        positionAttribute.setXYZ(i, 0, -1000, 0);
        alphaAttribute.setX(i, 0);
        sizeAttribute.setX(i, 0);
      }
    }
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    sizeAttribute.needsUpdate = true;
    alphaAttribute.needsUpdate = true;
    kindAttribute.needsUpdate = true;

    let activeShells = 0;
    for (let i = 0; i < MAX_SHELLS; i += 1) {
      const shell = this.shells[i];
      if (shell.active && i < this.shellLimit) {
        RENDER_POSITION.lerpVectors(shell.previous, shell.position, clamp01(alpha));
        MATRIX.compose(RENDER_POSITION, shell.rotation, SHELL_SCALE);
        this.shellMesh.setMatrixAt(i, MATRIX);
        activeShells += 1;
      }
    }
    this.shellMesh.instanceMatrix.needsUpdate = true;

    let activeTracers = 0;
    for (let i = 0; i < this.tracerLimit; i += 1) {
      if (this.tracers[i].active) activeTracers += 1;
    }
    let activeDecals = 0;
    for (let i = 0; i < this.decalLimit; i += 1) {
      if (this.decals[i].active) activeDecals += 1;
    }
    this.snapshot.activeParticles = activeParticles;
    this.snapshot.activeTracers = activeTracers;
    this.snapshot.activeDecals = activeDecals;
    this.snapshot.activeShells = activeShells;
  }

  _claimParticle() {
    let oldest = null;
    for (let i = 0; i < this.particleLimit; i += 1) {
      const particle = this.particles[i];
      if (!particle.active) return particle;
      if (!oldest || particle.age / particle.life > oldest.age / oldest.life) oldest = particle;
    }
    return oldest;
  }

  _claimTimed(pool, limit) {
    let oldest = pool[0];
    for (let i = 0; i < limit; i += 1) {
      if (!pool[i].active) return pool[i];
      if (pool[i].age / pool[i].life > oldest.age / oldest.life) oldest = pool[i];
    }
    if (pool === this.tracers) this._hideTracer(oldest);
    else if (pool === this.decals) this._hideDecal(oldest);
    else if (pool === this.shells) this._hideShell(oldest);
    else if (pool === this.flashes && oldest.group) oldest.group.visible = false;
    else if (pool === this.flashLights && oldest.light) oldest.light.intensity = 0;
    oldest.active = false;
    return oldest;
  }

  _hideTracer(tracer) {
    tracer.active = false;
    MATRIX.compose(OFFSCREEN, QUATERNION.identity(), ZERO_SCALE);
    this.tracerMesh.setMatrixAt(tracer.index, MATRIX);
    this.tracerMesh.instanceMatrix.needsUpdate = true;
  }

  _hideDecal(decal) {
    decal.active = false;
    MATRIX.compose(OFFSCREEN, QUATERNION.identity(), ZERO_SCALE);
    this.decalMesh.setMatrixAt(decal.index, MATRIX);
    this.decalMesh.instanceMatrix.needsUpdate = true;
  }

  _hideShell(shell) {
    shell.active = false;
    MATRIX.compose(OFFSCREEN, QUATERNION.identity(), ZERO_SCALE);
    this.shellMesh.setMatrixAt(shell.index, MATRIX);
    this.shellMesh.instanceMatrix.needsUpdate = true;
  }

  _hideAllInstances() {
    for (let i = 0; i < MAX_TRACERS; i += 1) this._hideTracer(this.tracers[i]);
    for (let i = 0; i < MAX_DECALS; i += 1) this._hideDecal(this.decals[i]);
    for (let i = 0; i < MAX_SHELLS; i += 1) this._hideShell(this.shells[i]);
  }

  reset(seed = this.context?.state?.seed) {
    for (const particle of this.particles) particle.active = false;
    for (const tracer of this.tracers) tracer.active = false;
    for (const decal of this.decals) decal.active = false;
    for (const shell of this.shells) shell.active = false;
    for (const flash of this.flashes) {
      flash.active = false;
      if (flash.group) flash.group.visible = false;
    }
    for (const light of this.flashLights) {
      light.active = false;
      if (light.light) light.light.intensity = 0;
    }
    if (this._initialized) this._hideAllInstances();
    this._hitMarkerTime = 0;
    this._hitHeadshot = false;
    this._hitKill = false;
    this.snapshot.hitMarker = 0;
    this.snapshot.hitHeadshot = false;
    this.snapshot.hitKill = false;
    this.snapshot.activeParticles = 0;
    this.snapshot.activeTracers = 0;
    this.snapshot.activeDecals = 0;
    this.snapshot.activeShells = 0;
    this._sequence = 0;
    this.rng = acquireStream(this.context?.rng, 'effects', seed);
    if (this.rng instanceof LocalRng) this.rng.reset(`${seed}:effects`);
    else this.rng?.reset?.();
  }

  dispose() {
    for (let i = this._disposers.length - 1; i >= 0; i -= 1) {
      try {
        this._disposers[i]();
      } catch {
        // Continue disposing local GPU resources if the host bus is already gone.
      }
    }
    this._disposers.length = 0;
    this.particlePoints?.removeFromParent();
    this.tracerMesh?.removeFromParent();
    this.decalMesh?.removeFromParent();
    this.shellMesh?.removeFromParent();
    for (const flash of this.flashes) flash.group?.removeFromParent();
    for (const light of this.flashLights) light.light?.removeFromParent();
    for (const geometry of this._geometries) geometry.dispose();
    for (const material of this._materials) material.dispose();
    for (const texture of this._textures) texture.dispose();
    this._geometries.length = 0;
    this._materials.length = 0;
    this._textures.length = 0;
    this.context = null;
    this.events = null;
    this.scene = null;
    this.viewScene = null;
    this.camera = null;
    this.physics = null;
    this._initialized = false;
  }
}

function RIGHTFromCamera(camera, out) {
  return out.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
}

function UPFromCamera(camera, out) {
  return out.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
}

export { Effects as EffectsSystem };
export default Effects;
