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
    // Dusk over downtown; the title screen sits on top of the live city.
    setClock(state, 18, 5);
    player.x = DOWNTOWN;
    player.z = DOWNTOWN;
    player.angle = Math.PI * 0.6;
    placeTraffic(state, DOWNTOWN - 120, DOWNTOWN + 300, 0, 1);
    placeTraffic(state, DOWNTOWN + 140, DOWNTOWN - 260, Math.PI, 2);
    placeTraffic(state, DOWNTOWN + 320, DOWNTOWN + 80, Math.PI / 2, 5);
    placePed(state, DOWNTOWN - 60, DOWNTOWN + 120, 0xe8e0d0);
    placePed(state, DOWNTOWN + 90, DOWNTOWN - 60, 0x3a6fd2);
    return { screen: 'title' };
  }

  if (name === 'drive') {
    // Downtown drive in morning light: traffic, pedestrians, mission 1.
    setClock(state, 10, 30);
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
    // On foot at the marina: mission 3, one package in reach, 1 star.
    setClock(state, 15, 0);
    startMission(state, 2);
    state.mission.count = 1;
    const marina = state.city.landmarks.marina;
    const pkg = state.city.packages.find((p) => !p.taken);
    player.x = marina.x - 40;
    player.z = marina.z + 60;
    player.angle = Math.PI * 0.25;
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

  // Default: 'cover' — the police chase. Wanted 3, two cop cars closing in,
  // mission 5 mid-escape, HUD full: stars, minimap, objective, cash, speed.
  setClock(state, 16, 30);
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
  state.wanted.stars = 3;
  state.wanted.heat = 52;
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
