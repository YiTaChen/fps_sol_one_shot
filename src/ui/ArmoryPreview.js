import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { WEAPON_DEFINITIONS } from '../weapons/Arsenal.js';
import { createArmoryModel } from '../weapons/ArmoryModels.js';
import { THROWABLES } from '../weapons/Throwables.js';

const ROTATION_STEP = Math.PI / 12;
const DRAG_SENSITIVITY = 0.011;
const MAX_PITCH = 0.86;
const ZOOM_INCREMENT = 1.17;
const MAX_ZOOM_STEPS = 5;
export const ARMORY_CAMERA_DIRECTION = new THREE.Vector3(0, 0.13, 1).normalize();
const CAMERA_DIRECTION = ARMORY_CAMERA_DIRECTION;
const CAMERA_UP = new THREE.Vector3(0, CAMERA_DIRECTION.z, -CAMERA_DIRECTION.y);

function itemLabel(id) {
  if (Object.hasOwn(WEAPON_DEFINITIONS, id)) return WEAPON_DEFINITIONS[id].name;
  if (Object.hasOwn(THROWABLES, id)) return THROWABLES[id].label;
  return id === 'reserve-case' ? 'Reserve Case' : '';
}

function directionalLight(scene, color, intensity, x, y, z) {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(x, y, z);
  scene.add(light);
}

export function configureArmoryRenderer(renderer) {
  renderer.setClearColor(0x0e1720, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
}

export function lightArmoryScene(scene) {
  scene.environmentIntensity = 1.08;
  scene.add(new THREE.HemisphereLight(0xddeaff, 0x67534b, 0.78));
  directionalLight(scene, 0xffe5ca, 2.85, -3.1, 4.6, 2.8);
  directionalLight(scene, 0xc3dcef, 0.74, 3.5, 0.8, 1.4);
  directionalLight(scene, 0xa1c9e6, 2.6, 0.6, 2.0, -3.8);
}

export function createArmoryEnvironment(renderer) {
  const room = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    return generator.fromScene(room, 0.045);
  } finally {
    generator.dispose();
    room.dispose();
  }
}

export function setArmoryHomeRotation(rotation, id) {
  if (id === 'reserve-case') rotation.set(0.44, -0.36, 0, 'YXZ');
  else if (Object.hasOwn(THROWABLES, id)) rotation.set(0.25, 0.62, 0, 'YXZ');
  else rotation.set(0.13, 1.32, -0.055, 'YXZ');
}

export function armoryBoundsCorners(root) {
  const corners = [];
  root.updateMatrixWorld(true);
  root.traverseVisible((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          corners.push(new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld));
        }
      }
    }
  });
  return corners;
}

/** A single lazy turntable that uses the same mesh construction as the game. */
export class ArmoryPreview {
  constructor(container, { onUnavailable, onAvailable } = {}) {
    this.container = container;
    this.window = container.ownerDocument.defaultView;
    this.onUnavailable = onUnavailable;
    this.onAvailable = onAvailable;
    this.abort = new this.window.AbortController();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.06, 30);
    this.pivot = new THREE.Group();
    this.pivot.rotation.order = 'YXZ';
    this.homeRotation = new THREE.Quaternion();
    this.boundsCorners = [];
    this.fitPoint = new THREE.Vector3();
    this.scene.add(this.pivot);
    lightArmoryScene(this.scene);

    this.renderer = null;
    this.canvas = null;
    this.environment = null;
    this.observer = null;
    this.model = null;
    this.id = null;
    this.frame = 0;
    this.drag = null;
    this.active = false;
    this.failed = false;
    this.contextLost = false;
    this.disposed = false;
    this.width = 0;
    this.height = 0;
    this.pixelRatio = 1;
    this.zoomSteps = 0;
  }

  show(id) {
    if (this.disposed) return false;
    const label = itemLabel(id);
    if (!label || !this.ensureRenderer()) {
      this.hide();
      return false;
    }

    if (id !== this.id) {
      const model = createArmoryModel(id);
      if (!model) {
        this.hide();
        return false;
      }
      const corners = armoryBoundsCorners(model.root);
      const bounds = new THREE.Box3().setFromPoints(corners);
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      if (bounds.isEmpty() || !Number.isFinite(sphere.radius) || sphere.radius <= 0) {
        model.dispose();
        this.hide();
        return false;
      }
      this.model?.dispose();
      this.model = model;
      this.id = id;
      this.model.root.position.sub(sphere.center);
      this.pivot.scale.setScalar(1 / sphere.radius);
      this.pivot.add(this.model.root);
      this.boundsCorners = corners;
      for (const corner of corners) corner.sub(sphere.center).multiplyScalar(1 / sphere.radius);
      this.resetView();
    }
    this.active = true;
    this.canvas.hidden = this.contextLost;
    this.canvas.style.display = this.contextLost ? 'none' : 'block';
    this.canvas.setAttribute('aria-label',
      `3D model of ${label}. Use arrow keys to rotate, plus or minus to zoom, and Home to reset.`);
    this.queueRender();
    return !this.contextLost;
  }

  hide() {
    this.active = false;
    this.stopDrag();
    if (this.frame) this.window.cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.canvas) {
      this.canvas.hidden = true;
      this.canvas.style.display = 'none';
    }
  }

  rotate(horizontal, vertical = 0) {
    if (this.disposed || !this.model) return;
    this.pivot.rotation.y = (this.pivot.rotation.y + horizontal) % (Math.PI * 2);
    this.pivot.rotation.x = THREE.MathUtils.clamp(
      this.pivot.rotation.x + vertical, -MAX_PITCH, MAX_PITCH,
    );
    this.queueRender();
  }

  resetView() {
    setArmoryHomeRotation(this.pivot.rotation, this.id);
    this.homeRotation.copy(this.pivot.quaternion);
    this.zoomSteps = 0;
    this.queueRender();
  }

  zoom(steps) {
    if (!this.disposed && this.model && Number.isFinite(steps)) {
      this.zoomSteps = THREE.MathUtils.clamp(this.zoomSteps + steps, 0, MAX_ZOOM_STEPS);
      this.queueRender();
    }
    return ZOOM_INCREMENT ** this.zoomSteps;
  }

  ensureRenderer() {
    if (this.failed) return false;
    if (this.renderer) return true;
    const canvas = this.container.ownerDocument.createElement('canvas');
    canvas.className = 'cl-armory-preview-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Home');
    Object.assign(canvas.style, {
      display: 'none', width: '100%', height: '100%', touchAction: 'none', cursor: 'grab',
    });
    this.canvas = canvas;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas, antialias: true, alpha: true, stencil: false, powerPreference: 'default',
      });
      configureArmoryRenderer(this.renderer);
      this.bakeEnvironment();
    } catch (error) {
      this.environment?.dispose();
      this.environment = null;
      this.scene.environment = null;
      this.renderer?.dispose();
      this.renderer?.forceContextLoss();
      this.renderer = null;
      this.canvas = null;
      this.failed = true;
      this.onUnavailable?.(error);
      return false;
    }

    this.installInput();
    this.container.append(canvas);
    if (this.window.ResizeObserver) {
      this.observer = new this.window.ResizeObserver(() => this.queueRender());
      this.observer.observe(this.container);
    } else {
      this.window.addEventListener('resize', () => this.queueRender(), { signal: this.abort.signal });
    }
    return true;
  }

  bakeEnvironment() {
    const next = createArmoryEnvironment(this.renderer);
    this.environment?.dispose();
    this.environment = next;
    this.scene.environment = next.texture;
  }

  installInput() {
    const options = { signal: this.abort.signal };
    const { canvas } = this;
    canvas.addEventListener('pointerdown', (event) => {
      if (!this.active || this.drag || event.button !== 0) return;
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
    }, options);
    canvas.addEventListener('pointermove', (event) => {
      if (this.drag?.id !== event.pointerId) return;
      this.rotate(
        (event.clientX - this.drag.x) * DRAG_SENSITIVITY,
        (event.clientY - this.drag.y) * DRAG_SENSITIVITY,
      );
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
    }, options);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, (event) => {
        if (this.drag?.id === event.pointerId) this.stopDrag();
      }, options);
    }
    canvas.addEventListener('wheel', (event) => {
      if (!this.active || this.container.ownerDocument.activeElement !== canvas || !event.deltaY || event.ctrlKey) return;
      this.zoom(-Math.sign(event.deltaY));
      event.preventDefault();
    }, { ...options, passive: false });
    canvas.addEventListener('keydown', (event) => {
      const yaw = event.key === 'ArrowLeft' ? -ROTATION_STEP
        : event.key === 'ArrowRight' ? ROTATION_STEP : 0;
      const pitch = event.key === 'ArrowUp' ? -ROTATION_STEP
        : event.key === 'ArrowDown' ? ROTATION_STEP : 0;
      if (event.key === 'Home') this.resetView();
      else if (event.key === '+' || event.key === '=') this.zoom(1);
      else if (event.key === '-') this.zoom(-1);
      else if (yaw || pitch) this.rotate(yaw, pitch);
      else return;
      event.preventDefault();
      event.stopPropagation();
    }, options);
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.stopDrag();
      canvas.hidden = true;
      canvas.style.display = 'none';
      this.onUnavailable?.();
    }, options);
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.bakeEnvironment();
        this.contextLost = false;
        if (this.active) {
          canvas.hidden = false;
          canvas.style.display = 'block';
          this.onAvailable?.();
          this.queueRender();
        }
      } catch (error) {
        this.onUnavailable?.(error);
      }
    }, options);
  }

  stopDrag() {
    if (!this.drag || !this.canvas) return;
    const { id } = this.drag;
    this.drag = null;
    if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    this.canvas.style.cursor = 'grab';
  }

  queueRender() {
    if (this.frame || !this.active || this.contextLost || this.disposed) return;
    this.frame = this.window.requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  render() {
    if (!this.active || this.contextLost || !this.model || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 2 || height < 2) return;

    const pixelRatio = Math.min(Math.max(this.window.devicePixelRatio || 1, 1.5), 2,
      Math.sqrt((960 * 680) / (width * height)));
    if (width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio) {
      this.width = width;
      this.height = height;
      this.pixelRatio = pixelRatio;
      this.renderer.setPixelRatio(pixelRatio);
      this.renderer.setSize(width, height, false);
      this.camera.setViewOffset(width, height, 0, Math.min(8, height * 0.05), width, height);
    }
    const vertical = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    const horizontal = vertical * this.camera.aspect;
    const safeHeight = THREE.MathUtils.clamp(1 - 48 / height, 0.45, 0.86);
    const preferred = this.fitDistance(this.homeRotation, horizontal * 0.78, vertical * Math.min(0.78, safeHeight));
    const unclipped = this.fitDistance(this.pivot.quaternion, horizontal * 0.93, vertical * safeHeight);
    this.camera.position.copy(CAMERA_DIRECTION).multiplyScalar(Math.max(preferred, unclipped));
    this.camera.lookAt(0, 0, 0);
    const zoom = ZOOM_INCREMENT ** this.zoomSteps;
    if (this.camera.zoom !== zoom) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, this.camera);
  }

  fitDistance(rotation, horizontal, vertical) {
    let distance = 1.08;
    for (const corner of this.boundsCorners) {
      const point = this.fitPoint.copy(corner).applyQuaternion(rotation);
      const depth = point.dot(CAMERA_DIRECTION);
      const inset = Math.max(Math.abs(point.x) / horizontal, Math.abs(point.dot(CAMERA_UP)) / vertical);
      distance = Math.max(distance, depth + inset);
    }
    return distance;
  }

  dispose() {
    if (this.disposed) return;
    this.hide();
    this.disposed = true;
    this.abort.abort();
    this.observer?.disconnect();
    this.model?.dispose();
    this.environment?.dispose();
    this.scene.environment = null;
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.canvas?.remove();
    this.model = null;
    this.environment = null;
    this.renderer = null;
    this.canvas = null;
  }
}
