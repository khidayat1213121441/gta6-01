// Side activities: taxi fares in free roam, hidden packages, and saving
// at the garage. Fares appear once the cab mission is done (or from the
// start in free roam); a fare pays on delivery. Packages pay on pickup and
// count toward mission 3 while it runs.
import { PACKAGE_REWARD, TAXI_FARE_MAX, TAXI_FARE_MIN } from './config.js';
import { distance, randomRoadPoint } from './world.js';

function newFare(state) {
  const rng = state.rng;
  const pickup = randomRoadPoint(rng);
  const dest = randomRoadPoint(rng);
  state.taxi = {
    active: true,
    hasPassenger: false,
    px: pickup.x, pz: pickup.z,
    dx: dest.x, dz: dest.z,
    fare: TAXI_FARE_MIN + Math.floor(rng() * (TAXI_FARE_MAX - TAXI_FARE_MIN)),
    fareTimer: 0,
  };
  state.events.push({ type: 'message', text: 'Taxi fare nearby — pick up the passenger.' });
}

export function updateActivities(state, dt) {
  const player = state.player;

  // --- hidden packages ---
  for (const pkg of state.city.packages) {
    if (pkg.taken) continue;
    if (distance(player.x, player.z, pkg.x, pkg.z) < 42) {
      pkg.taken = true;
      player.cash += PACKAGE_REWARD;
      state.stats.packages += 1;
      if (state.mission.index === 2 && !state.mission.done) state.mission.count += 1;
      state.events.push({ type: 'package', reward: PACKAGE_REWARD, x: pkg.x, z: pkg.z });
    }
  }

  // --- taxi fares (free roam only; mission 2 runs its own fare) ---
  if (state.mission.index !== 1) {
    if (!state.taxi || !state.taxi.active) {
      state.taxi = state.taxi || { active: false, hasPassenger: false, px: 0, pz: 0, dx: 0, dz: 0, fare: 0, fareTimer: 0 };
      state.taxi.fareTimer += dt;
      if (state.taxi.fareTimer > 14 && state.rng() < 0.02) newFare(state);
    } else if (!state.taxi.hasPassenger) {
      if (player.inCar && distance(player.x, player.z, state.taxi.px, state.taxi.pz) < 80) {
        state.taxi.hasPassenger = true;
        state.events.push({ type: 'message', text: 'Passenger aboard. Follow the marker.' });
      }
    } else if (distance(player.x, player.z, state.taxi.dx, state.taxi.dz) < 90) {
      // Only a real fare pays: a fare object without a numeric fare (e.g. a
      // retired mission taxi) must never touch cash.
      if (Number.isFinite(state.taxi.fare) && state.taxi.fare > 0) {
        player.cash += state.taxi.fare;
        state.stats.fares += 1;
        state.events.push({ type: 'fare-paid', reward: state.taxi.fare });
      }
      state.taxi.active = false;
      state.taxi.fareTimer = 0;
    }
  }

  // --- garage save: drive into the garage marker to save progress ---
  const garage = state.city.landmarks.garage;
  if (distance(player.x, player.z, garage.x, garage.z) < 80) {
    state.saveTimer = (state.saveTimer || 0) + dt;
    if (state.saveTimer > 1.2) {
      state.saveTimer = 0;
      state.events.push({ type: 'save' });
    }
  } else {
    state.saveTimer = 0;
  }
}
