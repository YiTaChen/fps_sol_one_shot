import * as THREE from 'three';
import {
  createProceduralTextureSet,
  seedFromRng,
  seedFromString,
} from './ProceduralTexture.js';

export const MATERIAL_FAMILIES = Object.freeze({
  concreteClean: {
    id: 'concreteClean',
    label: 'Formed concrete',
    style: 'concrete',
    dark: [0.34, 0.36, 0.35],
    light: [0.67, 0.66, 0.61],
    roughness: [0.73, 0.93],
    metalness: 0,
    normalStrength: 2.4,
    repeat: 3,
    metersPerTile: 1.25,
    surface: 'concrete',
  },
  concreteAggregate: {
    id: 'concreteAggregate',
    label: 'Exposed aggregate concrete',
    style: 'aggregate',
    dark: [0.25, 0.27, 0.25],
    light: [0.62, 0.59, 0.52],
    roughness: [0.76, 0.98],
    metalness: 0,
    normalStrength: 3.5,
    repeat: 3,
    metersPerTile: 0.8,
    surface: 'concrete',
  },
  brick: {
    id: 'brick',
    label: 'Kiln-fired masonry',
    style: 'brick',
    dark: [0.22, 0.075, 0.045],
    light: [0.67, 0.29, 0.16],
    roughness: [0.72, 0.96],
    metalness: 0,
    normalStrength: 4.2,
    repeat: 2,
    metersPerTile: 1.25,
    surface: 'masonry',
  },
  plasterOchre: {
    id: 'plasterOchre',
    label: 'Weathered ochre plaster',
    style: 'plaster',
    dark: [0.35, 0.18, 0.075],
    light: [0.86, 0.61, 0.31],
    roughness: [0.66, 0.95],
    metalness: 0,
    normalStrength: 3,
    repeat: 3,
    metersPerTile: 1.4,
    surface: 'plaster',
  },
  plasterBlue: {
    id: 'plasterBlue',
    label: 'Faded mineral-blue plaster',
    style: 'plaster',
    dark: [0.08, 0.19, 0.2],
    light: [0.29, 0.57, 0.58],
    roughness: [0.68, 0.96],
    metalness: 0,
    normalStrength: 2.7,
    repeat: 3,
    metersPerTile: 1.35,
    surface: 'plaster',
  },
  asphalt: {
    id: 'asphalt',
    label: 'Patched road asphalt',
    style: 'asphalt',
    dark: [0.018, 0.023, 0.024],
    light: [0.16, 0.17, 0.16],
    roughness: [0.72, 0.98],
    metalness: 0,
    normalStrength: 4.1,
    repeat: 4,
    metersPerTile: 1.1,
    surface: 'asphalt',
  },
  dirt: {
    id: 'dirt',
    label: 'Compacted reddish dirt',
    style: 'earth',
    dark: [0.12, 0.055, 0.025],
    light: [0.47, 0.27, 0.12],
    roughness: [0.78, 0.99],
    metalness: 0,
    normalStrength: 3.6,
    repeat: 4,
    metersPerTile: 0.9,
    surface: 'dirt',
  },
  sand: {
    id: 'sand',
    label: 'Wind-rippled sand',
    style: 'sand',
    dark: [0.38, 0.25, 0.12],
    light: [0.82, 0.66, 0.39],
    roughness: [0.77, 0.96],
    metalness: 0,
    normalStrength: 2.8,
    repeat: 3,
    metersPerTile: 0.7,
    surface: 'sand',
  },
  paintedMetal: {
    id: 'paintedMetal',
    label: 'Chipped oxide-red painted metal',
    style: 'paintedMetal',
    dark: [0.055, 0.065, 0.065],
    light: [0.36, 0.095, 0.045],
    roughness: [0.36, 0.76],
    metalness: 0.72,
    normalStrength: 2.4,
    repeat: 2,
    metersPerTile: 0.9,
    surface: 'metal',
  },
  bareMetal: {
    id: 'bareMetal',
    label: 'Brushed structural steel',
    style: 'brushedMetal',
    dark: [0.17, 0.19, 0.2],
    light: [0.58, 0.62, 0.64],
    roughness: [0.26, 0.53],
    metalness: 0.94,
    normalStrength: 1.4,
    repeat: 2,
    metersPerTile: 0.75,
    surface: 'metal',
  },
  rustedMetal: {
    id: 'rustedMetal',
    label: 'Deeply oxidized steel',
    style: 'rust',
    dark: [0.09, 0.025, 0.012],
    light: [0.58, 0.21, 0.045],
    roughness: [0.69, 0.98],
    metalness: 0.58,
    normalStrength: 4.5,
    repeat: 2,
    metersPerTile: 0.62,
    surface: 'metal',
  },
  wood: {
    id: 'wood',
    label: 'Rough market timber',
    style: 'wood',
    dark: [0.11, 0.045, 0.018],
    light: [0.56, 0.3, 0.105],
    roughness: [0.57, 0.91],
    metalness: 0,
    normalStrength: 3.1,
    repeat: 2,
    metersPerTile: 0.8,
    surface: 'wood',
  },
  glass: {
    id: 'glass',
    label: 'Dusty architectural glass',
    style: 'glass',
    dark: [0.025, 0.055, 0.065],
    light: [0.15, 0.31, 0.34],
    roughness: [0.08, 0.27],
    metalness: 0,
    normalStrength: 0.65,
    repeat: 1,
    metersPerTile: 2.2,
    surface: 'glass',
    transparent: true,
    opacity: 0.52,
    transmission: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  },
  rubber: {
    id: 'rubber',
    label: 'Moulded black rubber',
    style: 'rubber',
    dark: [0.006, 0.007, 0.007],
    light: [0.065, 0.071, 0.068],
    roughness: [0.62, 0.9],
    metalness: 0,
    normalStrength: 3,
    repeat: 3,
    metersPerTile: 0.38,
    surface: 'rubber',
  },
  fabric: {
    id: 'fabric',
    label: 'Sun-faded woven canvas',
    style: 'fabric',
    dark: [0.18, 0.025, 0.018],
    light: [0.74, 0.31, 0.095],
    roughness: [0.73, 0.98],
    metalness: 0,
    normalStrength: 3.4,
    repeat: 3,
    metersPerTile: 0.45,
    surface: 'fabric',
    side: THREE.DoubleSide,
  },
  polymer: {
    id: 'polymer',
    label: 'Industrial moulded polymer',
    style: 'polymer',
    dark: [0.018, 0.025, 0.026],
    light: [0.16, 0.2, 0.19],
    roughness: [0.42, 0.73],
    metalness: 0,
    normalStrength: 2.2,
    repeat: 3,
    metersPerTile: 0.45,
    surface: 'polymer',
  },
  ceramic: {
    id: 'ceramic',
    label: 'Glazed workshop tile',
    style: 'ceramic',
    dark: [0.11, 0.19, 0.17],
    light: [0.62, 0.77, 0.68],
    roughness: [0.2, 0.62],
    metalness: 0,
    normalStrength: 3.5,
    repeat: 2,
    metersPerTile: 1,
    surface: 'ceramic',
  },
  foliage: {
    id: 'foliage',
    label: 'Dusty urban foliage',
    style: 'foliage',
    dark: [0.025, 0.095, 0.025],
    light: [0.22, 0.46, 0.08],
    roughness: [0.64, 0.94],
    metalness: 0,
    normalStrength: 2.5,
    repeat: 2,
    metersPerTile: 0.65,
    surface: 'foliage',
    side: THREE.DoubleSide,
  },
  lamp: {
    id: 'lamp',
    label: 'Frosted utility lamp',
    style: 'frosted',
    dark: [0.36, 0.23, 0.08],
    light: [1, 0.78, 0.38],
    roughness: [0.31, 0.58],
    metalness: 0,
    normalStrength: 0.75,
    repeat: 1,
    metersPerTile: 0.22,
    surface: 'glass',
    emissive: [1, 0.43, 0.08],
    emissiveIntensity: 1.7,
  },
});

const SURFACE_METADATA = Object.freeze({
  concrete: Object.freeze({
    id: 'concrete',
    kind: 'concrete',
    surface: 'concrete',
    hardness: 0.92,
    penetrationResistance: 0.94,
    ricochet: 0.18,
    footstep: 'concrete',
    impact: 'mineral',
  }),
  masonry: Object.freeze({
    id: 'masonry',
    kind: 'masonry',
    surface: 'masonry',
    hardness: 0.82,
    penetrationResistance: 0.86,
    ricochet: 0.08,
    footstep: 'concrete',
    impact: 'masonry',
  }),
  plaster: Object.freeze({
    id: 'plaster',
    kind: 'plaster',
    surface: 'plaster',
    hardness: 0.42,
    penetrationResistance: 0.46,
    ricochet: 0.02,
    footstep: 'concrete',
    impact: 'plaster',
  }),
  asphalt: Object.freeze({
    id: 'asphalt',
    kind: 'asphalt',
    surface: 'asphalt',
    hardness: 0.67,
    penetrationResistance: 0.72,
    ricochet: 0.06,
    footstep: 'asphalt',
    impact: 'mineral',
  }),
  dirt: Object.freeze({
    id: 'dirt',
    kind: 'dirt',
    surface: 'dirt',
    hardness: 0.14,
    penetrationResistance: 0.18,
    ricochet: 0,
    footstep: 'dirt',
    impact: 'dust',
  }),
  sand: Object.freeze({
    id: 'sand',
    kind: 'sand',
    surface: 'sand',
    hardness: 0.08,
    penetrationResistance: 0.13,
    ricochet: 0,
    footstep: 'sand',
    impact: 'dust',
  }),
  metal: Object.freeze({
    id: 'metal',
    kind: 'metal',
    surface: 'metal',
    hardness: 0.9,
    penetrationResistance: 0.83,
    ricochet: 0.42,
    footstep: 'metal',
    impact: 'metal',
  }),
  wood: Object.freeze({
    id: 'wood',
    kind: 'wood',
    surface: 'wood',
    hardness: 0.32,
    penetrationResistance: 0.33,
    ricochet: 0.01,
    footstep: 'wood',
    impact: 'wood',
  }),
  glass: Object.freeze({
    id: 'glass',
    kind: 'glass',
    surface: 'glass',
    hardness: 0.36,
    penetrationResistance: 0.13,
    ricochet: 0.04,
    footstep: 'glass',
    impact: 'glass',
  }),
  rubber: Object.freeze({
    id: 'rubber',
    kind: 'rubber',
    surface: 'rubber',
    hardness: 0.18,
    penetrationResistance: 0.28,
    ricochet: 0.02,
    footstep: 'rubber',
    impact: 'soft',
  }),
  fabric: Object.freeze({
    id: 'fabric',
    kind: 'fabric',
    surface: 'fabric',
    hardness: 0.05,
    penetrationResistance: 0.09,
    ricochet: 0,
    footstep: 'fabric',
    impact: 'soft',
  }),
  polymer: Object.freeze({
    id: 'polymer',
    kind: 'polymer',
    surface: 'polymer',
    hardness: 0.28,
    penetrationResistance: 0.31,
    ricochet: 0.03,
    footstep: 'plastic',
    impact: 'polymer',
  }),
  ceramic: Object.freeze({
    id: 'ceramic',
    kind: 'ceramic',
    surface: 'ceramic',
    hardness: 0.72,
    penetrationResistance: 0.56,
    ricochet: 0.06,
    footstep: 'tile',
    impact: 'ceramic',
  }),
  foliage: Object.freeze({
    id: 'foliage',
    kind: 'foliage',
    surface: 'foliage',
    hardness: 0.03,
    penetrationResistance: 0.03,
    ricochet: 0,
    footstep: 'foliage',
    impact: 'foliage',
  }),
});

function resolveStream(service, name) {
  if (!service) {
    return null;
  }
  if (typeof service.stream === 'function') {
    return service.stream(name);
  }
  if (typeof service.getStream === 'function') {
    return service.getStream(name);
  }
  if (typeof service.named === 'function') {
    return service.named(name);
  }
  if (typeof service.fork === 'function') {
    return service.fork(name);
  }
  return service;
}

/**
 * Shared procedural PBR material registry. One instance is intended per Game.
 */
export class MaterialLibrary {
  constructor(options = {}) {
    const {
      rng = null,
      renderer = null,
      textureSize = 256,
      quality = 'medium',
    } = options;
    this.rng = resolveStream(rng, 'materials');
    this.renderer = renderer;
    const qualityName =
      typeof quality === 'string'
        ? quality
        : quality?.name ?? quality?.preset ?? 'medium';
    this.textureSize =
      qualityName === 'low'
        ? Math.min(textureSize, 128)
        : qualityName === 'high'
          ? Math.max(textureSize, 256)
          : textureSize;
    this.materials = new Map();
    this.textureSets = new Map();
    this.disposed = false;
    this._createFamilies();
  }

  static fromContext(context, options = {}) {
    return new MaterialLibrary({
      rng: context?.rng,
      renderer: context?.renderer,
      quality: context?.quality?.name ?? context?.quality?.preset ?? 'medium',
      ...options,
    });
  }

  _createFamilies() {
    const anisotropy = Math.min(
      8,
      this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 4,
    );

    for (const recipe of Object.values(MATERIAL_FAMILIES)) {
      const familySeed =
        seedFromRng(this.rng, recipe.id) ^ seedFromString(`cinderline:${recipe.id}`);
      const textures = createProceduralTextureSet(recipe, familySeed >>> 0, this.textureSize);
      textures.colorMap.anisotropy = anisotropy;
      textures.normalMap.anisotropy = anisotropy;
      textures.roughnessMap.anisotropy = anisotropy;

      const MaterialType = recipe.transmission
        ? THREE.MeshPhysicalMaterial
        : THREE.MeshStandardMaterial;
      const materialOptions = {
        name: `pbr:${recipe.id}`,
        color: 0xffffff,
        map: textures.colorMap,
        normalMap: textures.normalMap,
        roughnessMap: textures.roughnessMap,
        roughness: 1,
        metalness: recipe.metalness,
        transparent: recipe.transparent ?? false,
        opacity: recipe.opacity ?? 1,
        depthWrite: recipe.depthWrite ?? true,
        side: recipe.side ?? THREE.FrontSide,
        emissive: recipe.emissive
          ? new THREE.Color(...recipe.emissive)
          : new THREE.Color(0x000000),
        emissiveMap: recipe.emissive ? textures.colorMap : null,
        emissiveIntensity: recipe.emissiveIntensity ?? 0,
      };
      if (recipe.transmission) {
        materialOptions.transmission = recipe.transmission;
        materialOptions.thickness = 0.025;
        materialOptions.ior = 1.48;
      }
      const material = new MaterialType(materialOptions);
      material.normalScale.set(0.72, 0.72);
      material.userData.family = recipe.id;
      material.userData.surface = recipe.surface;
      material.userData.metersPerTile = recipe.metersPerTile;
      material.userData.procedural = true;
      material.userData.metadata = this.surfaceFor(recipe.surface);

      this.materials.set(recipe.id, material);
      this.textureSets.set(recipe.id, textures);
    }
  }

  get(id) {
    const material = this.materials.get(id);
    if (!material) {
      throw new Error(`Unknown procedural material family: ${id}`);
    }
    return material;
  }

  has(id) {
    return this.materials.has(id);
  }

  surfaceFor(idOrFamily) {
    const family = MATERIAL_FAMILIES[idOrFamily];
    const surfaceId = family?.surface ?? idOrFamily;
    return SURFACE_METADATA[surfaceId] ?? SURFACE_METADATA.concrete;
  }

  get familyCount() {
    return this.materials.size;
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const material of this.materials.values()) {
      material.dispose();
    }
    for (const textures of this.textureSets.values()) {
      textures.colorMap.dispose();
      textures.normalMap.dispose();
      textures.roughnessMap.dispose();
    }
    this.materials.clear();
    this.textureSets.clear();
  }
}

export { SURFACE_METADATA };
