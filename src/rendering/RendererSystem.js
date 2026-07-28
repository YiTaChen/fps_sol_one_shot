import * as THREE from "three";
import { resolveQuality } from "../core/Quality.js";

const _viewport = new THREE.Vector2();

function createSky() {
  const geometry = new THREE.SphereGeometry(190, 32, 18);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3f6f89) },
      horizonColor: { value: new THREE.Color(0xd2b58b) },
      groundColor: { value: new THREE.Color(0x6d665a) },
      sunDirection: {
        value: new THREE.Vector3(-0.42, 0.69, -0.58).normalize(),
      },
      sunColor: { value: new THREE.Color(0xffe6b6) },
    },
    vertexShader: `
      varying vec3 vWorldDirection;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vWorldDirection;
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 groundColor;
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      void main() {
        vec3 direction = normalize(vWorldDirection);
        float up = direction.y;
        float horizon = pow(1.0 - abs(up), 4.0);
        vec3 base = mix(groundColor, topColor, smoothstep(-0.12, 0.82, up));
        base = mix(base, horizonColor, horizon * 0.72);
        float sun = pow(max(dot(direction, sunDirection), 0.0), 1100.0);
        float halo = pow(max(dot(direction, sunDirection), 0.0), 24.0);
        base += sunColor * (sun * 2.4 + halo * 0.14);
        float haze = smoothstep(-0.06, 0.14, up) * (1.0 - smoothstep(0.14, 0.6, up));
        base += vec3(0.12, 0.09, 0.055) * haze;
        gl_FragColor = vec4(base, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.name = "AtmosphericSky";
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  return sky;
}

function createSunLens() {
  const group = new THREE.Group();
  group.name = "DistantSun";
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe8bd,
    fog: false,
    toneMapped: false,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  const sun = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), sunMaterial);
  sun.position.set(-63, 96, -88);
  sun.lookAt(0, 0, 0);
  group.add(sun);
  return group;
}

export class RendererSystem {
  constructor(container, qualityName = "high") {
    this.container = container;
    this.quality = resolveQuality(qualityName);
    this.scene = new THREE.Scene();
    this.scene.name = "CinderlineWorld";
    this.viewScene = new THREE.Scene();
    this.viewScene.name = "CinderlineViewmodel";
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.04, 230);
    this.camera.rotation.order = "YXZ";
    this.camera.position.set(0, 1.68, 18);
    this.viewCamera = new THREE.PerspectiveCamera(58, 1, 0.01, 7);
    this.viewCamera.rotation.order = "YXZ";
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    const gl = this.renderer.getContext();
    if (!(gl instanceof WebGL2RenderingContext)) {
      throw new Error("Cinderline requires a WebGL2-capable browser.");
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.renderer.domElement.id = "game-canvas";
    this.renderer.domElement.tabIndex = 0;
    this.container.appendChild(this.renderer.domElement);
    this.worldRoot = new THREE.Group();
    this.worldRoot.name = "WorldRoot";
    this.scene.add(this.worldRoot);
    this.installAtmosphere();
    this.applyQuality(qualityName);
    this.resize();
  }

  installAtmosphere() {
    this.scene.background = new THREE.Color(0x8aa4a8);
    this.scene.fog = new THREE.FogExp2(0x9caaa3, 0.0108);
    this.sky = createSky();
    this.scene.add(this.sky);
    this.sunLens = createSunLens();
    this.scene.add(this.sunLens);

    this.hemi = new THREE.HemisphereLight(0xc5d9df, 0x4f4437, 1.55);
    this.hemi.name = "SkyFill";
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffdfad, 3.2);
    this.sun.name = "SunKey";
    this.sun.position.set(-38, 52, 31);
    this.sun.target.position.set(4, 0, -8);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -58;
    this.sun.shadow.camera.right = 58;
    this.sun.shadow.camera.top = 58;
    this.sun.shadow.camera.bottom = -58;
    this.sun.shadow.camera.near = 3;
    this.sun.shadow.camera.far = 130;
    this.sun.shadow.bias = -0.00014;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun, this.sun.target);

    this.warmBounce = new THREE.DirectionalLight(0xd18d5a, 0.38);
    this.warmBounce.position.set(31, 12, -24);
    this.scene.add(this.warmBounce);

    this.coolFill = new THREE.DirectionalLight(0x87b7ca, 0.24);
    this.coolFill.position.set(-20, 18, -25);
    this.scene.add(this.coolFill);

    const viewKey = new THREE.DirectionalLight(0xffdfbd, 2.8);
    viewKey.position.set(-2, 4, 3);
    const viewFill = new THREE.HemisphereLight(0xc7d9e0, 0x5b3e2c, 1.5);
    this.viewScene.add(viewKey, viewFill);
  }

  applyQuality(name) {
    this.quality = resolveQuality(name);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.quality.dpr),
    );
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.sun.shadow.mapSize.set(
      this.quality.shadowMap,
      this.quality.shadowMap,
    );
    this.scene.fog.density = 2.25 / this.quality.fogFar;
    this.resize();
    return this.quality;
  }

  resize(width = this.container.clientWidth, height = this.container.clientHeight) {
    const safeWidth = Math.max(1, Math.floor(width * this.quality.renderScale));
    const safeHeight = Math.max(1, Math.floor(height * this.quality.renderScale));
    this.renderer.setSize(safeWidth, safeHeight, false);
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
    const aspect = safeWidth / safeHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = aspect;
    this.viewCamera.updateProjectionMatrix();
    this.renderer.getDrawingBufferSize(_viewport);
    return { width: _viewport.x, height: _viewport.y };
  }

  render() {
    this.sky.position.copy(this.camera.position);
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.viewScene, this.viewCamera);
  }

  prewarm() {
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.viewScene, this.viewCamera);
  }

  dispose() {
    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : [];
      for (const material of materials) material.dispose();
    });
    this.viewScene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : [];
      for (const material of materials) material.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export default RendererSystem;

