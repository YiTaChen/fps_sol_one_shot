import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createArmoryModel } from '../../src/weapons/ArmoryModels.js';

const WIDTH = 480;
const HEIGHT = 240;
const ORBS = new Set(['pulse', 'haze', 'stasis']);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 40);
const renderer = new THREE.WebGLRenderer({
  antialias: true, alpha: true, preserveDrawingBuffer: true,
});
renderer.setSize(WIDTH, HEIGHT);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.27;

const scene = new THREE.Scene();
const lightRoom = new RoomEnvironment();
const generator = new THREE.PMREMGenerator(renderer);
const environment = generator.fromScene(lightRoom, 0.045);
scene.environment = environment.texture;
scene.environmentIntensity = 1.65;
lightRoom.dispose();
generator.dispose();

function placeLight(color, intensity, position) {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(...position);
  scene.add(light);
}

scene.add(new THREE.HemisphereLight(0xc6d9ff, 0xc6a78a, 1.18));
placeLight(0xffe2be, 3.15, [-3.8, 5.2, -3.0]);
placeLight(0xa9d2ff, 2.65, [2.8, 2.4, 3.6]);
placeLight(0xe9f4ff, 1.05, [-4, 0.2, 2.8]);

function cameraBounds(root) {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverseVisible((object) => {
    if (!object.isMesh) return;
    object.geometry.computeBoundingBox();
    const { min, max } = object.geometry.boundingBox;
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          point.set(x, y, z).applyMatrix4(object.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
          bounds.expandByPoint(point);
        }
      }
    }
  });
  if (bounds.isEmpty()) throw new Error('The armory model contains no visible mesh');
  return bounds;
}

function frameModel(root, id) {
  const orb = ORBS.has(id);
  const reserve = id === 'reserve-case';
  camera.position.set(-5, reserve ? 2.7 : 1.23, reserve ? 4.2 : -1.16);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.rotateZ(orb || reserve ? 0 : -0.075);
  camera.updateMatrixWorld(true);

  const bounds = cameraBounds(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  camera.position.addScaledVector(right, center.x).addScaledVector(up, center.y);
  const aspect = WIDTH / HEIGHT;
  const halfHeight = Math.max(size.y / (orb ? 1.2 : 1.57), size.x / (1.77 * aspect));
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.bottom = -halfHeight;
  camera.top = halfHeight;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function render(id) {
  const { root, dispose } = createArmoryModel(id);
  const stand = new THREE.Group();
  stand.add(root);
  if (ORBS.has(id)) stand.rotation.set(0.18, 0.32, 0.22);
  scene.add(stand);
  try {
    frameModel(stand, id);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/webp', 0.92);
  } finally {
    stand.removeFromParent();
    dispose();
  }
}

window.renderArmoryCard = render;
