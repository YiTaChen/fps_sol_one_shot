import * as THREE from 'three';

const SOURCE_URLS = {
  mineral: [
    new URL('./art/mineral-color.webp', import.meta.url).href,
    new URL('./art/mineral-normal.webp', import.meta.url).href,
    new URL('./art/mineral-roughness.webp', import.meta.url).href,
  ],
  asphalt: [
    new URL('./art/asphalt-color.webp', import.meta.url).href,
    new URL('./art/asphalt-normal.webp', import.meta.url).href,
    new URL('./art/asphalt-roughness.webp', import.meta.url).href,
  ],
  corrugated: [
    new URL('./art/corrugated-color.webp', import.meta.url).href,
    new URL('./art/corrugated-normal.webp', import.meta.url).href,
    new URL('./art/corrugated-roughness.webp', import.meta.url).href,
  ],
  brick: [
    new URL('./art/brick-color.webp', import.meta.url).href,
    new URL('./art/brick-normal.webp', import.meta.url).href,
    new URL('./art/brick-roughness.webp', import.meta.url).href,
  ],
};

export const DISTRICT_SURFACE_FAMILIES = Object.freeze({
  concreteClean: { image: 'mineral', tint: 0xffffff, tile: 3.4, normal: 0.44 },
  concreteAggregate: { image: 'mineral', tint: 0xd3c9bb, tile: 2.2, normal: 0.64 },
  plasterOchre: { image: 'mineral', tint: 0xe3c398, tile: 3.9, normal: 0.48 },
  plasterBlue: { image: 'mineral', tint: 0xa7c4d0, tile: 3.6, normal: 0.49 },
  asphalt: { image: 'asphalt', tint: 0xffffff, tile: 3.2, normal: 0.59 },
  rustedMetal: { image: 'corrugated', tint: 0xffffff, tile: 2.55, normal: 0.91 },
  brick: { image: 'brick', tint: 0xffffff, tile: 1.60, normal: 0.70 },
});

async function decodeImage(url) {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  return image;
}

/** Resolve finished sets together so first-frame screenshots use complete PBR maps. */
export async function loadDistrictSurfaceImages(timeoutMs = 2800) {
  const decoded = new Map();
  const requests = Object.entries(SOURCE_URLS).map(async ([id, urls]) => {
    decoded.set(id, await Promise.all(urls.map(decodeImage)));
  });
  let timer;
  try {
    await Promise.race([
      Promise.allSettled(requests),
      new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
    return new Map(decoded);
  } finally {
    clearTimeout(timer);
  }
}

export function createDistrictTextureSet(id, images) {
  const textures = images.map((image, index) => {
    const texture = new THREE.Texture(image);
    texture.name = `ash-market:${id}:${['albedo', 'normal', 'roughness'][index]}`;
    texture.colorSpace = index === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    return texture;
  });
  const [colorMap, normalMap, roughnessMap] = textures;
  return { colorMap, normalMap, roughnessMap };
}
