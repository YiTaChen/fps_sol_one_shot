import * as THREE from 'three';

const vector = (coordinates) => new THREE.Vector3(...coordinates);

const PRESENTATION = Object.freeze({
  smg: {
    hip: [0.24, -0.225, -0.65], ads: [0, -0.132, -0.57],
    support: [-0.03, -0.023, -0.245],
  },
  precision: {
    hip: [0.259, -0.28, -0.82], ads: [0, -0.169, -0.61],
    support: [-0.03, -0.028, -0.36],
  },
  sidearm: {
    hip: [0.186, -0.184, -0.61], ads: [0, -0.09, -0.53],
    support: [-0.043, -0.13, 0.03], rightHand: [0.041, -0.116, 0.09],
  },
  'heavy-sidearm': {
    hip: [0.193, -0.212, -0.66], ads: [0, -0.109, -0.58],
    support: [-0.052, -0.148, 0.03], rightHand: [0.051, -0.127, 0.09],
  },
  melee: {
    hip: [0.35, -0.299, -0.59], ads: [0.35, -0.299, -0.59],
    support: null, rightHand: [0.037, -0.09, 0.078],
  },
});

export function buildVariantModel(root, id, materials, geometry) {
  const { gunmetal, darkMetal, exposedMetal, railMetal, accentMetal, polymer, rubber, opticGlass, reticle } = materials;
  const { roundedPart, cylinderPart, sideProfileGeometry } = geometry;
  const fit = PRESENTATION[id];
  const box = (name, size, xyz, material, parent = root, radius = 0.006) =>
    roundedPart(parent, vector(size), vector(xyz), material, radius, 1, name);
  const tube = (name, top, bottom, length, xyz, material, parent = root) =>
    cylinderPart(parent, top, bottom, length, vector(xyz), material, 24, name);
  const profile = (name, points, width, material, parent = root, bevel = 0.004) => {
    const mesh = new THREE.Mesh(sideProfileGeometry(points, width, bevel), material);
    mesh.name = name;
    parent.add(mesh);
    return mesh;
  };
  const ring = (name, radius, thickness, xyz, material) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 8, 28), material);
    mesh.name = name;
    mesh.position.copy(vector(xyz));
    root.add(mesh);
    return mesh;
  };
  const assembly = (name, xyz) => {
    const group = new THREE.Group();
    group.name = name;
    group.position.copy(vector(xyz));
    root.add(group);
    return group;
  };
  const pane = (name, radius, xyz, material) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), material);
    mesh.name = name;
    mesh.position.copy(vector(xyz));
    root.add(mesh);
  };
  let magazine = null;
  let movingPart = null;

  if (id === 'smg') {
    profile('Flicker ribbed upper shell', [
      [-0.33, -0.028], [-0.306, 0.048], [-0.258, 0.071], [0.153, 0.069],
      [0.195, 0.035], [0.179, -0.053], [0.045, -0.07], [-0.25, -0.061],
    ], 0.107, gunmetal);
    profile('Flicker vented foreguard', [
      [-0.34, 0.024], [-0.124, 0.021], [-0.108, -0.053],
      [-0.14, -0.092], [-0.31, -0.083],
    ], 0.126, polymer);
    for (const x of [-0.064, 0.064]) {
      box('Copper service stripe', [0.007, 0.015, 0.164], [x, 0.046, -0.18], accentMetal);
      for (let i = 0; i < 5; i += 1) {
        box('Cooling recess', [0.008, 0.021, 0.011], [x, -0.031, -0.287 + i * 0.034], darkMetal);
      }
    }
    tube('Flicker compact emitter', 0.028, 0.033, 0.103, [0, 0.005, -0.382], darkMetal);
    tube('Flicker emitter collar', 0.034, 0.034, 0.021, [0, 0.005, -0.405], railMetal);
    ring('Dark muzzle rim', 0.016, 0.006, [0, 0.005, -0.435], darkMetal);
    box('Folding shoulder rails', [0.069, 0.028, 0.168], [0, 0.016, 0.226], railMetal);
    box('Flicker shoulder plate', [0.089, 0.121, 0.029], [0, -0.022, 0.3], rubber);
    box('Flicker control grip', [0.064, 0.135, 0.08], [0, -0.108, 0.104], rubber).rotation.x = -0.25;
    box('Sight mounting shoe', [0.078, 0.031, 0.125], [0, 0.082, -0.01], railMetal);
    for (const x of [-0.034, 0.034]) box('Reflex shield', [0.014, 0.058, 0.045], [x, 0.121, 0.034], gunmetal);
    box('Reflex bridge', [0.075, 0.013, 0.044], [0, 0.151, 0.034], gunmetal);
    pane('Flicker lens', 0.029, [0, 0.124, 0.051], opticGlass);
    pane('Flicker aiming dot', 0.0023, [0, 0.132, 0.052], reticle);
    magazine = assembly('Flicker magazine', [0, -0.093, -0.06]);
    box('Flicker magazine body', [0.072, 0.166, 0.072], [0, -0.049, 0], darkMetal, magazine).rotation.x = 0.12;
    box('Flicker magazine base', [0.081, 0.021, 0.08], [0, -0.132, -0.01], polymer, magazine);
  } else if (id === 'precision') {
    profile('Meridian action housing', [
      [-0.377, -0.037], [-0.361, 0.049], [-0.256, 0.066], [0.207, 0.063],
      [0.263, 0.021], [0.243, -0.064], [0.105, -0.091], [-0.292, -0.076],
    ], 0.11, gunmetal);
    profile('Meridian shoulder chassis', [
      [0.16, 0.027], [0.393, 0.067], [0.517, 0.029], [0.517, -0.105],
      [0.312, -0.096], [0.221, -0.064],
    ], 0.095, polymer);
    box('Meridian cheek rest', [0.102, 0.041, 0.196], [0, 0.071, 0.371], darkMetal);
    box('Meridian stock pad', [0.118, 0.14, 0.033], [0, -0.029, 0.528], rubber);
    box('Meridian grip', [0.066, 0.13, 0.081], [0, -0.109, 0.104], rubber).rotation.x = -0.16;
    tube('Meridian elongated barrel', 0.022, 0.026, 0.424, [0, 0.02, -0.559], railMetal);
    tube('Meridian muzzle housing', 0.038, 0.038, 0.099, [0, 0.02, -0.79], darkMetal);
    ring('Meridian muzzle rim', 0.02, 0.009, [0, 0.02, -0.84], exposedMetal);
    for (const x of [-0.056, 0.056]) {
      box('Meridian accent inlay', [0.008, 0.016, 0.23], [x, 0.022, -0.215], accentMetal);
      for (let i = 0; i < 4; i += 1) {
        box('Meridian cooling relief', [0.008, 0.019, 0.012], [x, -0.037, -0.31 + i * 0.041], darkMetal);
      }
    }
    for (const z of [-0.139, 0.121]) box('Scope mount', [0.068, 0.066, 0.035], [0, 0.086, z], railMetal);
    tube('Meridian scope main body', 0.043, 0.043, 0.315, [0, 0.169, 0.006], darkMetal);
    tube('Meridian objective bell', 0.046, 0.062, 0.106, [0, 0.169, -0.168], gunmetal);
    tube('Meridian rear ocular bell', 0.056, 0.044, 0.085, [0, 0.169, 0.164], darkMetal);
    for (const z of [-0.223, 0.208]) {
      ring('Lens seal', z > 0 ? 0.049 : 0.052, 0.009, [0, 0.169, z], rubber);
      pane('Coated optic', z > 0 ? 0.042 : 0.047, [0, 0.169, z], opticGlass);
    }
    tube('Elevation turret', 0.026, 0.023, 0.037, [0, 0.218, 0.005], railMetal).rotation.x = Math.PI / 2;
    tube('Windage turret', 0.021, 0.021, 0.024, [0.053, 0.169, 0.006], railMetal).rotation.y = Math.PI / 2;
    movingPart = assembly('Meridian cycling handle', [0.063, 0.02, 0.09]);
    box('Bolt spine', [0.019, 0.026, 0.111], [0, 0, -0.028], exposedMetal, movingPart);
    box('Handle arm', [0.043, 0.02, 0.022], [0.029, -0.012, 0.014], railMetal, movingPart).rotation.z = -0.38;
    box('Handle knob', [0.027, 0.035, 0.034], [0.054, -0.019, 0.014], darkMetal, movingPart, 0.01);
    magazine = assembly('Meridian magazine', [0, -0.073, -0.095]);
    box('Meridian magazine body', [0.071, 0.099, 0.115], [0, -0.044, 0], darkMetal, magazine);
    box('Meridian magazine base', [0.077, 0.019, 0.119], [0, -0.095, 0], polymer, magazine);
  } else if (id === 'melee') {
    profile('Arc Cutter insulated grip', [
      [-0.117, -0.014], [-0.033, 0.018], [0.121, 0.009],
      [0.167, -0.028], [0.145, -0.082], [-0.053, -0.091],
    ], 0.069, rubber);
    for (let i = 0; i < 6; i += 1) {
      box('Grip band', [0.075, 0.066, 0.013], [0, -0.038, -0.071 + i * 0.037], polymer);
    }
    box('Cutter knuckle guard', [0.112, 0.1, 0.03], [0, -0.035, -0.105], railMetal);
    profile('Arc Cutter shaped blade', [
      [-0.468, 0.065], [-0.443, 0.11], [-0.255, 0.118], [-0.129, 0.043],
      [-0.122, -0.014], [-0.243, -0.006], [-0.322, 0.038],
    ], 0.027, exposedMetal, root, 0.003);
    profile('Arc Cutter dark spine', [
      [-0.446, 0.106], [-0.248, 0.109], [-0.143, 0.039], [-0.182, 0.031], [-0.291, 0.074],
    ], 0.033, darkMetal);
    profile('Cyan tool edge', [
      [-0.463, 0.063], [-0.317, 0.033], [-0.241, -0.01], [-0.124, -0.02],
      [-0.145, -0.031], [-0.248, -0.026], [-0.327, 0.02],
    ], 0.018, reticle, root, 0.002);
    box('Arc Cutter brass collar', [0.082, 0.051, 0.053], [0, -0.021, -0.144], accentMetal);
  } else {
    const heavy = id === 'heavy-sidearm';
    const nose = heavy ? -0.287 : -0.237;
    const width = heavy ? 0.092 : 0.07;
    movingPart = assembly(heavy ? 'Cinder cycling slide' : 'Ember cycling slide', [0, 0, 0]);
    profile('Machined slide', [
      [nose, 0.007], [nose + 0.018, 0.068], [-0.158, 0.072], [0.132, 0.07],
      [0.159, 0.048], [0.149, 0.008],
    ], width, heavy ? exposedMetal : gunmetal, movingPart);
    tube('Front insert', width * 0.31, width * 0.31, 0.036, [0, 0.037, nose - 0.005], darkMetal);
    ring('Front rim', width * 0.27, 0.004, [0, 0.037, nose - 0.026], railMetal);
    profile('Sidearm chassis and swept grip', [
      [nose + 0.025, 0.012], [0.131, 0.014], [0.149, -0.066],
      [0.184, -0.209], [0.071, -0.204], [0.033, -0.078], [nose + 0.05, -0.042],
    ], width * 0.92, polymer);
    box('Handgrip front pad', [width * 0.95, 0.118, 0.083], [0, -0.134, 0.089], rubber).rotation.x = -0.24;
    box('Guard front', [0.029, 0.071, 0.016], [0, -0.066, -0.09], darkMetal).rotation.x = 0.27;
    box('Guard loop', [0.029, 0.012, 0.11], [0, -0.093, -0.046], darkMetal);
    const height = heavy ? 0.109 : 0.09;
    box('Front aiming blade', [0.017, height - 0.06, 0.021], [0, (height + 0.06) * 0.5, nose + 0.04], darkMetal);
    box('Front luminous index', [0.006, 0.007, 0.003], [0, height - 0.005, nose + 0.052], reticle);
    for (const x of [-0.025, 0.025]) box('Rear aiming ear', [0.018, height - 0.064, 0.027], [x, (height + 0.064) * 0.5, 0.119], darkMetal);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i += 1) {
        box('Slide relief', [0.006, 0.031, 0.009], [side * width * 0.52, 0.042, 0.035 + i * 0.02], darkMetal, movingPart).rotation.x = -0.2;
      }
      box('Inlaid identity plate', [0.006, 0.018, 0.105], [side * width * 0.52, 0.039, -0.118], heavy ? accentMetal : railMetal, movingPart);
    }
    magazine = assembly('Sidearm magazine', [0, -0.177, 0.103]);
    box('Sidearm magazine body', [width * 0.67, 0.091, 0.065], [0, 0.014, 0], darkMetal, magazine).rotation.x = -0.22;
    box('Sidearm magazine shoe', [width * 0.91, 0.021, 0.091], [0, -0.026, 0.014], rubber, magazine);
  }

  return {
    hip: vector(fit.hip),
    ads: vector(fit.ads),
    support: fit.support && vector(fit.support),
    rightHand: fit.rightHand && vector(fit.rightHand),
    magazine,
    magazineHome: magazine?.position.clone(),
    movingPart,
    movingHome: movingPart?.position.clone(),
  };
}
