// SOLMAR boot and the one loop: input every frame, the world advances in
// fixed 1/60 s steps, the renderer paints the 3D scene and the HUD paints
// the panels. Screens: title, play, paused, plus busted / wasted flashes
// that respawn the player at Solmar General.
//
// ?seed=N fixes the city. ?shot=cover|drive|mission|start (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import * as THREE from 'three';
import { CLOCK, STEP } from './config.js';
import { createRandom } from './random.js';
import { createCity, roadCenter } from './world.js';
import { createPlayer, tryEnterCar, updatePlayer } from './player.js';
import { populateTraffic, updateTraffic } from './traffic.js';
import { addHeat, createWanted, updatePolice } from './police.js';
import { fireBullet, spawnParticles, tryPunch, updateBullets, updateParticles } from './combat.js';
import { createMissionState, currentMission, missionObjectiveText, startMission, updateMissions } from './missions.js';
import { updateActivities } from './activities.js';
import { createRenderer } from './render.js';
import { createCameraRig } from './camera.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_PAUSE, ACTION_PUNCH, ACTION_SHOOT, createInput } from './input.js';
import { applySave, loadSave, saveGame } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

window.addEventListener('error', (event) => {
  document.title = `ERR:${event.message}`;
  document.getElementById('status').textContent = `ERROR: ${event.message}`;
});

const canvas = document.getElementById('game');
const rng = createRandom(seed);
const city = createCity(rng);
const garage = city.landmarks.garage;

const state = {
  seed,
  rng,
  city,
  // Spawn on the road beside the garage, never inside a building.
  player: createPlayer(roadCenter(20), garage.z),
  cars: [],
  peds: [],
  bullets: [],
  particles: [],
  wanted: createWanted(),
  mission: createMissionState(),
  taxi: { active: false, hasPassenger: false, px: 0, pz: 0, dx: 0, dz: 0, fare: 0, fareTimer: 0 },
  clock: CLOCK.startSeconds,
  time: 0,
  gunfireTimer: 0,
  stats: { packages: 0, fares: 0 },
  events: [],
  screen: 'title',
  inputRunning: false,
  saveTimer: 0,
  missionTitle: '',
  missionObjective: '',
};

populateTraffic(state, rng);

const renderer = createRenderer(canvas, state);
const rig = createCameraRig(renderer.camera);
const audio = createAudio();
const input = createInput(canvas);
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();

function worldAimAngle() {
  const rect = canvas.getBoundingClientRect();
  const nx = (input.mouse.x / rect.width) * 2 - 1;
  const ny = -(input.mouse.y / rect.height) * 2 + 1;
  raycaster.setFromCamera({ x: nx, y: ny }, renderer.camera);
  const hit = raycaster.ray.intersectPlane(groundPlane, aimPoint);
  if (!hit) return null;
  return Math.atan2(aimPoint.x - state.player.x, aimPoint.z - state.player.z);
}

function refreshMissionText() {
  const def = currentMission(state);
  state.missionTitle = def ? def.title : 'FREE ROAM';
  state.missionObjective = missionObjectiveText(state);
}

function respawn(reason) {
  const player = state.player;
  const hospital = city.landmarks.hospital;
  if (player.inCar) player.inCar = null;
  player.x = hospital.x + 20;
  player.z = hospital.z + 20;
  player.angle = 0;
  player.health = 100;
  state.wanted.stars = 0;
  state.wanted.heat = 0;
  state.wanted.unseen = 0;
  state.cars = state.cars.filter((c) => c.kind !== 'police');
  state.peds = state.peds.filter((p) => p.kind !== 'cop');
  const fine = reason === 'busted' ? 200 : 150;
  player.cash = Math.max(0, player.cash - fine);
  rig.setMode(false, true);
  rig.snap(player);
  state.screen = 'play';
}

function processEvents() {
  for (const event of state.events) {
    if (event.type === 'message') {
      hud.showToast(event.text);
    } else if (event.type === 'mission-start') {
      hud.showBrief(event.title, event.brief);
      refreshMissionText();
    } else if (event.type === 'mission-complete') {
      hud.showToast(`${event.title} complete — +$${event.reward}`);
      audio.cash();
      audio.missionComplete();
      saveGame(state);
      refreshMissionText();
    } else if (event.type === 'package') {
      hud.showToast(`Hidden package found — +$${event.reward}`);
      audio.pickup();
      spawnParticles(state, event.x, event.z, 14, 0xff8c1a);
      refreshMissionText();
    } else if (event.type === 'fare-paid') {
      hud.showToast(`Fare paid — +$${event.reward}`);
      audio.cash();
    } else if (event.type === 'wanted-up') {
      hud.showToast(`Wanted level ${event.stars} — ${event.reason || 'the law is coming'}`);
    } else if (event.type === 'wanted-clear') {
      hud.showToast('You lost them. Heat’s off.');
    } else if (event.type === 'busted') {
      audio.busted();
      hud.showFlash('BUSTED', 'Solmar PD took you in. -$200. You wake up at Solmar General.');
      state.screen = 'busted';
      setTimeout(() => respawn('busted'), 2300);
    } else if (event.type === 'car-wrecked') {
      hud.showToast('Car wrecked!');
      audio.crash();
      if (event.x !== undefined) spawnParticles(state, event.x, event.z, 22, 0x888888);
    } else if (event.type === 'shot') {
      audio.shot();
      spawnParticles(state, event.x, event.z, 4, 0xffe14d);
    } else if (event.type === 'spark') {
      spawnParticles(state, event.x, event.z, 5, 0xffd23f);
    } else if (event.type === 'punch-hit') {
      audio.punch();
      spawnParticles(state, event.x, event.z, 8, 0xffffff);
    } else if (event.type === 'ped-down') {
      spawnParticles(state, event.x, event.z, 12, 0xd23b2e);
    } else if (event.type === 'save') {
      saveGame(state);
      hud.showToast('Progress saved at Rico’s Garage.');
      audio.pickup();
    } else if (event.type === 'game-won') {
      audio.missionComplete();
      hud.showFlash('SOLMAR IS YOURS', 'King of Solmar. Free roam — fares, packages, chaos.', 4000);
      refreshMissionText();
    }
  }
  state.events.length = 0;
}

const hud = createHud({
  onStart(fromSave) {
    audio.unlock();
    startGame(fromSave);
  },
  onResume() {
    state.screen = 'play';
    hud.showScreen('none');
  },
});

function startGame(fromSave) {
  const player = state.player;
  player.health = 100;
  player.cash = 0;
  player.inCar = null;
  player.x = roadCenter(20);
  player.z = garage.z;
  player.angle = 0;
  state.wanted = createWanted();
  state.mission = createMissionState();
  state.stats = { packages: 0, fares: 0 };
  state.taxi = { active: false, hasPassenger: false, px: 0, pz: 0, dx: 0, dz: 0, fare: 0, fareTimer: 0 };
  for (const pkg of city.packages) pkg.taken = false;
  let missionIndex = 0;
  if (fromSave) {
    const data = loadSave();
    if (data) missionIndex = applySave(state, data);
  }
  startMission(state, missionIndex);
  refreshMissionText();
  rig.setMode(false, true);
  rig.snap(player);
  state.screen = 'play';
  hud.showScreen('none');
  hud.showToast('Welcome to Solmar City. Steal a car — E — and get to the garage.');
}

function step(dt, actions) {
  const player = state.player;
  const move = input.move();
  state.inputRunning = input.running();
  const aim = worldAimAngle();
  const crash = updatePlayer(state, move, aim, dt);
  if (crash === 'crash') audio.crash();
  if (actions & ACTION_ENTER) {
    const entered = tryEnterCar(state);
    if (entered) {
      addHeat(state, 6, 'car stolen');
      hud.showToast(`Stole a ${entered.car.model}. The law noticed.`);
      rig.setMode(true);
      audio.pickup();
    } else if (!player.inCar) {
      hud.showToast('No car close enough. Walk up to one and press E.');
    } else {
      rig.setMode(false);
    }
  }
  if (actions & (ACTION_PUNCH | ACTION_CONFIRM) && state.screen === 'play') {
    if (tryPunch(state)) {
      // Hit landed; sound + particles come through events.
    }
  }
  if ((actions & ACTION_SHOOT) && state.screen === 'play') {
    const angle = aim !== null ? aim : player.angle;
    fireBullet(state, angle);
  }

  updateTraffic(state, dt);
  updatePolice(state, dt);
  updateBullets(state, dt);
  updateMissions(state, dt);
  updateActivities(state, dt);
  updateParticles(state, dt);

  if (state.gunfireTimer > 0) state.gunfireTimer -= dt;
  state.clock = (state.clock + dt * CLOCK.secondsPerRealSecond) % 86400;
  state.time += dt;

  // Slow health regen when the heat is off.
  if (state.wanted.stars === 0 && player.health > 0 && player.health < 100) {
    player.health = Math.min(100, player.health + 2 * dt);
  }
  // Wasted?
  if (player.health <= 0 && state.screen === 'play') {
    audio.busted();
    hud.showFlash('WASTED', 'You wake up at Solmar General. -$150.');
    state.screen = 'busted';
    setTimeout(() => respawn('wasted'), 2300);
  }
  // Wrecked player car: eject the player.
  if (player.inCar && player.inCar.health <= 0) {
    spawnParticles(state, player.inCar.x, player.inCar.z, 26, 0x555555);
    player.inCar.kind = 'parked';
    player.inCar.speed = 0;
    player.inCar = null;
    hud.showToast('Your car is wrecked. Find another ride.');
    rig.setMode(false);
  }

  // Audio follows the car and the chase.
  const speed01 = player.inCar ? Math.abs(player.inCar.speed) / 460 : 0;
  audio.engine(speed01, !!player.inCar && state.screen === 'play');
  audio.siren(state.wanted.stars > 0 && state.screen === 'play', dt);

  processEvents();
  refreshMissionText();
}

function runShot(name) {
  window.__shotMode = true;
  const staged = stageShot(name, state);
  state.screen = staged.screen;
  refreshMissionText();
  if (staged.screen === 'title') {
    hud.setContinueVisible(!!loadSave());
    hud.showScreen('title');
  } else {
    hud.showScreen('none');
    hud.update(state);
  }
  rig.setMode(!!state.player.inCar, true);
  rig.snap(state.player);
  // Keep rendering every frame (a stopped rAF loop leaves the WebGL canvas
  // uncomposited in headless screenshots); flag readiness after 2 paints.
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    renderer.update(0.016, state.time);
    renderer.render();
    hud.update(state);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const saved = loadSave();
  hud.setContinueVisible(!!saved);
  hud.showScreen('title');
  refreshMissionText();
  let last = performance.now();
  let accumulator = 0;
  let titleAngle = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dtReal = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    let actions = input.takeActions();
    if (actions & ACTION_CONFIRM && state.screen === 'title') {
      audio.unlock();
      startGame(false);
      actions = 0;
    } else if (actions & ACTION_PAUSE) {
      if (state.screen === 'play') {
        state.screen = 'paused';
        hud.showScreen('paused');
      } else if (state.screen === 'paused') {
        state.screen = 'play';
        hud.showScreen('none');
      }
    }

    if (state.screen === 'title') {
      // Slow cinematic orbit over downtown behind the title screen.
      titleAngle += dtReal * 0.045;
      const tower = city.landmarks.tower;
      const cam = renderer.camera;
      cam.position.set(
        tower.x + Math.sin(titleAngle) * 620,
        430,
        tower.z + Math.cos(titleAngle) * 620,
      );
      cam.lookAt(tower.x, 0, tower.z);
      state.clock = (state.clock + dtReal * 2) % 86400;
      renderer.update(dtReal, state.time);
      renderer.render();
      return;
    }
    if (state.screen !== 'play') {
      renderer.update(dtReal, state.time);
      renderer.render();
      return;
    }

    accumulator += dtReal;
    let actionsLeft = actions;
    while (accumulator >= STEP && state.screen === 'play') {
      step(STEP, actionsLeft);
      actionsLeft = 0;
      accumulator -= STEP;
    }
    rig.update(state.player, dtReal);
    renderer.update(dtReal, state.time);
    renderer.render();
    hud.update(state);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === 'play') {
      state.screen = 'paused';
      hud.showScreen('paused');
    }
  });

  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
