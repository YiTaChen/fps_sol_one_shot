import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { resolveQuality } from "../core/Quality.js";
import { createAshField } from "./AshField.js";
import { createAshSky, createSkyEnvironment, HAZE_COLOR, SUN_DIRECTION } from "./AshSky.js";
import { createDistrictScenery } from "./DistrictScenery.js";

const _viewport = new THREE.Vector2();

class ContactShadowPass extends SSAOPass {
  setSize(width, height) {
    super.setSize(Math.max(1, Math.floor(width * 0.55)), Math.max(1, Math.floor(height * 0.55)));
  }

  render(renderer, writeBuffer, readBuffer) {
    const uniforms = this.ssaoMaterial.uniforms;
    uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
    uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
    super.render(renderer, writeBuffer, readBuffer);
  }
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
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.renderer.domElement.id = "game-canvas";
    this.renderer.domElement.tabIndex = 0;
    this.container.appendChild(this.renderer.domElement);
    this.worldRoot = new THREE.Group();
    this.worldRoot.name = "WorldRoot";
    this.scene.add(this.worldRoot);
    this.exchangeRotor = null;
    this.exchangeLamps = null;
    this.condenserStatus = null;
    this.exchangeStage = 0;
    this.pulseStart = -Infinity;
    this.exchangePulse = new THREE.Mesh(
      new THREE.RingGeometry(0.91, 1, 44),
      new THREE.MeshBasicMaterial({
        color: 0x91f5ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    this.exchangePulse.name = 'Relay signal pulse';
    this.exchangePulse.rotation.x = -Math.PI / 2;
    this.exchangePulse.visible = false;
    this.scene.add(this.exchangePulse);
    this.installAtmosphere();
    this.installPostProcessing();
    this.applyQuality(qualityName);
    this.resize();
  }

  installExchange(scene) {
    if (!scene) return;
    this.exchangeRotor = scene.getObjectByName('exchange_rotor');
    scene.traverse((object) => {
      if (!object.isMesh) return;
      object.receiveShadow = true;
      if (object.material.name === 'Amber service lamps') this.exchangeLamps = object.material;
      if (object.material.name === 'Freight condenser status') this.condenserStatus = object.material;
    });
    this.worldRoot.add(scene);
    this.setExchangePowerStage(0);
  }

  setExchangePowerStage(stage) {
    this.exchangeStage = stage;
    if (this.exchangeLamps) this.exchangeLamps.emissiveIntensity = stage > 0 ? 4 : 1.8;
    if (this.condenserStatus) this.condenserStatus.emissiveIntensity = stage >= 2 ? 3.6 : 0.6;
    if (stage === 0) {
      this.pulseStart = -Infinity;
      this.exchangePulse.visible = false;
      if (this.exchangeRotor) this.exchangeRotor.rotation.z = 0;
    }
  }

  pulseExchange(position) {
    this.exchangePulse.position.set(position.x, position.y + 0.065, position.z);
    this.pulseStart = performance.now();
    this.exchangePulse.visible = true;
  }

  installAtmosphere() {
    this.scene.background = new THREE.Color(HAZE_COLOR);
    this.scene.fog = new THREE.FogExp2(HAZE_COLOR, 0.0122);
    this.sky = createAshSky();
    this.environment = createSkyEnvironment(this.renderer, this.sky);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.61;
    this.viewScene.environment = this.environment.texture;
    this.viewScene.environmentIntensity = 0.68;
    this.scene.add(this.sky);
    this.ash = createAshField();
    this.motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.scene.add(this.ash);
    const { group, roadWear } = createDistrictScenery();
    this.scene.add(group);
    this.roadWear = roadWear;

    const skyFill = new THREE.HemisphereLight(0xd6e8ff, 0x8c7167, 1.42);
    skyFill.name = "Overcast sky bounce";
    this.scene.add(skyFill);

    this.sun = new THREE.DirectionalLight(0xffcd99, 2.46);
    this.sun.name = "Low sun through the ash";
    this.sun.position.copy(SUN_DIRECTION).multiplyScalar(82);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -53;
    this.sun.shadow.camera.right = 53;
    this.sun.shadow.camera.top = 53;
    this.sun.shadow.camera.bottom = -53;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 157;
    this.sun.shadow.bias = -0.00017;
    this.sun.shadow.normalBias = 0.032;
    this.scene.add(this.sun, this.sun.target);

    const cloudFill = new THREE.DirectionalLight(0xabc9ed, 0.41);
    cloudFill.position.set(-34, 28, 14);
    this.scene.add(cloudFill);

    const viewKey = new THREE.DirectionalLight(0xffdeb1, 2.9);
    viewKey.position.set(-2.4, 3.6, 4.2);
    const viewFill = new THREE.HemisphereLight(0xd2e4ff, 0x816c62, 1.62);
    const viewRim = new THREE.DirectionalLight(0xb0cdff, 2.45);
    viewRim.position.set(3.2, 1.4, -2.8);
    const viewBounce = new THREE.DirectionalLight(0xe0a47f, 0.72);
    viewBounce.position.set(2.2, -1.1, 2.6);
    const viewAmbient = new THREE.AmbientLight(0x9da9b2, 0.40);
    this.viewScene.add(viewKey, viewFill, viewRim, viewBounce, viewAmbient);
  }

  installPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.ssaoPass = new ContactShadowPass(this.scene, this.camera, 720, 405);
    this.ssaoPass.kernelRadius = 5;
    this.ssaoPass.minDistance = 0.0015;
    this.ssaoPass.maxDistance = 0.055;
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1280, 720),
      0.165,
      0.38,
      1.06,
    );
    this.colorGradePass = new ShaderPass({
      name: "CinderlineColorGrade",
      uniforms: {
        tDiffuse: { value: null },
        pixelStep: { value: new THREE.Vector2() },
        saturation: { value: 0.89 },
        contrast: { value: 1.06 },
        shadowTint: { value: new THREE.Color(0xa5bfed) },
        highlightTint: { value: new THREE.Color(0xffe0bc) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2 pixelStep;
        uniform float saturation;
        uniform float contrast;
        uniform vec3 shadowTint;
        uniform vec3 highlightTint;

        const vec3 luma = vec3(0.2126, 0.7152, 0.0722);

        vec3 resolveEdge(vec3 center) {
          float middle = dot(center, luma);
          float nw = dot(texture2D(tDiffuse, vUv + pixelStep * vec2(-1,  1)).rgb, luma);
          float ne = dot(texture2D(tDiffuse, vUv + pixelStep * vec2( 1,  1)).rgb, luma);
          float sw = dot(texture2D(tDiffuse, vUv + pixelStep * vec2(-1, -1)).rgb, luma);
          float se = dot(texture2D(tDiffuse, vUv + pixelStep * vec2( 1, -1)).rgb, luma);
          float darkest = min(middle, min(min(nw, ne), min(sw, se)));
          float brightest = max(middle, max(max(nw, ne), max(sw, se)));
          if (brightest - darkest < max(0.018, brightest * 0.13)) return center;

          vec2 tangent = vec2(sw + se - nw - ne, nw + sw - ne - se);
          float strength = min(abs(tangent.x), abs(tangent.y)) + max(0.005, brightest * 0.12);
          tangent = clamp(tangent / strength, -5.0, 5.0) * pixelStep;
          vec3 local = (texture2D(tDiffuse, vUv - tangent / 6.0).rgb
            + texture2D(tDiffuse, vUv + tangent / 6.0).rgb) * 0.5;
          vec3 extended = local * 0.5 + (texture2D(tDiffuse, vUv - tangent * 0.5).rgb
            + texture2D(tDiffuse, vUv + tangent * 0.5).rgb) * 0.25;
          float extendedLuma = dot(extended, luma);
          return extendedLuma < darkest || extendedLuma > brightest ? local : extended;
        }

        void main() {
          vec4 source = texture2D(tDiffuse, vUv);
          vec3 filtered = resolveEdge(source.rgb);
          float luminance = dot(filtered, luma);
          vec3 graded = mix(vec3(luminance), filtered, saturation);
          graded = (graded - 0.18) * contrast + 0.18;
          float shadowWeight = 1.0 - smoothstep(0.08, 0.52, luminance);
          float highlightWeight = smoothstep(0.5, 0.94, luminance);
          graded *= mix(vec3(1.0), shadowTint, shadowWeight * 0.105);
          graded *= mix(vec3(1.0), highlightTint, highlightWeight * 0.06);
          vec2 position = (vUv - 0.5) * vec2(1.0, 0.78);
          float edge = smoothstep(0.33, 0.65, length(position));
          gl_FragColor = vec4(max(graded * (1.0 - edge * 0.115), vec3(0.0)), source.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.ssaoPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.colorGradePass);
  }

  applyQuality(name) {
    this.quality = resolveQuality(name);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.quality.dpr),
    );
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.autoUpdate = this.quality.name === "high";
    this.renderer.shadowMap.needsUpdate = true;
    this.shadowFrame = 0;
    this.ssaoPass.enabled = this.quality.name === "high";
    this.bloomPass.enabled = this.quality.name !== "low";
    this.bloomPass.strength = this.quality.name === "high" ? 0.165 : 0.11;
    const { shadowMap, fogFar } = this.quality;
    if (this.sun.shadow.mapSize.x !== shadowMap) {
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(shadowMap, shadowMap);
    }
    this.scene.fog.density = Math.max(0.0125, 1.2 / fogFar);
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
    const { width: sceneWidth, height: sceneHeight } = this.composer.readBuffer;
    this.colorGradePass.uniforms.pixelStep.value.set(1 / sceneWidth, 1 / sceneHeight);
    this.ash.material.uniforms.pixelScale.value = Math.max(0.72, sceneHeight / 720);
    return { width: _viewport.x, height: _viewport.y };
  }

  render(deltaSeconds = 0) {
    this.sky.position.copy(this.camera.position);
    if (!this.motionPreference.matches) {
      this.ash.material.uniforms.clock.value += deltaSeconds;
      if (this.exchangeRotor && this.exchangeStage > 0) {
        this.exchangeRotor.rotation.z -= deltaSeconds * 2.7;
      }
    }
    if (this.exchangePulse.visible) {
      const progress = (performance.now() - this.pulseStart) / 650;
      this.exchangePulse.visible = progress < 1;
      this.exchangePulse.material.opacity = Math.max(0, (1 - progress) * 0.5);
      this.exchangePulse.scale.setScalar(deltaSeconds > 0 ? 0.65 + progress * 4.1 : 1.8);
    }
    // The sun is static. On the two lighter presets reuse its map for one
    // frame while camera, characters and combat keep their full render rate.
    if (!this.renderer.shadowMap.autoUpdate && this.shadowFrame++ % 2 === 0) {
      this.renderer.shadowMap.needsUpdate = true;
    }
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
    this.roadWear.dispose();
    this.environment.dispose();
    this.composer.dispose();
    this.ssaoPass.dispose();
    this.bloomPass.dispose();
    this.colorGradePass.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export default RendererSystem;
