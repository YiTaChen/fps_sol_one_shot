import * as THREE from 'three';

export const THROWABLES = Object.freeze({
  pulse: Object.freeze({
    id: 'pulse',
    label: 'Pulse Orb',
    detail: 'Weakens nearby hostiles within line of effect.',
    price: 230,
    max: 2,
    color: 0x6beaff,
    radius: 4.55,
    duration: 0.48,
  }),
  haze: Object.freeze({
    id: 'haze',
    label: 'Haze Orb',
    detail: 'Creates a brief veil that blocks hostile sight.',
    price: 160,
    max: 2,
    color: 0xabc8e5,
    radius: 3.7,
    duration: 6,
  }),
  stasis: Object.freeze({
    id: 'stasis',
    label: 'Stasis Orb',
    detail: 'Briefly suspends nearby hostile actions within line of effect.',
    price: 200,
    max: 2,
    color: 0xdfa6ff,
    radius: 5,
    duration: 0.62,
  }),
});

const ORB_CAPACITY = 4;
const CLOUD_SPRITES = 13;
const TRAIL_POINTS = 7;
const THROW_SPEED = 12.8;
const FLIGHT_LIMIT = 1.22;
const STASIS_SECONDS = 2.65;
const ORB_CLEARANCE = 0.13;
const GRAVITY = 14;
const SKY = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

function cloudTexture() {
  const size = 48;
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    const y = ((row + 0.5) / size) * 2 - 1;
    for (let column = 0; column < size; column += 1) {
      const x = ((column + 0.5) / size) * 2 - 1;
      const lobes =
        0.62 * Math.exp(-((x * x + y * y) * 3.3))
        + 0.28 * Math.exp(-(((x - 0.23) ** 2 + (y + 0.25) ** 2) * 7.8))
        + 0.22 * Math.exp(-(((x + 0.34) ** 2 + (y - 0.14) ** 2) * 10));
      const edge = Math.max(0, 1 - Math.hypot(x, y) ** 2);
      const offset = (row * size + column) * 4;
      data.fill(255, offset, offset + 3);
      data[offset + 3] = Math.min(255, Math.round(460 * lobes * edge));
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export class Throwables {
  constructor(context, { enemies } = {}) {
    this.context = context;
    this.enemies = enemies;
    this.root = new THREE.Group();
    this.root.name = 'Orb projectors';
    context.scene.add(this.root);

    this.coreGeometry = new THREE.IcosahedronGeometry(0.145, 1);
    this.ringGeometry = new THREE.TorusGeometry(1, 0.019, 6, 40);
    this.waveGeometry = new THREE.IcosahedronGeometry(1, 2);
    this.hazeTexture = cloudTexture();
    this.shellMaterial = new THREE.MeshStandardMaterial({
      color: 0x263845,
      roughness: 0.44,
      metalness: 0.5,
    });
    this.stasisMaterial = new THREE.MeshBasicMaterial({
      color: THROWABLES.stasis.color,
      toneMapped: false,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    this.slots = Array.from({ length: ORB_CAPACITY }, () => this.makeSlot());
    this.stuns = new Map();
    this.offEnemyDeath = context.events?.on?.('enemy:death', ({ enemyId }) => this.clearStun(enemyId));
    this.aim = new THREE.Vector3();
    this.next = new THREE.Vector3();
    this.delta = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.source = new THREE.Vector3();
    this.angles = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  makeSlot() {
    const root = new THREE.Group();
    root.visible = false;
    this.root.add(root);

    const orb = new THREE.Group();
    const lensMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
    const shell = new THREE.Mesh(this.coreGeometry, this.shellMaterial);
    const lens = new THREE.Mesh(this.coreGeometry, lensMaterial);
    lens.scale.setScalar(0.68);
    lens.position.set(0, 0.098, 0);
    orb.add(shell, lens);
    for (const axis of [0, Math.PI * 0.5]) {
      const rail = new THREE.Mesh(this.ringGeometry, lensMaterial);
      rail.scale.setScalar(0.163);
      rail.rotation.x = axis;
      orb.add(rail);
    }
    root.add(orb);
    const trailHistory = new Float32Array(TRAIL_POINTS * 3);
    const trailGeometry = new THREE.BufferGeometry();
    const trailAttribute = new THREE.BufferAttribute(new Float32Array(trailHistory.length), 3);
    trailAttribute.setUsage(THREE.DynamicDrawUsage);
    trailGeometry.setAttribute('position', trailAttribute);
    const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      toneMapped: false,
    }));
    trail.frustumCulled = false;
    root.add(trail);

    const waveMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      toneMapped: false,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(this.ringGeometry, waveMaterial.clone());
    ring.rotation.x = -Math.PI * 0.5;
    const wave = new THREE.Mesh(this.waveGeometry, waveMaterial);
    wave.material.wireframe = true;
    root.add(ring, wave);

    const cloud = new THREE.Group();
    const cloudMaterial = new THREE.SpriteMaterial({
      map: this.hazeTexture,
      color: THROWABLES.haze.color,
      opacity: 0,
      transparent: true,
      depthWrite: false,
    });
    for (let index = 0; index < CLOUD_SPRITES; index += 1) {
      cloud.add(new THREE.Sprite(cloudMaterial));
    }
    root.add(cloud);

    return {
      root, orb, trail, trailHistory, trailAttribute, wave, ring, cloud,
      lensMaterial, waveMaterial, cloudMaterial,
      item: null,
      phase: 'idle',
      position: root.position,
      velocity: new THREE.Vector3(),
      age: 0,
      contacts: 0,
      floorOffset: 0,
    };
  }

  throw(id, player) {
    const item = Object.hasOwn(THROWABLES, id) ? THROWABLES[id] : null;
    const slot = this.slots.find(({ phase }) => phase === 'idle');
    const snapshot = player?.snapshot ?? player;
    if (!item || !slot || !snapshot?.eyePosition?.isVector3 || snapshot.alive === false) {
      return false;
    }
    this.angles.set(Number(snapshot.pitch) || 0, Number(snapshot.yaw) || 0, 0);
    this.aim.set(0, 0, -1).applyEuler(this.angles);
    slot.position.copy(snapshot.eyePosition).addScaledVector(SKY, -0.17);
    slot.velocity.copy(this.aim).multiplyScalar(THROW_SPEED).addScaledVector(SKY, 2.35);
    if (snapshot.velocity?.isVector3) slot.velocity.addScaledVector(snapshot.velocity, 0.4);

    slot.item = item;
    slot.phase = 'flight';
    slot.age = 0;
    slot.contacts = 0;
    slot.lensMaterial.color.setHex(item.color);
    slot.trail.material.color.setHex(item.color);
    for (let index = 0; index < TRAIL_POINTS; index += 1) {
      slot.position.toArray(slot.trailHistory, index * 3);
    }
    slot.root.visible = true;
    slot.orb.visible = true;
    slot.trail.visible = true;
    slot.ring.visible = false;
    slot.wave.visible = false;
    slot.cloud.visible = false;
    this.context.events?.emit('audio:play', { name: 'weapon-mechanical', volume: 0.34 });
    return true;
  }

  fixedUpdate(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const [id, stun] of this.stuns) {
      stun.remaining -= dt;
      if (stun.remaining <= 0) {
        this.clearStun(id);
      } else {
        const pulse = Math.sin(stun.remaining * 8);
        stun.marker.position.copy(stun.position).addScaledVector(SKY, 1.98 + pulse * 0.075);
        stun.marker.scale.setScalar(0.32 + pulse * 0.045);
      }
    }
    for (const slot of this.slots) {
      if (slot.phase === 'idle') continue;
      slot.age += dt;
      if (slot.phase === 'flight') this.updateFlight(slot, dt);
      else this.updateField(slot);
    }
  }

  updateFlight(slot, dt) {
    this.next.copy(slot.position)
      .addScaledVector(slot.velocity, dt)
      .addScaledVector(DOWN, 0.5 * GRAVITY * dt * dt);
    this.delta.subVectors(this.next, slot.position);
    const distance = this.delta.length();
    slot.velocity.addScaledVector(DOWN, GRAVITY * dt);
    if (distance > 0.0001) {
      this.delta.multiplyScalar(1 / distance);
      const contact = this.context.physics?.raycast(slot.position, this.delta, distance + ORB_CLEARANCE);
      if (contact) {
        this.normal.copy(contact.normal);
        if (this.normal.dot(this.delta) > 0) this.normal.negate();
        slot.position.copy(contact.point).addScaledVector(this.normal, ORB_CLEARANCE);
        slot.contacts += 1;
        slot.velocity.reflect(this.normal).multiplyScalar(0.39);
        if (slot.contacts >= 2 || contact.target || slot.velocity.lengthSq() < 9) {
          this.deploy(slot);
          return;
        }
      } else {
        slot.position.copy(this.next);
      }
    }
    slot.orb.rotateX(dt * 6.2);
    slot.orb.rotateY(dt * 4.1);
    slot.trailHistory.copyWithin(3, 0, slot.trailHistory.length - 3);
    slot.position.toArray(slot.trailHistory);
    for (let index = 0; index < TRAIL_POINTS; index += 1) {
      const offset = index * 3;
      slot.trailAttribute.setXYZ(index,
        slot.trailHistory[offset] - slot.position.x,
        slot.trailHistory[offset + 1] - slot.position.y,
        slot.trailHistory[offset + 2] - slot.position.z);
    }
    slot.trailAttribute.needsUpdate = true;
    if (slot.position.y < -2.5) this.clearSlot(slot);
    else if (slot.age >= FLIGHT_LIMIT) this.deploy(slot);
  }

  deploy(slot) {
    const { item, position } = slot;
    slot.phase = 'field';
    slot.age = 0;
    slot.orb.visible = false;
    slot.trail.visible = false;
    slot.ring.visible = true;
    slot.wave.visible = item.id !== 'haze';
    slot.cloud.visible = item.id === 'haze';
    slot.waveMaterial.color.setHex(item.color);
    slot.ring.material.color.setHex(item.color);
    const floor = this.context.physics?.raycast(position, DOWN, 5);
    slot.floorOffset = floor && !floor.target ? floor.point.y - position.y : -0.05;

    let affected = 0;
    if (item.id === 'haze') {
      position.y += 0.8;
      slot.floorOffset -= 0.8;
    } else {
      affected = this.applyFieldToEnemies(slot);
    }
    this.updateField(slot);
    this.context.events?.emit('throwable:deployed', { id: item.id, position: position.clone(), affected });
  }

  applyFieldToEnemies(slot) {
    const { item, position } = slot;
    let affected = 0;
    for (const enemy of this.enemies?.snapshot.enemies ?? []) {
      if (!enemy.alive) continue;
      this.target.copy(enemy.position).addScaledVector(SKY, 0.89);
      const distance = this.delta.subVectors(this.target, position).length();
      if (distance >= item.radius) continue;
      this.delta.normalize();
      const hit = this.context.physics?.raycast(position, this.delta, Math.max(0, distance - 0.08));
      if (hit && hit.id !== enemy.id && hit.target?.enemyId !== enemy.id) continue;

      if (item.id === 'pulse') {
        const damage = Math.round(78 - (distance / item.radius) * 43);
        if (!this.enemies.applyDamage(enemy.id, damage, 'torso', this.delta)) continue;
      } else {
        this.stun(enemy);
      }
      affected += 1;
    }
    return affected;
  }

  stun(enemy) {
    const existing = this.stuns.get(enemy.id);
    if (existing) {
      existing.remaining = STASIS_SECONDS;
      return;
    }
    const marker = new THREE.Mesh(this.ringGeometry, this.stasisMaterial);
    marker.rotation.x = -Math.PI * 0.41;
    marker.scale.setScalar(0.32);
    marker.position.copy(enemy.position).addScaledVector(SKY, 1.93);
    this.root.add(marker);
    this.stuns.set(enemy.id, { remaining: STASIS_SECONDS, position: enemy.position, marker });
  }

  updateField(slot) {
    const { item, age } = slot;
    const progress = Math.min(1, age / item.duration);
    if (progress >= 1) {
      this.clearSlot(slot);
      return;
    }

    const expanded = item.id === 'haze'
      ? Math.min(1, 0.14 + age * 3.4)
      : 0.16 + 0.84 * (1 - (1 - progress) ** 2);
    const size = item.radius * expanded;
    slot.ring.position.y = slot.floorOffset + 0.055;
    slot.ring.scale.setScalar(size);
    slot.wave.scale.setScalar(size);
    if (item.id === 'haze') {
      const fade = Math.min(1, age * 6 + 0.08, (1 - progress) * 7);
      slot.ring.material.opacity = fade * 0.28;
      slot.cloudMaterial.opacity = fade * 0.48;
      for (const [index, sprite] of slot.cloud.children.entries()) {
        const angle = index * 2.39996 + age * 0.28;
        const reach = size * (0.25 + (index % 4) * 0.14);
        sprite.position.set(Math.cos(angle) * reach,
          Math.sin(age * 0.91 + index * 1.92) * size * 0.32,
          Math.sin(angle) * reach);
        sprite.scale.setScalar(size * (1.1 + (index % 3) * 0.16));
      }
    } else {
      slot.ring.material.opacity = 0.88 * (1 - progress);
      slot.waveMaterial.opacity = 0.32 * (1 - progress);
    }
  }

  blocksVision(origin, target) {
    this.delta.subVectors(target, origin);
    const lengthSquared = this.delta.lengthSq();
    if (lengthSquared <= 0.0001) return false;
    for (const slot of this.slots) {
      if (slot.phase !== 'field' || slot.item.id !== 'haze') continue;
      const progress = slot.age / slot.item.duration;
      const radius = slot.item.radius
        * Math.min(1, 0.14 + slot.age * 3.4, (1 - progress) * 7);
      this.target.subVectors(slot.position, origin);
      const projection = THREE.MathUtils.clamp(this.target.dot(this.delta) / lengthSquared, 0, 1);
      this.source.copy(origin).addScaledVector(this.delta, projection);
      if (slot.position.distanceToSquared(this.source) < radius ** 2) return true;
    }
    return false;
  }

  isStunned(enemyId) {
    return this.stuns.has(enemyId);
  }

  clearStun(enemyId) {
    this.stuns.get(enemyId)?.marker.removeFromParent();
    this.stuns.delete(enemyId);
  }

  get snapshot() {
    return {
      active: this.slots.filter(({ phase }) => phase !== 'idle').map(({ item, phase, position }) => ({
        id: item.id, phase, position: position.clone(),
      })),
      stunned: [...this.stuns.keys()],
    };
  }

  clearSlot(slot) {
    slot.phase = 'idle';
    slot.item = null;
    slot.root.visible = false;
  }

  reset() {
    for (const slot of this.slots) this.clearSlot(slot);
    for (const id of this.stuns.keys()) this.clearStun(id);
  }

  dispose() {
    this.reset();
    this.offEnemyDeath?.();
    this.root.removeFromParent();
    for (const slot of this.slots) {
      slot.lensMaterial.dispose();
      slot.trail.geometry.dispose();
      slot.trail.material.dispose();
      slot.waveMaterial.dispose();
      slot.ring.material.dispose();
      slot.cloudMaterial.dispose();
    }
    this.coreGeometry.dispose();
    this.ringGeometry.dispose();
    this.waveGeometry.dispose();
    this.hazeTexture.dispose();
    this.shellMaterial.dispose();
    this.stasisMaterial.dispose();
  }
}
