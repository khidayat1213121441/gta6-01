// Screenshot scenes behind ?shot=cover|drive|mission|start (with &seed=N).
// Each one stages the real game state — real city, real cars, real wanted
// level, real mission — then the normal renderer and HUD paint it, so the
// frame is what playing the game really looks like and the same seed always
// gives the same frame.
import { makeCar, spawnPoliceCar } from './vehicles.js';
import { startMission } from './missions.js';

const DOWNTOWN = 20 * 144 + 24; // road centreline through downtown

function placePed(state, x, z, color) {
  state.peds.push({
    x, z,
    angle: state.rng() * Math.PI * 2,
    speed: 55,
    color,
    kind: 'ped',
    state: 'walk',
    targetX: x + 100, targetZ: z,
    fleeTimer: 0, dead: false, deadTimer: 0,
  });
}

function placeTraffic(state, x, z, angle, colorIndex) {
  const car = makeCar(state, x, z, angle, 'traffic', colorIndex);
  car.cruise = 120;
  car.speed = 110;
  return car;
}

function setClock(state, hours, minutes) {
  state.clock = (hours * 3600 + minutes * 60) % 86400;
}

export function stageShot(name, state) {
  const rng = state.rng;
  const player = state.player;

  if (name === 'start') {
    // Dusk street action, on foot: pistol out, 2 stars, peds + traffic +
    // a cruiser closing in. No title menu — this is the game, live.
    // The player faces +x down the road, so the cruiser and traffic sit
    // ahead of the camera, on the road, not behind it.
    setClock(state, 18, 5);
    startMission(state, 0);
    player.x = DOWNTOWN;
    player.z = DOWNTOWN;
    player.angle = Math.PI / 2;
    player.cash = 320;
    player.health = 100;
    player.weapons = { owned: ['fists', 'pistol'], current: 'pistol' };
    state.wanted.stars = 2;
    state.wanted.heat = 28;
    const cop = spawnPoliceCar(state, DOWNTOWN + 300, DOWNTOWN - 12);
    cop.angle = -Math.PI / 2;
    cop.speed = 260;
    placeTraffic(state, DOWNTOWN + 180, DOWNTOWN + 12, Math.PI / 2, 1);
    placeTraffic(state, DOWNTOWN + 420, DOWNTOWN - 12, -Math.PI / 2, 2);
    placeTraffic(state, DOWNTOWN + 560, DOWNTOWN + 12, Math.PI / 2, 5);
    placePed(state, DOWNTOWN + 40, DOWNTOWN - 56, 0xe8e0d0);
    placePed(state, DOWNTOWN + 90, DOWNTOWN + 56, 0x3a6fd2);
    placePed(state, DOWNTOWN + 260, DOWNTOWN - 56, 0xd23b2e);
    placePed(state, DOWNTOWN + 360, DOWNTOWN + 56, 0x2ed2a2);
    return { screen: 'play' };
  }

  if (name === 'drive') {
    setClock(state, 17, 45);
    startMission(state, 0);
    state.mission.phase = 'drive';
    const car = makeCar(state, DOWNTOWN, DOWNTOWN + 40, 0, 'player', 0);
    car.speed = 200;
    player.inCar = car;
    player.x = car.x;
    player.z = car.z;
    player.angle = car.angle;
    player.cash = 150;
    placeTraffic(state, DOWNTOWN - 24, DOWNTOWN - 320, 0, 1);
    placeTraffic(state, DOWNTOWN + 24, DOWNTOWN + 380, Math.PI, 3);
    placeTraffic(state, DOWNTOWN + 420, DOWNTOWN - 24, -Math.PI / 2, 4);
    placeTraffic(state, DOWNTOWN - 420, DOWNTOWN + 24, Math.PI / 2, 6);
    placeTraffic(state, DOWNTOWN + 24, DOWNTOWN - 620, 0, 2);
    placePed(state, DOWNTOWN - 56, DOWNTOWN + 160, 0xd23b2e);
    placePed(state, DOWNTOWN + 56, DOWNTOWN - 140, 0x2ed2a2);
    placePed(state, DOWNTOWN - 56, DOWNTOWN - 300, 0xe0a53a);
    return { screen: 'play' };
  }

  if (name === 'mission') {
    setClock(state, 18, 0);
    startMission(state, 2);
    state.mission.count = 1;
    const marina = state.city.landmarks.marina;
    const pkg = state.city.packages.find((p) => !p.taken);
    player.x = marina.x - 40;
    player.z = marina.z + 60;
    player.angle = Math.PI * 0.75; // face the stashed package
    player.cash = 870;
    player.health = 100;
    state.wanted.stars = 1;
    state.wanted.heat = 12;
    if (pkg) {
      pkg.x = marina.x + 60;
      pkg.z = marina.z - 40;
      state.mission.target = { x: pkg.x, z: pkg.z, label: 'Hidden package' };
    }
    const cop = spawnPoliceCar(state, marina.x - 200, marina.z - 260);
    cop.angle = Math.PI * 0.7;
    cop.speed = 200;
    placePed(state, marina.x + 120, marina.z + 100, 0xe8e0d0);
    placePed(state, marina.x - 120, marina.z - 80, 0x8a2be2);
    placeTraffic(state, marina.x + 300, marina.z + 24, Math.PI / 2, 5);
    return { screen: 'play' };
  }

  setClock(state, 17, 50);
  startMission(state, 4);
  state.mission.phase = 'escape';
  state.mission.target = {
    x: state.city.landmarks.safehouse.x,
    z: state.city.landmarks.safehouse.z,
    label: 'Safehouse',
  };
  const car = makeCar(state, DOWNTOWN, DOWNTOWN + 40, 0, 'player', 3);
  car.speed = 260;
  player.inCar = car;
  player.x = car.x;
  player.z = car.z;
  player.angle = car.angle;
  player.cash = 2450;
  player.health = 82;
  state.wanted.stars = 4;
  state.wanted.heat = 70;
  // Air unit, staged over the road ahead so the heli and its spotlight
  // read in frame (its circle passes over the road in real play).
  state.heli = {
    active: true, x: DOWNTOWN, z: DOWNTOWN + 480,
    angle: Math.PI, height: 230, phase: 0,
  };
  // Roadblock across the road ahead.
  const rbCars = [];
  for (const off of [-22, 22]) {
    const rb = spawnPoliceCar(state, DOWNTOWN + off, DOWNTOWN + 560);
    rb.angle = Math.PI / 2;
    rb.speed = 0;
    rb.roadblock = true;
    rbCars.push(rb);
  }
  state.roadblocks = [{ x: DOWNTOWN, z: DOWNTOWN + 560, cars: rbCars }];
  const cop1 = spawnPoliceCar(state, DOWNTOWN - 12, DOWNTOWN + 300);
  cop1.angle = Math.PI;
  cop1.speed = 300;
  const cop2 = spawnPoliceCar(state, DOWNTOWN + 26, DOWNTOWN + 460);
  cop2.angle = Math.PI;
  cop2.speed = 280;
  const cop3 = spawnPoliceCar(state, DOWNTOWN - 26, DOWNTOWN - 140);
  cop3.angle = 0;
  cop3.speed = 320;
  placeTraffic(state, DOWNTOWN - 24, DOWNTOWN - 420, 0, 1);
  placeTraffic(state, DOWNTOWN + 24, DOWNTOWN + 420, Math.PI, 2);
  placeTraffic(state, DOWNTOWN + 460, DOWNTOWN - 24, -Math.PI / 2, 5);
  placeTraffic(state, DOWNTOWN - 460, DOWNTOWN + 24, Math.PI / 2, 6);
  placePed(state, DOWNTOWN - 56, DOWNTOWN + 180, 0xe8e0d0);
  placePed(state, DOWNTOWN + 56, DOWNTOWN - 160, 0x3a6fd2);
  placePed(state, DOWNTOWN - 56, DOWNTOWN - 360, 0xd23b2e);
  return { screen: 'play' };
}
