// Missions and story: eight chained jobs for Rico, the garage owner who
// fronts Solmar's crews. Each mission is a small state machine — a target
// on the map, a condition that completes it, a cash reward and the next job.
// The HUD reads the current mission's title, brief and target, and shows
// the job-giver's portrait (face: name, role, colours for the canvas).
import { MISSION_REWARDS, RESPECT_RANKS } from './config.js';
import { distance } from './world.js';
import { addHeat } from './police.js';

/** Rank name for a respect total, plus the next rank and progress to it. */
export function rankForRespect(points) {
  let rank = RESPECT_RANKS[0];
  let next = null;
  for (const r of RESPECT_RANKS) {
    if (points >= r.at) rank = r;
    else if (!next) next = r;
  }
  return { rank: rank.name, next: next ? next.name : null, nextAt: next ? next.at : null };
}

/** Award respect; returns { points, rank, rankUp }. */
export function addRespect(state, pts) {
  const player = state.player;
  player.respect = (player.respect || 0) + pts;
  const before = rankForRespect(player.respect - pts).rank;
  const now = rankForRespect(player.respect);
  return { points: player.respect, rank: now.rank, rankUp: now.rank !== before };
}

const L = (state, key) => state.city.landmarks[key];

function setTarget(state, x, z, label) {
  state.mission.target = { x, z, label };
}

const DEFS = [
  {
    title: '1 · FIRST WHEELS',
    brief: 'Rico needs a driver. Steal any car, then bring it to the garage.',
    face: { name: 'RICO', role: 'FIXER', skin: '#c98d5f', hair: '#1a1a1a', hat: true, jacket: '#3a5a3a' },
    objective(state) {
      return state.mission.phase === 'getcar' ? 'Steal a car  (E near a car)' : 'Drive to Rico’s Garage';
    },
    start(state) {
      state.mission.phase = 'getcar';
      setTarget(state, L(state, 'garage').x, L(state, 'garage').z, 'Rico’s Garage');
    },
    update(state) {
      if (state.mission.phase === 'getcar' && state.player.inCar) {
        state.mission.phase = 'drive';
        state.events.push({ type: 'message', text: 'Nice wheels. Now get to the garage.' });
      } else if (state.mission.phase === 'drive' && state.player.inCar
        && distance(state.player.x, state.player.z, L(state, 'garage').x, L(state, 'garage').z) < 90) {
        return 'done';
      }
      return null;
    },
  },
  {
    title: '2 · CAB CALL',
    brief: 'A high-roller waits at the Palms Hotel. Pick them up, drop them at the Marina Pier. No scratches.',
    face: { name: 'VIV', role: 'HIGH-ROLLER', skin: '#e8b98a', hair: '#d8a03a', hat: false, jacket: '#7a2a5a' },
    objective(state) {
      return state.mission.phase === 'pickup' ? 'Pick up the passenger at the Palms Hotel' : 'Drop them at the Marina Pier';
    },
    start(state) {
      state.mission.phase = 'pickup';
      state.taxi = { active: true, hasPassenger: false, px: L(state, 'hotel').x, pz: L(state, 'hotel').z, dx: L(state, 'marina').x, dz: L(state, 'marina').z };
      setTarget(state, L(state, 'hotel').x, L(state, 'hotel').z, 'Palms Hotel');
    },
    update(state) {
      const taxi = state.taxi;
      if (state.mission.phase === 'pickup'
        && state.player.inCar && distance(state.player.x, state.player.z, taxi.px, taxi.pz) < 80) {
        state.mission.phase = 'dropoff';
        taxi.hasPassenger = true;
        setTarget(state, taxi.dx, taxi.dz, 'Marina Pier');
        state.events.push({ type: 'message', text: 'Passenger aboard. To the Marina Pier — and easy on the gas.' });
      } else if (state.mission.phase === 'dropoff'
        && distance(state.player.x, state.player.z, taxi.dx, taxi.dz) < 90) {
        return 'done';
      }
      return null;
    },
  },
  {
    title: '3 · BEACHCOMBER',
    brief: 'Rico stashed three packages around the marina. Collect them all — on foot or by car.',
    face: { name: 'RICO', role: 'FIXER', skin: '#c98d5f', hair: '#1a1a1a', hat: true, jacket: '#3a5a3a' },
    packages: true,
    objective(state) {
      return `Collect the stashed packages  (${state.mission.count}/3)`;
    },
    start(state) {
      state.mission.phase = 'collect';
      state.mission.count = 0;
      state.mission.packageIds = state.city.packages.slice(0, 6).map((_, i) => i);
      retargetPackage(state);
    },
    update(state) {
      if (state.mission.count >= 3) return 'done';
      return null;
    },
  },
  {
    title: '4 · HEAT WAVE',
    brief: 'The cops are on you — 2 stars and climbing. Lose them. Stay out of sight until the heat dies. A fast car helps.',
    face: { name: 'RICO', role: 'FIXER', skin: '#c98d5f', hair: '#1a1a1a', hat: true, jacket: '#3a5a3a' },
    objective() {
      return 'Lose the wanted level  (stay out of sight)';
    },
    start(state) {
      state.mission.phase = 'evade';
      addHeat(state, 30, 'mission heat');
      state.events.push({ type: 'message', text: 'Two stars. Break line of sight and lay low.' });
    },
    update(state) {
      if (state.wanted.stars === 0) return 'done';
      return null;
    },
  },
  {
    title: '5 · HARBOR HEIST',
    brief: 'Grab the cash from the Marina Warehouse, then lose the cops and reach the Safehouse in the barrio.',
    face: { name: 'MARA', role: 'WHEELWOMAN', skin: '#8a5a3a', hair: '#0a0a0a', hat: false, jacket: '#2a4a7a' },
    objective(state) {
      return state.mission.phase === 'grab' ? 'Grab the cash at the Marina Warehouse' : 'Escape to the Safehouse';
    },
    start(state) {
      state.mission.phase = 'grab';
      if (state.player.inCar) state.player.inCar.health = Math.min(125, state.player.inCar.health + 25);
      setTarget(state, L(state, 'warehouse').x, L(state, 'warehouse').z, 'Marina Warehouse');
    },
    update(state) {
      if (state.mission.phase === 'grab'
        && distance(state.player.x, state.player.z, L(state, 'warehouse').x, L(state, 'warehouse').z) < 80) {
        state.mission.phase = 'escape';
        addHeat(state, 45, 'harbor heist');
        setTarget(state, L(state, 'safehouse').x, L(state, 'safehouse').z, 'Safehouse');
        state.events.push({ type: 'message', text: 'Cash grabbed — 3 stars! Get to the Safehouse.' });
      } else if (state.mission.phase === 'escape'
        && distance(state.player.x, state.player.z, L(state, 'safehouse').x, L(state, 'safehouse').z) < 90) {
        return 'done';
      }
      return null;
    },
  },
  {
    title: '6 · KING OF SOLMAR',
    brief: 'One last job: hold Solmar Tower for 25 seconds with the whole city chasing you. Then the city is yours.',
    face: { name: 'RICO', role: 'FIXER', skin: '#c98d5f', hair: '#1a1a1a', hat: true, jacket: '#3a5a3a' },
    objective(state) {
      return `Hold Solmar Tower  (${Math.ceil(state.mission.timer)}s)`;
    },
    start(state) {
      state.mission.phase = 'hold';
      state.mission.timer = 25;
      if (state.player.inCar) state.player.inCar.health = Math.min(125, state.player.inCar.health + 25);
      addHeat(state, 50, 'king of solmar');
      setTarget(state, L(state, 'tower').x, L(state, 'tower').z, 'Solmar Tower');
    },
    update(state, dt) {
      if (distance(state.player.x, state.player.z, L(state, 'tower').x, L(state, 'tower').z) < 180) {
        state.mission.timer -= dt;
        if (state.mission.timer <= 0) return 'done';
      }
      return null;
    },
  },
  {
    title: '7 · LAST DELIVERY',
    brief: 'Three more drops stashed around the city, and the law is watching — 2 stars from the start. Collect all three.',
    face: { name: 'MARA', role: 'WHEELWOMAN', skin: '#8a5a3a', hair: '#0a0a0a', hat: false, jacket: '#2a4a7a' },
    packages: true,
    objective(state) {
      return `Collect the stashed drops  (${state.mission.count}/3)`;
    },
    start(state) {
      state.mission.phase = 'collect';
      state.mission.count = 0;
      addHeat(state, 25, 'last delivery');
      retargetPackage(state);
    },
    update(state) {
      if (state.mission.count >= 3) return 'done';
      return null;
    },
  },
  {
    title: '8 · SOLMAR FOREVER',
    brief: 'The whole city is coming — 4 stars, the heli overhead, roadblocks on every avenue. Hold the Tower for 30 seconds.',
    face: { name: 'RICO', role: 'FIXER', skin: '#c98d5f', hair: '#1a1a1a', hat: true, jacket: '#3a5a3a' },
    objective(state) {
      return `Hold Solmar Tower  (${Math.ceil(state.mission.timer)}s)`;
    },
    start(state) {
      state.mission.phase = 'hold';
      state.mission.timer = 30;
      if (state.player.inCar) state.player.inCar.health = Math.min(125, state.player.inCar.health + 25);
      addHeat(state, 60, 'solmar forever');
      setTarget(state, L(state, 'tower').x, L(state, 'tower').z, 'Solmar Tower');
    },
    update(state, dt) {
      if (distance(state.player.x, state.player.z, L(state, 'tower').x, L(state, 'tower').z) < 180) {
        state.mission.timer -= dt;
        if (state.mission.timer <= 0) return 'done';
      }
      return null;
    },
  },
];

function retargetPackage(state) {
  const remaining = state.city.packages.filter((p) => !p.taken);
  if (remaining.length === 0) return;
  let best = remaining[0];
  let bestD = Infinity;
  for (const p of remaining) {
    const d = distance(state.player.x, state.player.z, p.x, p.z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  setTarget(state, best.x, best.z, 'Hidden package');
}

export function createMissionState() {
  return { index: 0, phase: '', count: 0, timer: 0, target: null, done: false };
}

export function currentMission(state) {
  return DEFS[state.mission.index] || null;
}

export function startMission(state, index) {
  state.mission.index = index;
  state.mission.count = 0;
  state.mission.timer = 0;
  state.mission.done = false;
  const def = DEFS[index];
  if (def) {
    def.start(state);
    state.events.push({ type: 'mission-start', title: def.title, brief: def.brief, face: def.face });
  }
}

export function updateMissions(state, dt) {
  const def = currentMission(state);
  if (!def || state.mission.done) return;
  if (def.packages) retargetPackage(state);
  const result = def.update(state, dt);
  if (result === 'done') {
    const reward = MISSION_REWARDS[state.mission.index] || 0;
    state.player.cash += reward;
    state.mission.done = true;
    state.events.push({ type: 'mission-complete', title: def.title, reward });
    const rep = addRespect(state, 50 + state.mission.index * 5);
    if (rep.rankUp) state.events.push({ type: 'message', text: `Respect up — you are now ${rep.rank}.` });
    if (state.mission.index === 1) state.taxi.active = false;
    if (state.mission.index + 1 < DEFS.length) {
      startMission(state, state.mission.index + 1);
    } else {
      state.events.push({ type: 'game-won' });
    }
  }
}

export function missionObjectiveText(state) {
  const def = currentMission(state);
  if (!def) return 'Solmar is yours. Free roam — fares, packages, chaos.';
  return def.objective(state);
}
