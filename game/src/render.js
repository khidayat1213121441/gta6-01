// Drawing only, in 3D: the Three.js scene for Solmar City. The ground is
// one canvas-painted texture (roads, districts, beach, sea) so the whole
// city costs a single draw call; buildings and trees are InstancedMeshes;
// cars, pedestrians and the player are small Groups synced from the plain
// state objects every frame. The sun, sky and fog follow the in-game clock,
// so morning, dusk and night all read differently.
import * as THREE from 'three';
import { CITY } from './config.js';
import { districtAt } from './world.js';
import { currentWeapon } from './combat.js';

const { pitch, size } = CITY;
const TEX = 2048;
const SCALE = TEX / size;

function districtFill(district) {
  switch (district) {
    case 'downtown': return '#7d7f88';
    case 'industrial': return '#6f6f68';
    case 'barrio': return '#a9805a';
    case 'residential': return '#6a9a58';
    case 'park': return '#3f7a37';
    case 'beach': return '#e0c98f';
    case 'sea': return '#2b7fb8';
    default: return '#5d9b4a';
  }
}

function paintGround(city) {
  const canvas = document.createElement('canvas');
  canvas.width = TEX;
  canvas.height = TEX;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5d9b4a';
  ctx.fillRect(0, 0, TEX, TEX);
  // District ground, block by block.
  for (let bx = 0; bx < 40; bx += 1) {
    for (let bz = 0; bz < 40; bz += 1) {
      ctx.fillStyle = districtFill(districtAt(bx, bz));
      ctx.fillRect(bx * pitch * SCALE, bz * pitch * SCALE, pitch * SCALE, pitch * SCALE);
    }
  }
  ctx.fillStyle = '#3a3d44';
  for (let i = 0; i < 40; i += 1) {
    const c = i * pitch * SCALE;
    ctx.fillRect(c, 0, 48 * SCALE, TEX);
    ctx.fillRect(0, c, TEX, 48 * SCALE);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 40; i += 1) {
    const c = i * pitch * SCALE;
    ctx.beginPath();
    ctx.moveTo(c + 2, 0); ctx.lineTo(c + 2, TEX);
    ctx.moveTo(c + 48 * SCALE - 2, 0); ctx.lineTo(c + 48 * SCALE - 2, TEX);
    ctx.moveTo(0, c + 2); ctx.lineTo(TEX, c + 2);
    ctx.moveTo(0, c + 48 * SCALE - 2); ctx.lineTo(TEX, c + 48 * SCALE - 2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#d8c95a';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 18]);
  for (let i = 0; i < 40; i += 1) {
    const c = (i * pitch + 24) * SCALE;
    ctx.beginPath();
    ctx.moveTo(c, 0); ctx.lineTo(c, TEX);
    ctx.moveTo(0, c); ctx.lineTo(TEX, c);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Sea shimmer: lighter streaks on the water.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 24; i += 1) {
    const y = ((i * 173) % TEX);
    ctx.beginPath();
    ctx.moveTo(38 * pitch * SCALE + 10, y);
    ctx.lineTo(TEX - 10, y + 30);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function lighten(hex, amount) {
  const r = Math.min(255, ((hex >> 16) & 255) + amount);
  const g = Math.min(255, ((hex >> 8) & 255) + amount);
  const b = Math.min(255, (hex & 255) + amount);
  return (r << 16) | (g << 8) | b;
}

// Building faces: a window grid painted once onto two small canvases and
// shared by every building (one InstancedMesh, one material). The colour
// map is near-white so each building's instance colour still shows, with
// dark window cells so the grid reads in daylight; the emissive map is
// black except for the lit windows, so at dusk only the windows glow warm
// against the wall instead of the whole facade washing orange. Both maps
// paint the same cells, decided by a fixed hash so they can never drift.
function paintBuildingWindows() {
  const COLS = 8;
  const ROWS = 14;
  const W = 256;
  const H = 256;
  const cw = W / COLS;
  const ch = H / ROWS;
  const map = document.createElement('canvas');
  const emissive = document.createElement('canvas');
  map.width = W; map.height = H;
  emissive.width = W; emissive.height = H;
  const mctx = map.getContext('2d');
  const ectx = emissive.getContext('2d');
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(0, 0, W, H);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, W, H);
  for (let cy = 0; cy < ROWS; cy += 1) {
    for (let cx = 0; cx < COLS; cx += 1) {
      // Deterministic hash: ~40% of windows lit, the rest dark glass.
      const lit = ((cx * 7 + cy * 13 + cx * cy * 5) % 10) < 4;
      const x = Math.round(cx * cw + 5);
      const y = Math.round(cy * ch + 4);
      const w = Math.round(cw - 10);
      const h = Math.round(ch - 8);
      if (lit) {
        mctx.fillStyle = '#ffe6a8';
        mctx.fillRect(x, y, w, h);
        ectx.fillStyle = '#ffb347';
        ectx.fillRect(x, y, w, h);
      } else {
        mctx.fillStyle = '#33333e';
        mctx.fillRect(x, y, w, h);
      }
    }
  }
  const mapTex = new THREE.CanvasTexture(map);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  const emissiveTex = new THREE.CanvasTexture(emissive);
  emissiveTex.colorSpace = THREE.SRGBColorSpace;
  return { map: mapTex, emissiveMap: emissiveTex };
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 10);
const pedBodyGeo = new THREE.CylinderGeometry(0.55, 0.7, 1.7, 8);
const pedHeadGeo = new THREE.SphereGeometry(0.45, 10, 8);
const bulletGeo = new THREE.BoxGeometry(1.2, 1.2, 10);

function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  group.scale.set(10, 10, 10);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });
  const body = new THREE.Mesh(boxGeo, bodyMat);
  body.scale.set(2.6, 1.1, 5.4);
  body.position.y = 0.85;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.15, metalness: 0.6 }));
  cabin.scale.set(2.2, 0.9, 2.6);
  cabin.position.set(0, 1.75, -0.3);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  for (const [wx, wz] of [[-1.3, 1.7], [1.3, 1.7], [-1.3, -1.7], [1.3, -1.7]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.55, wz);
    group.add(wheel);
  }
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffedb0, emissiveIntensity: 0.7 });
  for (const wx of [-0.9, 0.9]) {
    const light = new THREE.Mesh(boxGeo, lightMat);
    light.scale.set(0.5, 0.35, 0.2);
    light.position.set(wx, 0.9, 2.75);
    group.add(light);
  }
  let redLight = null;
  let blueLight = null;
  if (isPolice) {
    redLight = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 1 }));
    redLight.scale.set(0.7, 0.4, 0.7);
    redLight.position.set(-0.55, 2.35, -0.3);
    group.add(redLight);
    blueLight = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x3b82ff, emissive: 0x3b82ff, emissiveIntensity: 1 }));
    blueLight.scale.set(0.7, 0.4, 0.7);
    blueLight.position.set(0.55, 2.35, -0.3);
    group.add(blueLight);
  }
  group.userData = { body, redLight, blueLight };
  return group;
}

function makePedMesh(color) {
  const group = new THREE.Group();
  group.scale.setScalar(8);
  const body = new THREE.Mesh(pedBodyGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  body.position.y = 1.15;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(pedHeadGeo, new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.7 }));
  head.position.y = 2.35;
  head.castShadow = true;
  group.add(head);
  return group;
}

export function createRenderer(canvas, state) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5d6);
  scene.fog = new THREE.Fog(0x9fc3dd, 500, 1600);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 4000);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.2);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xbfd0e8, 0.85);
  fill.position.set(-200, 160, -120);
  scene.add(fill);
  const sun = new THREE.DirectionalLight(0xffe3b3, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: paintGround(state.city), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(size / 2, 0, size / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(size - 38 * pitch, size),
    new THREE.MeshStandardMaterial({ color: 0x2b7fb8, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.55 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(38 * pitch + (size - 38 * pitch) / 2, 0.4, size / 2);
  scene.add(sea);

  const city = state.city;
  const windowTex = paintBuildingWindows();
  const buildingMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({
    roughness: 0.85, map: windowTex.map, emissiveMap: windowTex.emissiveMap,
    emissive: 0xffffff, emissiveIntensity: 0.1,
  }), city.buildings.length);
  const roofMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), city.buildings.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  city.buildings.forEach((b, i) => {
    dummy.position.set(b.x, b.h / 2, b.z);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    buildingMesh.setMatrixAt(i, dummy.matrix);
    buildingMesh.setColorAt(i, color.setHex(b.color));
    dummy.position.set(b.x, b.h + 0.8, b.z);
    dummy.scale.set(b.w * 0.92, 1.6, b.d * 0.92);
    dummy.updateMatrix();
    roofMesh.setMatrixAt(i, dummy.matrix);
    roofMesh.setColorAt(i, color.setHex(lighten(b.color, 24)));
  });
  buildingMesh.castShadow = true;
  buildingMesh.receiveShadow = true;
  roofMesh.castShadow = true;
  scene.add(buildingMesh);
  scene.add(roofMesh);

  // Trees: trunks + canopies, instanced.
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.5, 0.8, 4, 6),
    new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 }),
    city.trees.length,
  );
  const canopyMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(2.2, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x3f7a37, roughness: 1 }),
    city.trees.length,
  );
  city.trees.forEach((t, i) => {
    const s = t.s * 6; // trees stand ~25 units tall
    dummy.position.set(t.x, 2 * s, t.z);
    dummy.scale.set(s, s * (t.palm ? 1.8 : 1), s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x, 4.6 * s + (t.palm ? 2 * s : 0), t.z);
    dummy.scale.set(s, s * (t.palm ? 0.7 : 1), s);
    dummy.updateMatrix();
    canopyMesh.setMatrixAt(i, dummy.matrix);
    canopyMesh.setColorAt(i, color.setHex(t.palm ? 0x4a8a3a : 0x3f7a37));
  });
  trunkMesh.castShadow = true;
  canopyMesh.castShadow = true;
  scene.add(trunkMesh);
  scene.add(canopyMesh);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(14, 22, 200, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 100;
  scene.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(30, 44, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.6;
  scene.add(ring);
  const taxiRing = new THREE.Mesh(
    new THREE.RingGeometry(24, 34, 32),
    new THREE.MeshBasicMaterial({ color: 0x7ee081, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  taxiRing.rotation.x = -Math.PI / 2;
  taxiRing.position.y = 0.6;
  scene.add(taxiRing);
  // Street-race checkpoint ring.
  const raceRing = new THREE.Mesh(
    new THREE.RingGeometry(30, 44, 32),
    new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  raceRing.rotation.x = -Math.PI / 2;
  raceRing.position.y = 0.6;
  scene.add(raceRing);

  const heliGroup = new THREE.Group();
  const heliBody = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x1c3a6e, roughness: 0.5, metalness: 0.4 }));
  heliBody.scale.set(26, 10, 40);
  heliBody.position.y = 0;
  heliGroup.add(heliBody);
  const heliRotor = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }));
  heliRotor.scale.set(90, 1.5, 4);
  heliRotor.position.y = 8;
  heliGroup.add(heliRotor);
  const heliLight = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.5 }));
  heliLight.scale.set(6, 4, 6);
  heliLight.position.set(0, -6, 14);
  heliGroup.add(heliLight);
  heliGroup.visible = false;
  scene.add(heliGroup);
  const spotCone = new THREE.Mesh(
    new THREE.ConeGeometry(42, 1, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  );
  spotCone.visible = false;
  scene.add(spotCone);
  const spotPool = new THREE.Mesh(
    new THREE.CircleGeometry(45, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  spotPool.rotation.x = -Math.PI / 2;
  spotPool.position.y = 0.7;
  spotPool.visible = false;
  scene.add(spotPool);

  const clouds = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffd9b0, transparent: true, opacity: 0.35, fog: false });
  for (let i = 0; i < 10; i += 1) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), cloudMat);
    cloud.scale.set(70 + state.rng() * 60, 8 + state.rng() * 6, 26 + state.rng() * 18);
    cloud.position.set(state.rng() * size, 380 + state.rng() * 120, state.rng() * size);
    scene.add(cloud);
    clouds.push(cloud);
  }

  // Packages: small glowing orange boxes.
  const packageMeshes = city.packages.map(() => {
    const m = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xff8c1a, emissive: 0xff8c1a, emissiveIntensity: 0.9, roughness: 0.4 }));
    m.scale.set(8, 6, 8);
    m.castShadow = true;
    scene.add(m);
    return m;
  });

  // Dynamic meshes, keyed by object.
  const carMeshes = new Map();
  const pedMeshes = new Map();
  const bulletMeshes = [];
  const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
  for (let i = 0; i < 24; i += 1) {
    const m = new THREE.Mesh(bulletGeo, bulletMat);
    m.visible = false;
    scene.add(m);
    bulletMeshes.push(m);
  }
  const playerMesh = makePedMesh(0xff6a1a);
  playerMesh.scale.setScalar(9.2); // the hero reads bigger than a passer-by
  // The hero is not another orange ped: dark jacket, so the silhouette
  // reads as a person against the road instead of a traffic cone.
  playerMesh.children[0].material.color.setHex(0x2b3247);
  scene.add(playerMesh);
  // Gun group: a pistol big enough to read at chase-cam distance, held
  // out at the player's right side so it reads from behind the player
  // (a forward-held gun is hidden by the torso from the chase camera).
  // Children of the player mesh, so scale and position are in the mesh's
  // local units (the group is scaled ~9x).
  const gunGroup = new THREE.Group();
  const gunMesh = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.7 }));
  gunMesh.scale.set(0.26, 0.26, 1.1);
  gunMesh.position.set(0.85, 1.15, 0.6);
  gunGroup.add(gunMesh);
  const armMesh = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x2b3247, roughness: 0.8 }));
  armMesh.scale.set(0.2, 0.2, 0.9);
  armMesh.position.set(0.7, 1.3, 0.25);
  gunGroup.add(armMesh);
  playerMesh.add(gunGroup);

  const MAX_PARTICLES = 400;
  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(MAX_PARTICLES * 3);
  const particleCol = new Float32Array(MAX_PARTICLES * 3);
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(particleCol, 3));
  const particles = new THREE.Points(particleGeo, new THREE.PointsMaterial({ size: 6, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
  particles.frustumCulled = false;
  scene.add(particles);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  const daySky = new THREE.Color(0x87b5d6);
  const duskSky = new THREE.Color(0xea7a44);
  const duskSkyLow = new THREE.Color(0x8a4a8a);
  const nightSky = new THREE.Color(0x0e1a2e);
  const dayFog = new THREE.Color(0x9fc3dd);
  const duskFog = new THREE.Color(0xd88a5e);
  const nightFog = new THREE.Color(0x101c30);
  const sky = new THREE.Color();
  const fog = new THREE.Color();

  function update(dt, time) {
    // --- clock: sun, sky, fog ---
    const t = state.clock / 86400; // 0..1 through the day
    const sunAngle = (t - 0.25) * Math.PI * 2; // sunrise ~06:00, sunset ~18:00
    const elevation = Math.sin(sunAngle);
    const dayFactor = Math.max(0, Math.min(1, elevation * 2.2 + 0.25));
    const duskFactor = Math.max(0, 1 - Math.abs(elevation) * 4) * (elevation > -0.15 ? 1 : 0);
    sky.copy(nightSky).lerp(daySky, dayFactor).lerp(duskSky, duskFactor * 0.7).lerp(duskSkyLow, duskFactor * 0.25);
    fog.copy(nightFog).lerp(dayFog, dayFactor).lerp(duskFog, duskFactor * 0.7);
    scene.background.copy(sky);
    scene.fog.color.copy(fog);
    // Lit windows only: the emissive map is black except for lit cells,
    // so the glow reads as windows, not a flat orange wash. A small base
    // keeps the grid legible before dusk; dusk pushes it to a real glow.
    buildingMesh.material.emissive.setHex(0xffffff);
    buildingMesh.material.emissiveIntensity = 0.12 + duskFactor * 1.5;
    roofMesh.material.emissive.setHex(0xff9a3d);
    roofMesh.material.emissiveIntensity = duskFactor * 0.12;
    scene.fog.near = 700 + dayFactor * 300;
    scene.fog.far = 2000 + dayFactor * 900;
    const sunDir = new THREE.Vector3(Math.cos(sunAngle) * 0.7, Math.max(0.12, elevation), 0.45).normalize();
    const px = state.player.x;
    const pz = state.player.z;
    sun.position.set(px + sunDir.x * 420, sunDir.y * 420 + 60, pz + sunDir.z * 420);
    sun.target.position.set(px, 0, pz);
    sun.intensity = 0.35 + dayFactor * 2.5;
    sun.color.setHex(duskFactor > 0.4 ? 0xff9a4d : 0xffe3b3);
    hemi.intensity = 0.65 + dayFactor * 0.9;
    renderer.toneMappingExposure = 1.08 + dayFactor * 0.08;

    // --- cars ---
    const seenCars = new Set();
    for (const car of state.cars) {
      seenCars.add(car.id);
      let mesh = carMeshes.get(car.id);
      if (!mesh) {
        mesh = makeCarMesh(car.color, car.kind === 'police');
        scene.add(mesh);
        carMeshes.set(car.id, mesh);
      }
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.angle;
      const ud = mesh.userData;
      const steerLean = Math.max(-0.06, Math.min(0.06, -car.speed * 0.00012 * Math.sin(car.angle)));
      ud.body.rotation.z = steerLean;
      if (ud.redLight) {
        const phase = Math.sin(car.sirenPhase);
        ud.redLight.material.emissiveIntensity = phase > 0 ? 2.2 : 0.15;
        ud.blueLight.material.emissiveIntensity = phase > 0 ? 0.15 : 2.2;
      }
    }
    for (const [id, mesh] of carMeshes) {
      if (!seenCars.has(id)) {
        scene.remove(mesh);
        carMeshes.delete(id);
      }
    }

    // --- pedestrians + cops ---
    const seenPeds = new Set();
    for (const ped of state.peds) {
      seenPeds.add(ped);
      let mesh = pedMeshes.get(ped);
      if (!mesh) {
        mesh = makePedMesh(ped.color);
        scene.add(mesh);
        pedMeshes.set(ped, mesh);
      }
      mesh.position.set(ped.x, ped.dead ? 0.4 : Math.abs(Math.sin(time * 6 + ped.x)) * 0.6, ped.z);
      if (ped.dead) {
        mesh.rotation.set(Math.PI / 2, 0, ped.angle);
      } else {
        mesh.rotation.set(0, ped.angle, 0);
      }
    }
    for (const [ped, mesh] of pedMeshes) {
      if (!seenPeds.has(ped)) {
        scene.remove(mesh);
        pedMeshes.delete(ped);
      }
    }

    // --- player ---
    const player = state.player;
    playerMesh.visible = !player.inCar;
    if (!player.inCar) {
      playerMesh.position.set(player.x, player.moving ? Math.abs(Math.sin(time * 9)) * 0.8 : 0, player.z);
      playerMesh.rotation.y = player.angle;
      gunGroup.visible = currentWeapon(player).id !== 'fists';
    }

    // --- helicopter + searchlight ---
    const heli = state.heli;
    const heliOn = !!(heli && heli.active);
    heliGroup.visible = heliOn;
    spotCone.visible = heliOn;
    spotPool.visible = heliOn;
    if (heliOn) {
      heliGroup.position.set(heli.x, heli.height, heli.z);
      heliGroup.rotation.y = heli.angle;
      heliRotor.rotation.y = time * 22;
      const top = new THREE.Vector3(heli.x, heli.height, heli.z);
      const bottom = new THREE.Vector3(player.x, 0, player.z);
      const mid = top.clone().add(bottom).multiplyScalar(0.5);
      const len = top.distanceTo(bottom);
      spotCone.position.copy(mid);
      spotCone.scale.set(1, len, 1);
      const dir = top.clone().sub(bottom).normalize();
      spotCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      spotPool.position.set(player.x, 0.7, player.z);
      const poolPulse = 1 + Math.sin(time * 5) * 0.06;
      spotPool.scale.set(poolPulse, poolPulse, 1);
    }

    // --- clouds drift ---
    for (const cloud of clouds) {
      cloud.position.x += dt * 3;
      if (cloud.position.x > size + 200) cloud.position.x = -200;
    }

    // --- race ring ---
    const race = state.race;
    const showRace = !!(race && race.active && race.target);
    raceRing.visible = showRace;
    if (showRace) {
      raceRing.position.set(race.target.x, 0.6, race.target.z);
      const pulse = 1 + Math.sin(time * 4) * 0.15;
      raceRing.scale.set(pulse, pulse, 1);
    }

    // --- bullets ---
    state.bullets.forEach((b, i) => {
      const m = bulletMeshes[i];
      if (!m) return;
      m.visible = true;
      m.position.set(b.x, 8, b.z);
      m.rotation.y = Math.atan2(b.vx, b.vz);
    });
    for (let i = state.bullets.length; i < bulletMeshes.length; i += 1) bulletMeshes[i].visible = false;

    // --- particles ---
    const count = Math.min(state.particles.length, MAX_PARTICLES);
    for (let i = 0; i < count; i += 1) {
      const p = state.particles[i];
      particlePos[i * 3] = p.x;
      particlePos[i * 3 + 1] = 1.5;
      particlePos[i * 3 + 2] = p.z;
      const c = new THREE.Color(p.color);
      particleCol[i * 3] = c.r;
      particleCol[i * 3 + 1] = c.g;
      particleCol[i * 3 + 2] = c.b;
    }
    particleGeo.attributes.position.needsUpdate = true;
    particleGeo.attributes.color.needsUpdate = true;
    particleGeo.setDrawRange(0, count);

    // --- packages ---
    city.packages.forEach((pkg, i) => {
      const m = packageMeshes[i];
      m.visible = !pkg.taken;
      if (m.visible) {
        m.position.set(pkg.x, 4 + Math.sin(time * 2 + i) * 1.5, pkg.z);
        m.rotation.y = time * 1.2 + i;
      }
    });

    // --- markers ---
    const target = state.mission.target;
    const showBeam = !!target && !state.mission.done;
    beam.visible = showBeam;
    ring.visible = showBeam;
    if (showBeam) {
      beam.position.set(target.x, 100, target.z);
      ring.position.set(target.x, 0.6, target.z);
      const pulse = 1 + Math.sin(time * 3) * 0.15;
      ring.scale.set(pulse, pulse, 1);
      beam.material.opacity = 0.22 + Math.sin(time * 3) * 0.08;
    }
    const taxi = state.taxi;
    const showTaxi = !!(taxi && taxi.active && !taxi.hasPassenger && state.mission.index !== 1);
    taxiRing.visible = showTaxi;
    if (showTaxi) {
      taxiRing.position.set(taxi.px, 0.6, taxi.pz);
      const pulse = 1 + Math.sin(time * 4) * 0.2;
      taxiRing.scale.set(pulse, pulse, 1);
    }
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, update, render, resize };
}
