import * as THREE from 'three';

// The visible sky and the reflected light share the same horizon and key.
export const SUN_DIRECTION = new THREE.Vector3(0.88, 0.31, -0.37).normalize();
export const HAZE_COLOR = 0x90939c;

export function createAshSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDirection: { value: SUN_DIRECTION },
      fogColor: { value: new THREE.Color(HAZE_COLOR) },
    },
    vertexShader: `
      varying vec3 vWorldDirection;
      void main() {
        vWorldDirection = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vWorldDirection;
      uniform vec3 sunDirection;
      uniform vec3 fogColor;

      float hash(vec2 p) {
        vec3 n = fract(vec3(p.xyx) * 0.1031);
        n += dot(n, n.yzx + 33.33);
        return fract((n.x + n.y) * n.z);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
          mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }

      float clouds(vec2 p) {
        mat2 rotate = mat2(0.82, -0.57, 0.57, 0.82);
        float layer = 0.55 * noise(p);
        p = rotate * p * 2.07 + 4.5;
        layer += 0.26 * noise(p);
        p = rotate * p * 2.12 + 9.2;
        layer += 0.13 * noise(p);
        return layer + 0.06 * noise(rotate * p * 2.1);
      }

      void main() {
        vec3 ray = normalize(vWorldDirection);
        float elevation = max(ray.y, 0.0);
        float facing = max(dot(ray, sunDirection), 0.0);
        float sunset = pow(facing, 7.0) * exp(-elevation * 2.1);
        vec3 horizon = mix(fogColor, vec3(0.62, 0.40, 0.27), sunset);
        vec3 atmosphere = mix(horizon, vec3(0.085, 0.16, 0.26), smoothstep(0.015, 0.83, elevation));
        vec2 cloudPosition = ray.xz / (0.20 + elevation) * 2.15 + vec2(19.0, -4.0);
        cloudPosition.x *= 0.64;
        float structure = clouds(cloudPosition);
        float litEdge = max(structure - clouds(cloudPosition + vec2(-0.13, 0.22)), 0.0);
        float cloudMask = smoothstep(0.39, 0.67, structure) * smoothstep(0.025, 0.21, elevation);
        vec3 cloudShade = mix(vec3(0.064, 0.093, 0.14), vec3(0.34, 0.23, 0.20), sunset);
        vec3 sky = mix(atmosphere, cloudShade, cloudMask * 0.92);
        sky += litEdge * smoothstep(0.025, 0.15, elevation) * vec3(0.46, 0.27, 0.18) * (0.25 + sunset);
        float corona = pow(facing, 25.0) * (1.0 - cloudMask * 0.87);
        float disk = smoothstep(0.99960, 0.99992, facing) * (1.0 - cloudMask);
        sky += vec3(1.0, 0.54, 0.31) * (corona * 0.36 + disk * 2.4);
        sky = mix(vec3(0.065, 0.065, 0.066), sky, smoothstep(-0.55, 0.0, ray.y));
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(190, 24, 14), material);
  sky.name = 'Ash cloud ceiling';
  sky.frustumCulled = false;
  sky.renderOrder = 10;
  return sky;
}

export function createSkyEnvironment(renderer, sky) {
  const reflectionScene = new THREE.Scene();
  reflectionScene.add(sky);
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(reflectionScene, 0.04, 0.1, 220, { size: 64 });
  generator.dispose();
  return target;
}
