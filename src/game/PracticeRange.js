import * as THREE from "three";

export const RANGE_SPAWN = {
  position: new THREE.Vector3(-38, 0.02, 28),
  yaw: -Math.PI / 2,
};

const TARGETS = [
  { distance: 6, lane: -2.3 },
  { distance: 13, lane: 0 },
  { distance: 20, lane: 2.3 },
];
const RESPAWN_SECONDS = 0.9;
const LANE_HEIGHT = 1.37;

function laneLabel(distance) {
  if (!globalThis.document) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#202c32";
  context.fillRect(0, 0, 192, 64);
  context.fillStyle = "#e2ad62";
  context.fillRect(0, 0, 10, 64);
  context.fillStyle = "#f1e5d0";
  context.font = "bold 42px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`${distance} M`, 102, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
}

export class PracticeRange {
  constructor({ scene, physics }) {
    this.physics = physics;
    this.root = new THREE.Group();
    this.root.name = "practice-range";
    this.root.visible = false;
    scene.add(this.root);
    this.stand = new THREE.BoxGeometry(0.12, 1.25, 0.12);
    this.plate = new THREE.CylinderGeometry(0.37, 0.37, 0.08, 32);
    this.ring = new THREE.RingGeometry(0.22, 0.27, 32);
    this.center = new THREE.CircleGeometry(0.105, 24);
    this.rail = new THREE.BoxGeometry(0.09, 0.022, 6.2);
    this.label = new THREE.PlaneGeometry(0.52, 0.175);
    this.metal = new THREE.MeshStandardMaterial({ color: 0x48575d, metalness: 0.42, roughness: 0.56 });
    this.face = new THREE.MeshBasicMaterial({ color: 0xffd48f, side: THREE.DoubleSide });
    this.line = new THREE.MeshBasicMaterial({ color: 0xe9ae57 });
    const rail = new THREE.Mesh(this.rail, this.line);
    rail.position.set(RANGE_SPAWN.position.x + 0.6, 0.06, RANGE_SPAWN.position.z);
    this.root.add(rail);
    this.targets = TARGETS.map(({ distance, lane }, index) => {
      const position = new THREE.Vector3(RANGE_SPAWN.position.x + distance, LANE_HEIGHT, RANGE_SPAWN.position.z + lane);
      const foot = new THREE.Mesh(this.stand, this.metal);
      foot.position.copy(position).setY(0.65);
      this.root.add(foot);
      const disk = new THREE.Mesh(this.plate, this.metal);
      disk.rotation.z = Math.PI / 2;
      disk.position.copy(position);
      this.root.add(disk);
      const labelMaterial = laneLabel(distance);
      if (labelMaterial) {
        const plaque = new THREE.Mesh(this.label, labelMaterial);
        plaque.rotation.y = -Math.PI / 2;
        plaque.position.copy(position).add(new THREE.Vector3(-0.076, -0.54, 0));
        this.root.add(plaque);
      }
      for (const geometry of [this.ring, this.center]) {
        const marker = new THREE.Mesh(geometry, this.face);
        marker.rotation.x = Math.PI / 2;
        marker.position.y = 0.042;
        disk.add(marker);
      }
      const extent = new THREE.Vector3(0.04, 0.37, 0.37);
      const bounds = new THREE.Box3(position.clone().sub(extent), position.clone().add(extent));
      return { id: `range:${index}`, disk, position, bounds, labelMaterial, distance, cooldown: 0 };
    });
    this.state = {};
    this.unregister = [];
    this.active = false;
    this.reset();
  }

  start() {
    this.stop();
    this.reset();
    this.active = true;
    this.root.visible = true;
    for (const target of this.targets) {
      this.unregister.push(this.physics.registerDynamic(target.id, {
        rangeTarget: target.id,
        material: "metal",
        object: target.disk,
        get active() { return target.cooldown === 0; },
        getBounds(box) {
          return box.copy(target.bounds);
        },
        hitZoneAt(point) {
          const radius = Math.hypot(point.y - target.position.y, point.z - target.position.z);
          return radius <= 0.105 ? "center" : radius <= 0.37 ? "plate" : "edge";
        },
      }));
    }
  }

  stop() {
    for (const unregister of this.unregister) unregister();
    this.unregister.length = 0;
    this.root.visible = false;
    this.active = false;
  }

  reset() {
    Object.assign(this.state, { shots: 0, hits: 0, centers: 0, streak: 0, best: 0, last: "" });
    for (const target of this.targets) {
      target.cooldown = 0;
      target.disk.rotation.x = 0;
      target.disk.children.forEach((marker) => { marker.visible = true; });
    }
  }

  fire() {
    this.state.shots += 1;
  }

  miss(owner) {
    if (!this.active || owner !== "player") return;
    this.state.streak = 0;
    this.state.last = "Miss · Line up the next plate.";
  }

  impact(event) {
    if (!this.active || event.owner !== "player" || event.kind === "melee") return false;
    const target = this.targets.find(({ id }) => id === event.target?.rangeTarget);
    if (!target || target.cooldown || event.hitZone === "edge") {
      if (!event.penetrated && !event.ricocheted) this.miss(event.owner);
      return false;
    }
    const center = event.hitZone === "center";
    target.cooldown = RESPAWN_SECONDS;
    this.state.hits += 1;
    this.state.streak += 1;
    this.state.best = Math.max(this.state.streak, this.state.best);
    if (center) this.state.centers += 1;
    this.state.last = center ? `Center hit · ${target.distance} m lane` : `Plate hit · ${target.distance} m lane`;
    return true;
  }

  update(dt) {
    for (const target of this.targets) {
      target.cooldown = Math.max(0, target.cooldown - dt);
      const angle = target.cooldown > 0 ? Math.sin(Math.PI * target.cooldown / RESPAWN_SECONDS) : 0;
      target.disk.rotation.x = angle * 0.90;
      target.disk.children.forEach((marker) => { marker.visible = target.cooldown === 0; });
    }
  }

  dispose() {
    this.stop();
    this.root.removeFromParent();
    for (const { labelMaterial } of this.targets) {
      labelMaterial?.map.dispose();
      labelMaterial?.dispose();
    }
    for (const resource of [this.stand, this.plate, this.ring, this.center, this.rail, this.label, this.metal, this.face, this.line]) {
      resource.dispose();
    }
  }
}
