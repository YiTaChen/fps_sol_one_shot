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
  const { roundedPart, cylinderPart, sideProfileGeometry, mark } = geometry;
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
  const sidePlate = (name, x, points, width, material, parent = root) => {
    const plate = profile(name, points, width, material, parent, 0.0015);
    plate.position.x = x;
    return plate;
  };
  const axial = (name, points, material, xyz = [0, 0, 0], segments = 24) => {
    const shape = new THREE.LatheGeometry(
      points.map(([z, radius]) => new THREE.Vector2(radius, z)),
      segments,
    );
    shape.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(shape, material);
    mesh.name = name;
    mesh.position.copy(vector(xyz));
    root.add(mesh);
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
    profile('Flicker sculpted upper shell', [
      [-0.328, -0.025], [-0.309, 0.044], [-0.253, 0.071], [-0.087, 0.073],
      [-0.057, 0.067], [0.151, 0.068], [0.197, 0.035], [0.182, -0.044],
      [0.151, -0.061], [0.039, -0.07], [-0.251, -0.061],
    ], 0.099, gunmetal, root, 0.0075);
    profile('Flicker vented foreguard', [
      [-0.34, 0.023], [-0.181, 0.022], [-0.143, 0.035], [-0.113, 0.025],
      [-0.103, -0.05], [-0.141, -0.088], [-0.284, -0.084], [-0.316, -0.071],
    ], 0.119, polymer, root, 0.007);
    profile('Flicker lower receiver spine', [
      [-0.142, -0.055], [0.067, -0.05], [0.138, -0.031], [0.179, -0.037],
      [0.161, -0.064], [0.036, -0.084], [-0.139, -0.087],
    ], 0.081, darkMetal);
    for (const side of [-1, 1]) {
      sidePlate('Flicker foreguard service plate', side * 0.065, [
        [-0.305, -0.012], [-0.279, 0.012], [-0.165, 0.012], [-0.13, -0.002],
        [-0.149, -0.064], [-0.283, -0.065],
      ], 0.004, railMetal);
      sidePlate('Flicker copper service rail', side * 0.052, [
        [-0.261, 0.032], [-0.239, 0.047], [-0.111, 0.047], [-0.097, 0.039],
        [-0.121, 0.031],
      ], 0.003, accentMetal);
      sidePlate('Flicker keyed rear panel', side * 0.055, [
        [-0.087, 0.024], [-0.061, 0.043], [0.122, 0.043], [0.157, 0.022],
        [0.128, -0.036], [-0.068, -0.036], [-0.09, -0.022],
      ], 0.006, darkMetal);
      for (let i = 0; i < 4; i += 1) {
        const z = -0.272 + i * 0.031;
        sidePlate('Flicker angled foreguard channel', side * 0.068, [
          [z - 0.008, -0.051], [z + 0.004, -0.051], [z + 0.017, -0.019],
          [z + 0.004, -0.019],
        ], 0.002, darkMetal);
      }
      box('Flicker low selector tab', [0.012, 0.014, 0.033], [side * 0.061, 0.019, 0.109], exposedMetal);
      mark?.({ x: side * 0.061, y: -0.003, z: 0.024, width: 0.125, height: 0.036, side });
    }
    axial('Flicker stepped emitter shroud', [
      [-0.435, 0.017], [-0.435, 0.026], [-0.427, 0.03], [-0.413, 0.03],
      [-0.41, 0.035], [-0.391, 0.035], [-0.385, 0.029], [-0.356, 0.029],
      [-0.35, 0.037], [-0.328, 0.037], [-0.326, 0.024],
    ], railMetal, [0, 0.005, 0]);
    ring('Dark muzzle rim', 0.016, 0.006, [0, 0.005, -0.435], darkMetal);
    box('Flicker shoulder hinge', [0.087, 0.056, 0.047], [0, 0.009, 0.186], darkMetal);
    profile('Flicker open shoulder frame top', [
      [0.18, 0.028], [0.275, 0.035], [0.29, 0.026], [0.288, 0.011], [0.18, 0.006],
    ], 0.059, railMetal);
    profile('Flicker open shoulder frame brace', [
      [0.179, -0.019], [0.204, -0.016], [0.289, -0.053],
      [0.29, -0.071], [0.27, -0.068], [0.175, -0.041],
    ], 0.037, darkMetal);
    box('Flicker shoulder plate', [0.089, 0.121, 0.029], [0, -0.022, 0.3], rubber);
    profile('Flicker swept control grip', [
      [0.059, -0.061], [0.121, -0.06], [0.146, -0.097], [0.163, -0.171],
      [0.147, -0.182], [0.097, -0.173], [0.075, -0.117],
    ], 0.062, rubber, root, 0.007);
    profile('Flicker curved guard', [
      [-0.027, -0.078], [-0.012, -0.08], [-0.005, -0.103], [0.019, -0.119],
      [0.06, -0.111], [0.074, -0.087], [0.085, -0.093], [0.069, -0.12],
      [0.018, -0.132], [-0.012, -0.114],
    ], 0.039, darkMetal, root, 0.003);
    box('Sight mounting shoe', [0.078, 0.031, 0.125], [0, 0.082, -0.01], railMetal);
    for (const x of [-0.034, 0.034]) box('Reflex shield', [0.014, 0.058, 0.045], [x, 0.121, 0.034], gunmetal);
    box('Reflex bridge', [0.075, 0.013, 0.044], [0, 0.151, 0.034], gunmetal);
    pane('Flicker lens', 0.029, [0, 0.124, 0.051], opticGlass);
    pane('Flicker aiming dot', 0.0023, [0, 0.132, 0.052], reticle);
    magazine = assembly('Flicker magazine', [0, -0.093, -0.06]);
    profile('Flicker magazine body', [
      [-0.037, 0.031], [0.038, 0.031], [0.035, -0.037], [0.02, -0.123],
      [-0.051, -0.123], [-0.048, -0.073],
    ], 0.068, darkMetal, magazine);
    profile('Flicker magazine jacket', [
      [-0.044, -0.016], [0.03, -0.018], [0.016, -0.112], [-0.05, -0.112],
    ], 0.072, polymer, magazine, 0.002);
    box('Flicker magazine base', [0.081, 0.021, 0.08], [0, -0.132, -0.01], polymer, magazine);
  } else if (id === 'precision') {
    profile('Meridian faceted action housing', [
      [-0.377, -0.032], [-0.364, 0.037], [-0.302, 0.051], [-0.214, 0.066],
      [0.157, 0.064], [0.22, 0.054], [0.263, 0.021], [0.243, -0.063],
      [0.111, -0.09], [-0.162, -0.081], [-0.314, -0.065],
    ], 0.103, gunmetal, root, 0.007);
    profile('Meridian shoulder chassis upper bar', [
      [0.16, 0.033], [0.265, 0.043], [0.39, 0.061], [0.512, 0.031],
      [0.516, 0.003], [0.417, 0.012], [0.274, -0.011], [0.182, -0.023],
    ], 0.081, polymer);
    profile('Meridian shoulder chassis lower brace', [
      [0.185, -0.043], [0.241, -0.047], [0.352, -0.074], [0.467, -0.069],
      [0.519, -0.027], [0.519, -0.105], [0.313, -0.096], [0.221, -0.066],
    ], 0.089, polymer);
    box('Meridian cheek rest', [0.102, 0.041, 0.196], [0, 0.071, 0.371], darkMetal);
    box('Meridian stock pad', [0.118, 0.14, 0.033], [0, -0.029, 0.528], rubber);
    profile('Meridian swept grip', [
      [0.062, -0.074], [0.11, -0.068], [0.144, -0.08], [0.161, -0.153],
      [0.148, -0.176], [0.093, -0.173], [0.077, -0.158],
    ], 0.061, rubber, root, 0.007);
    profile('Meridian integrated lower guard', [
      [-0.037, -0.069], [-0.022, -0.071], [-0.013, -0.104], [0.006, -0.116],
      [0.06, -0.112], [0.076, -0.089], [0.087, -0.094], [0.068, -0.126],
      [0.008, -0.129], [-0.025, -0.113],
    ], 0.044, railMetal, root, 0.003);
    axial('Meridian stepped barrel sleeve', [
      [-0.833, 0.022], [-0.833, 0.036], [-0.822, 0.04], [-0.785, 0.04],
      [-0.779, 0.035], [-0.747, 0.035], [-0.737, 0.024], [-0.468, 0.023],
      [-0.45, 0.028], [-0.405, 0.029], [-0.385, 0.034], [-0.346, 0.034],
    ], railMetal, [0, 0.02, 0], 28);
    ring('Meridian muzzle rim', 0.02, 0.009, [0, 0.02, -0.84], exposedMetal);
    for (const side of [-1, 1]) {
      sidePlate('Meridian shallow foreguard shell', side * 0.054, [
        [-0.354, 0.027], [-0.289, 0.049], [-0.112, 0.048], [-0.077, 0.014],
        [-0.145, -0.068], [-0.292, -0.06], [-0.343, -0.037],
      ], 0.008, darkMetal);
      sidePlate('Meridian foreguard inlay', side * 0.06, [
        [-0.304, 0.023], [-0.274, 0.037], [-0.132, 0.037], [-0.109, 0.027],
        [-0.131, 0.016], [-0.295, 0.017],
      ], 0.003, accentMetal);
      sidePlate('Meridian stiffener ledge', side * 0.059, [
        [-0.327, -0.032], [-0.148, -0.037], [-0.12, -0.027],
        [-0.15, -0.051], [-0.315, -0.052],
      ], 0.004, railMetal);
      sidePlate('Meridian action face', side * 0.055, [
        [-0.052, 0.038], [0.147, 0.039], [0.192, 0.012], [0.15, -0.04],
        [-0.046, -0.037], [-0.07, -0.019],
      ], 0.008, railMetal);
      mark?.({ x: side * 0.061, y: -0.002, z: 0.032, width: 0.125, height: 0.035, side });
    }
    for (const z of [-0.139, 0.121]) box('Scope mount', [0.068, 0.066, 0.035], [0, 0.086, z], railMetal);
    axial('Meridian indexed scope housing', [
      [-0.224, 0.048], [-0.224, 0.061], [-0.215, 0.065], [-0.193, 0.065],
      [-0.185, 0.06], [-0.145, 0.06], [-0.109, 0.042], [-0.052, 0.042],
      [-0.042, 0.048], [0.047, 0.048], [0.061, 0.041], [0.12, 0.041],
      [0.143, 0.054], [0.172, 0.054], [0.177, 0.06], [0.199, 0.06],
      [0.207, 0.054], [0.207, 0.043],
    ], darkMetal, [0, 0.169, 0], 28);
    axial('Meridian optic collar', [
      [0.152, 0.053], [0.154, 0.056], [0.158, 0.056], [0.16, 0.053],
      [0.167, 0.053], [0.169, 0.057], [0.173, 0.057], [0.176, 0.055],
    ], railMetal, [0, 0.169, 0]);
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
      [-0.122, -0.018], [-0.087, 0.01], [-0.028, 0.019], [0.112, 0.011],
      [0.155, -0.009], [0.169, -0.031], [0.147, -0.073], [0.109, -0.084],
      [0.02, -0.074], [-0.055, -0.085], [-0.105, -0.076],
    ], 0.067, rubber, root, 0.008);
    for (const side of [-1, 1]) {
      sidePlate('Arc Cutter molded grip shell', side * 0.036, [
        [-0.094, -0.023], [-0.048, -0.004], [0.106, -0.009], [0.142, -0.027],
        [0.115, -0.064], [0.036, -0.055], [-0.06, -0.065],
      ], 0.006, polymer);
      for (let i = 0; i < 3; i += 1) {
        box('Arc Cutter molded grip ridge', [0.008, 0.026, 0.009],
          [side * 0.041, -0.035, -0.008 + i * 0.04], rubber).rotation.x = -0.45;
      }
    }
    profile('Arc Cutter flared guard', [
      [-0.148, 0.031], [-0.125, 0.038], [-0.1, 0.014], [-0.107, -0.065],
      [-0.129, -0.093], [-0.147, -0.085],
    ], 0.097, railMetal, root, 0.006);
    profile('Arc Cutter shaped blade', [
      [-0.468, 0.064], [-0.445, 0.1], [-0.408, 0.112], [-0.261, 0.117],
      [-0.231, 0.109], [-0.131, 0.048], [-0.12, 0.019], [-0.122, -0.013],
      [-0.238, -0.007], [-0.328, 0.04],
    ], 0.023, exposedMetal, root, 0.005);
    profile('Arc Cutter dark spine', [
      [-0.441, 0.102], [-0.407, 0.11], [-0.258, 0.115], [-0.225, 0.105],
      [-0.131, 0.048], [-0.142, 0.027], [-0.239, 0.077], [-0.397, 0.083],
    ], 0.031, darkMetal, root, 0.002);
    for (const side of [-1, 1]) {
      sidePlate('Arc Cutter bevel highlight', side * 0.012, [
        [-0.455, 0.069], [-0.42, 0.083], [-0.331, 0.058], [-0.234, 0.014],
        [-0.132, 0.011], [-0.133, -0.007], [-0.235, -0.004], [-0.326, 0.042],
      ], 0.002, railMetal);
      mark?.({ x: side * 0.018, y: 0.086, z: -0.335, width: 0.122, height: 0.025, side });
    }
    profile('Cyan tool edge', [
      [-0.461, 0.061], [-0.325, 0.033], [-0.238, -0.01], [-0.124, -0.017],
      [-0.145, -0.026], [-0.246, -0.022], [-0.33, 0.023],
    ], 0.014, reticle, root, 0.002);
    box('Arc Cutter brass collar', [0.082, 0.051, 0.053], [0, -0.021, -0.144], accentMetal);
  } else {
    const heavy = id === 'heavy-sidearm';
    const nose = heavy ? -0.287 : -0.237;
    const width = heavy ? 0.092 : 0.07;
    movingPart = assembly(heavy ? 'Cinder cycling slide' : 'Ember cycling slide', [0, 0, 0]);
    const slideOutline = heavy ? [
      [nose, 0.011], [nose, 0.049], [nose + 0.035, 0.075], [-0.123, 0.075],
      [-0.092, 0.069], [0.133, 0.071], [0.161, 0.052], [0.151, 0.011],
    ] : [
      [nose, 0.014], [nose + 0.017, 0.049], [nose + 0.073, 0.072], [-0.065, 0.072],
      [-0.04, 0.065], [0.129, 0.065], [0.154, 0.043], [0.144, 0.012],
    ];
    profile(heavy ? 'Cinder angular metal upper' : 'Ember tapered upper', slideOutline,
      width, heavy ? exposedMetal : gunmetal, movingPart, heavy ? 0.005 : 0.007);
    profile(heavy ? 'Cinder crown' : 'Ember raised crown', [
      [nose + 0.039, 0.057], [nose + 0.072, 0.075], [-0.093, 0.079],
      [-0.053, 0.074], [0.114, 0.074], [0.135, 0.057],
    ], width * (heavy ? 0.62 : 0.69), heavy ? railMetal : darkMetal, movingPart, 0.002);
    tube('Front insert', width * 0.31, width * 0.31, 0.036, [0, 0.037, nose - 0.005], darkMetal);
    ring('Front rim', width * 0.27, 0.004, [0, 0.037, nose - 0.026], railMetal);
    profile(heavy ? 'Cinder reinforced chassis' : 'Ember rounded polymer chassis', [
      [nose + 0.026, 0.006], [nose + 0.05, 0.015], [0.105, 0.015], [0.142, 0.007],
      [0.151, -0.061], [0.177, -0.169], [0.179, -0.195], [0.152, -0.209],
      [0.077, -0.202], [0.054, -0.178], [0.037, -0.084], [-0.004, -0.053],
      [nose + 0.073, -0.043],
    ], width * 0.9, polymer, root, heavy ? 0.006 : 0.008);
    box('Handgrip front pad', [width * 0.95, 0.118, 0.083], [0, -0.134, 0.089], rubber).rotation.x = -0.24;
    profile('Contoured guard loop', [
      [-0.103, -0.027], [-0.088, -0.033], [-0.076, -0.066], [-0.052, -0.083],
      [0.009, -0.077], [0.024, -0.058], [0.039, -0.062], [0.02, -0.088],
      [-0.005, -0.097], [-0.062, -0.099], [-0.092, -0.077],
    ], 0.031, darkMetal, root, 0.003);
    const height = heavy ? 0.109 : 0.09;
    box('Front aiming blade', [0.017, height - 0.06, 0.021], [0, (height + 0.06) * 0.5, nose + 0.04], darkMetal, movingPart);
    box('Front luminous index', [0.006, 0.007, 0.003], [0, height - 0.005, nose + 0.052], reticle, movingPart);
    for (const x of [-0.025, 0.025]) box('Rear aiming ear', [0.018, height - 0.064, 0.027], [x, (height + 0.064) * 0.5, 0.119], darkMetal, movingPart);
    for (const side of [-1, 1]) {
      sidePlate(heavy ? 'Cinder machined side relief' : 'Ember swept upper insert', side * width * 0.515, [
        [nose + 0.043, 0.029], [nose + 0.073, 0.054], [-0.08, 0.054],
        [-0.052, 0.044], [-0.081, 0.025],
      ], 0.004, heavy ? darkMetal : railMetal, movingPart);
      for (let i = 0; i < 4; i += 1) {
        const z = 0.035 + i * 0.022;
        sidePlate('Sidearm rear slide relief', side * width * 0.535, [
          [z - 0.007, 0.027], [z + 0.003, 0.027], [z + 0.011, 0.058],
          [z + 0.001, 0.058],
        ], 0.003, darkMetal, movingPart);
      }
      sidePlate('Sidearm identity inlay', side * width * 0.555, [
        [nose + 0.067, 0.034], [nose + 0.083, 0.045], [-0.097, 0.045], [-0.113, 0.034],
      ], 0.002, heavy ? accentMetal : exposedMetal, movingPart);
      sidePlate('Sidearm overmolded grip insert', side * width * 0.485, [
        [0.07, -0.071], [0.126, -0.067], [0.156, -0.173], [0.145, -0.19],
        [0.083, -0.187], [0.066, -0.167],
      ], 0.006, rubber);
      box('Sidearm low control', [0.012, 0.013, 0.046],
        [side * width * 0.56, -0.017, 0.055], heavy ? darkMetal : railMetal);
      mark?.({ x: side * (width * 0.45 + (heavy ? 0.0065 : 0.0085)), y: -0.017, z: -0.125,
        width: heavy ? 0.119 : 0.092, height: 0.03, side });
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
