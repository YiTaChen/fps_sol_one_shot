import * as THREE from 'three';

export function createAshField() {
  const positions = [];
  const parameters = [];
  let seed = 0x5ade6d;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (const { count, start, length, z, width, height } of [
    { count: 212, start: -47, length: 94, z: 0, width: 11.8, height: 6.5 },
    { count: 74, start: -47, length: 94, z: -29, width: 6.5, height: 4.9 },
    { count: 74, start: -47, length: 94, z: 29, width: 6.5, height: 4.9 },
    { count: 54, start: -23, length: 8, z: 0, width: 58, height: 5.0 },
  ]) {
    for (let index = 0; index < count; index += 1) {
      positions.push(start + length * random(), 0.22 + random() ** 1.35 * height,
        z + (random() - 0.5) * width);
      parameters.push(start, length, random(), 0.40 + random() * 0.72);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('airflow', new THREE.Float32BufferAttribute(parameters, 4));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      clock: { value: 0 },
      pixelScale: { value: 1 },
    },
    vertexShader: `
      uniform float clock;
      uniform float pixelScale;
      attribute vec4 airflow;
      varying float vOpacity;
      varying float vTint;

      void main() {
        vec3 ash = position;
        float flow = (ash.x - airflow.x + clock * airflow.w) / airflow.y;
        float progress = fract(flow);
        ash.x = airflow.x + progress * airflow.y;
        float phase = airflow.z * 62.83 + clock * (0.29 + airflow.w * 0.14);
        ash.y += sin(phase) * 0.18;
        ash.z += cos(phase * 0.74) * 0.34;

        vec4 viewPosition = modelViewMatrix * vec4(ash, 1.0);
        float depth = -viewPosition.z;
        float distanceToEye = length(viewPosition.xyz);
        float nearFade = smoothstep(1.0, 2.8, distanceToEye);
        float farFade = 1.0 - smoothstep(17.0, 37.0, distanceToEye);
        float wrapFade = smoothstep(0.0, 0.055, progress) * (1.0 - smoothstep(0.945, 1.0, progress));
        vOpacity = nearFade * farFade * wrapFade * (0.22 + airflow.z * 0.28);
        vTint = airflow.z;
        gl_PointSize = clamp((16.0 + airflow.z * 12.0) / max(depth, 1.0), 0.9, 3.8) * pixelScale;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying float vOpacity;
      varying float vTint;

      void main() {
        vec2 point = (gl_PointCoord - 0.5) * vec2(1.0, 1.27);
        float softness = 1.0 - smoothstep(0.09, 0.50, length(point));
        vec3 ash = mix(vec3(0.32, 0.35, 0.40), vec3(0.63, 0.51, 0.37), vTint);
        gl_FragColor = vec4(ash, vOpacity * softness);
      }
    `,
  });
  const field = new THREE.Points(geometry, material);
  field.name = 'Windborne ash in the exterior lanes';
  field.frustumCulled = false;
  field.renderOrder = 30;
  return field;
}
