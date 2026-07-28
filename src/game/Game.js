import * as THREE from "three";
import {
  Diagnostics,
  EventBus,
  FixedClock,
  InputManager,
  RngService,
} from "../core/index.js";
import { PhysicsWorld } from "../physics/index.js";
import { RendererSystem } from "../rendering/index.js";

function makeFoundationMaterial(rng) {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const grain = rng.int(-11, 12);
      const seam = x % 32 < 2 || y % 32 < 2 ? -17 : 0;
      pixels[index] = 102 + grain + seam;
      pixels[index + 1] = 98 + grain + seam;
      pixels[index + 2] = 89 + grain + seam;
      pixels[index + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(
    pixels,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(16, 16);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map,
    color: 0xa7a39b,
    roughness: 0.88,
    metalness: 0.02,
  });
}

export class Game {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.events = new EventBus();
    this.rng = new RngService(options.seed ?? 0xc1de71e);
    this.clock = new FixedClock(1 / 60);
    this.diagnostics = new Diagnostics();
    this.physics = new PhysicsWorld();
    this.rendering = new RendererSystem(
      container,
      options.quality || "high",
    );
    this.input = new InputManager(this.rendering.renderer.domElement, this.events);
    this.state = {
      phase: "menu",
      kills: 0,
      requiredKills: 6,
      elapsed: 0,
      seed: this.rng.seed,
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
      input: this.input,
      quality: this.rendering.quality,
      physics: this.physics,
      assets: new Map(),
      state: this.state,
      diagnostics: this.diagnostics,
    };
    this.abort = new AbortController();
    this.running = false;
    this.raf = 0;
    this.createFoundationFrame();
    this.createFoundationMenu();
    this.installLifecycle();
    this.exposeTestInterface();
  }

  createFoundationFrame() {
    const root = new THREE.Group();
    root.name = "FoundationFrame";
    const groundMaterial = makeFoundationMaterial(
      this.rng.stream("materials"),
    );
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100, 1, 1),
      groundMaterial,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    root.add(ground);
    this.physics.addStatic({
      min: new THREE.Vector3(-50, -1, -50),
      max: new THREE.Vector3(50, 0, 50),
      material: "concrete",
      object: ground,
    });

    const silhouetteMaterial = new THREE.MeshStandardMaterial({
      color: 0x695f52,
      roughness: 0.92,
    });
    const skylineGeometry = new THREE.BoxGeometry(1, 1, 1);
    const skyline = new THREE.InstancedMesh(
      skylineGeometry,
      silhouetteMaterial,
      28,
    );
    const matrix = new THREE.Matrix4();
    const rng = this.rng.stream("world-layout");
    for (let i = 0; i < skyline.count; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -46 + Math.floor(i / 2) * 7;
      const width = rng.range(6, 10);
      const depth = rng.range(4, 7);
      const height = rng.range(5, 13);
      matrix.compose(
        new THREE.Vector3(side * rng.range(28, 40), height * 0.5, z),
        new THREE.Quaternion(),
        new THREE.Vector3(width, height, depth),
      );
      skyline.setMatrixAt(i, matrix);
    }
    skyline.castShadow = true;
    skyline.receiveShadow = true;
    root.add(skyline);
    this.rendering.worldRoot.add(root);
    this.foundationRoot = root;
    this.rendering.camera.position.set(0, 1.72, 18);
    this.rendering.camera.lookAt(0, 2.8, -20);
  }

  createFoundationMenu() {
    this.menu = document.createElement("section");
    this.menu.className = "foundation-menu";
    this.menu.innerHTML = `
      <div class="foundation-menu__frame">
        <p class="foundation-menu__eyebrow">TACTICAL INCIDENT // 06:40</p>
        <h1>CINDERLINE</h1>
        <p class="foundation-menu__sub">ONE SHOT</p>
        <p class="foundation-menu__brief">
          Break the blockade. Clear six hostiles from the Kestrel market district.
        </p>
        <button type="button" data-action="start">ENTER THE DISTRICT</button>
        <p class="foundation-menu__controls">
          WASD MOVE · MOUSE AIM · LMB FIRE · RMB ADS · R RELOAD · SHIFT SPRINT<br>
          CTRL/C CROUCH &amp; SLIDE · SPACE JUMP/MANTLE · Q/E LEAN · ESC PAUSE
        </p>
        <p class="foundation-menu__status">SYSTEMS INITIALIZED · WEBGL2</p>
      </div>
    `;
    const style = document.createElement("style");
    style.dataset.foundation = "true";
    style.textContent = `
      .foundation-menu{position:fixed;inset:0;display:grid;place-items:center;
        background:linear-gradient(90deg,rgba(5,9,10,.94) 0 37%,rgba(5,9,10,.32) 70%,rgba(5,9,10,.62));
        z-index:10;letter-spacing:.04em}
      .foundation-menu__frame{position:absolute;left:8vw;top:50%;width:min(580px,80vw);
        transform:translateY(-50%);border-left:3px solid #e7a34c;padding:2rem 2.3rem;
        background:linear-gradient(90deg,rgba(9,14,15,.78),transparent)}
      .foundation-menu__eyebrow,.foundation-menu__status{font-size:.72rem;color:#d6a461;
        letter-spacing:.28em}
      .foundation-menu h1{font-size:clamp(3.8rem,8vw,7.7rem);font-weight:850;line-height:.82;
        letter-spacing:-.065em;margin:1.2rem 0 0;text-shadow:0 3px 30px rgba(0,0,0,.65)}
      .foundation-menu__sub{font-size:1rem;letter-spacing:.65em;margin:.8rem 0 2rem;color:#bcc7c2}
      .foundation-menu__brief{max-width:42ch;color:#c7cfca;line-height:1.65}
      .foundation-menu button{margin:1.5rem 0;padding:1rem 1.4rem;border:1px solid #e7a34c;
        color:#101211;background:#e7a34c;font-weight:800;letter-spacing:.12em;cursor:pointer}
      .foundation-menu button:hover{background:#ffd493}
      .foundation-menu__controls{font-size:.66rem;line-height:1.8;color:#9ea9a2}
      .foundation-menu__status{margin-top:2.2rem;color:#728078}
    `;
    document.head.appendChild(style);
    this.foundationStyle = style;
    this.container.appendChild(this.menu);
    const button = this.menu.querySelector('[data-action="start"]');
    button.addEventListener("click", () => this.startMatch(), {
      signal: this.abort.signal,
    });
  }

  installLifecycle() {
    window.addEventListener("resize", () => {
      this.rendering.resize();
      this.events.emit("render:resize", {});
    }, { signal: this.abort.signal });
    this.events.on("input:pointer-lock", ({ locked }) => {
      if (!locked && this.state.phase === "playing") {
        this.pause();
      }
    });
    window.addEventListener("error", (event) => {
      this.diagnostics.recordError(event.error || event.message);
    }, { signal: this.abort.signal });
    window.addEventListener("unhandledrejection", (event) => {
      this.diagnostics.recordError(event.reason);
    }, { signal: this.abort.signal });
  }

  startMatch() {
    this.state.phase = "playing";
    this.menu.hidden = true;
    this.clock.clearAccumulator();
    this.events.emit("game:start", { seed: this.state.seed });
    if (!this.options.capture) this.input.requestPointerLock();
  }

  pause() {
    if (this.state.phase !== "playing") return;
    this.state.phase = "paused";
    this.input.reset();
    this.clock.clearAccumulator();
    this.menu.hidden = false;
    const heading = this.menu.querySelector("h1");
    heading.textContent = "PAUSED";
    this.menu.querySelector('[data-action="start"]').textContent = "RESUME";
    this.events.emit("game:pause", {});
  }

  resume() {
    if (this.state.phase !== "paused") return;
    this.state.phase = "playing";
    this.menu.hidden = true;
    this.clock.clearAccumulator();
    this.events.emit("game:resume", {});
    if (!this.options.capture) this.input.requestPointerLock();
  }

  fixedUpdate(dt) {
    this.state.elapsed += dt;
    if (this.state.phase !== "playing") return;
    const speed = this.input.isDown("ShiftLeft") ? 7.5 : 4.2;
    const local = new THREE.Vector3(
      Number(this.input.isDown("KeyD")) - Number(this.input.isDown("KeyA")),
      0,
      Number(this.input.isDown("KeyS")) - Number(this.input.isDown("KeyW")),
    );
    if (local.lengthSq() > 0) {
      local.normalize().multiplyScalar(speed * dt);
      local.applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.rendering.camera.rotation.y,
      );
      this.rendering.camera.position.add(local);
    }
    const look = this.input.consumeLook();
    this.rendering.camera.rotation.y -= look.x * 0.0018;
    this.rendering.camera.rotation.x = THREE.MathUtils.clamp(
      this.rendering.camera.rotation.x - look.y * 0.0016,
      -1.35,
      1.35,
    );
  }

  update(frame, alpha) {
    this.diagnostics.recordFrame(frame);
    this.diagnostics.rendererInfo = {
      memory: { ...this.rendering.renderer.info.memory },
      render: { ...this.rendering.renderer.info.render },
    };
    this.rendering.render(alpha);
    this.input.endFrame();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.reset();
    const loop = (timestamp) => {
      if (!this.running) return;
      const frame = this.clock.tick(
        timestamp * 0.001,
        (dt) => this.fixedUpdate(dt),
      );
      this.update(frame.frame, frame.alpha);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  exposeTestInterface() {
    if (!this.options.test) return;
    window.__FPS_TEST__ = Object.freeze({
      version: 1,
      ready: () => true,
      state: () => ({ ...this.state }),
      diagnostics: () => this.diagnostics.snapshot(),
      start: () => this.startMatch(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      resize: (width, height) => this.rendering.resize(width, height),
      captureReady: () => new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))),
    });
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.input.dispose();
    this.physics.dispose();
    this.rendering.dispose();
    this.foundationStyle?.remove();
    this.menu?.remove();
    this.events.clear();
    delete window.__FPS_TEST__;
  }
}

export default Game;

