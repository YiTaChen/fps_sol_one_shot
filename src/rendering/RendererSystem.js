import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
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
    this.renderer.toneMappingExposure = 1.12;
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
    this.installPostProcessing();
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

    this.hemi = new THREE.HemisphereLight(0xcfe3e8, 0x75624d, 2.15);
    this.hemi.name = "SkyFill";
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffdfad, 2.75);
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

    this.warmBounce = new THREE.DirectionalLight(0xe6a76f, 0.62);
    this.warmBounce.position.set(31, 12, -24);
    this.scene.add(this.warmBounce);

    this.coolFill = new THREE.DirectionalLight(0x9ccfe0, 0.72);
    this.coolFill.position.set(-20, 18, -25);
    this.scene.add(this.coolFill);

    const viewKey = new THREE.DirectionalLight(0xffe4c4, 4.6);
    viewKey.position.set(-2.4, 3.6, 4.2);
    const viewFill = new THREE.HemisphereLight(0xd8edf2, 0x78614d, 2.35);
    const viewRim = new THREE.DirectionalLight(0x8fcfe6, 2.1);
    viewRim.position.set(3.2, 1.4, -2.8);
    const viewBounce = new THREE.DirectionalLight(0xf0a86c, 1.15);
    viewBounce.position.set(2.2, -1.1, 2.6);
    const viewAmbient = new THREE.AmbientLight(0x8a9695, 0.78);
    this.viewScene.add(viewKey, viewFill, viewRim, viewBounce, viewAmbient);
  }

  installPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.ssaoPass = new SSAOPass(this.scene, this.camera, 1280, 720);
    this.ssaoPass.kernelRadius = 7;
    this.ssaoPass.minDistance = 0.002;
    this.ssaoPass.maxDistance = 0.085;
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1280, 720),
      0.095,
      0.28,
      0.88,
    );
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.ssaoPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
  }

  applyQuality(name) {
    this.quality = resolveQuality(name);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.quality.dpr),
    );
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.ssaoPass.enabled = this.quality.name !== "low";
    this.bloomPass.enabled = this.quality.name !== "low";
    this.ssaoPass.kernelRadius = this.quality.name === "high" ? 7 : 5;
    this.bloomPass.strength = this.quality.name === "high" ? 0.095 : 0.065;
    this.sun.shadow.mapSize.set(
      this.quality.shadowMap,
      this.quality.shadowMap,
    );
    this.scene.fog.density = 1.18 / this.quality.fogFar;
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
    this.composer.setSize(safeWidth, safeHeight);
    return { width: _viewport.x, height: _viewport.y };
  }

  render() {
    this.sky.position.copy(this.camera.position);
    this.renderer.setRenderTarget(null);
    this.composer.render();
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
    this.composer.dispose();
    this.ssaoPass.dispose();
    this.bloomPass.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export default RendererSystem;
