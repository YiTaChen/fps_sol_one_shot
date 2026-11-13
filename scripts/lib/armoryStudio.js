import * as THREE from 'three';
import {
  ARMORY_CAMERA_DIRECTION, armoryBoundsCorners, configureArmoryRenderer, createArmoryEnvironment,
  lightArmoryScene, setArmoryHomeRotation,
} from '../../src/ui/ArmoryPreview.js';
import { createArmoryModel } from '../../src/weapons/ArmoryModels.js';

const WIDTH = 480;
const HEIGHT = 240;
const ORBS = new Set(['pulse', 'haze', 'stasis']);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 40);
const renderer = new THREE.WebGLRenderer({
  antialias: true, alpha: true, preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1.5);
renderer.setSize(WIDTH, HEIGHT);
configureArmoryRenderer(renderer);
const card = document.createElement('canvas');
card.width = WIDTH;
card.height = HEIGHT;
const context = card.getContext('2d');
context.imageSmoothingQuality = 'high';

const scene = new THREE.Scene();
const environment = createArmoryEnvironment(renderer);
scene.environment = environment.texture;
lightArmoryScene(scene);

function cameraBounds(root) {
  const bounds = new THREE.Box3();
  for (const corner of armoryBoundsCorners(root)) {
    bounds.expandByPoint(corner.applyMatrix4(camera.matrixWorldInverse));
  }
  if (bounds.isEmpty()) throw new Error('The armory model contains no visible mesh');
  return bounds;
}

function frameModel(root, id) {
  const orb = ORBS.has(id);
  camera.position.copy(ARMORY_CAMERA_DIRECTION).multiplyScalar(5);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  const bounds = cameraBounds(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  camera.position.addScaledVector(right, center.x).addScaledVector(up, center.y);
  const aspect = WIDTH / HEIGHT;
  const halfHeight = Math.max(size.y / (orb ? 1.25 : 1.68), size.x / (1.8 * aspect));
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
  setArmoryHomeRotation(stand.rotation, id);
  scene.add(stand);
  try {
    frameModel(stand, id);
    renderer.render(scene, camera);
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.drawImage(renderer.domElement, 0, 0, WIDTH, HEIGHT);
    return card.toDataURL('image/webp', 0.94);
  } finally {
    stand.removeFromParent();
    dispose();
  }
}

window.renderArmoryCard = render;
