// Save / load through localStorage: cash, mission progress, packages found,
// health. Saving happens at the garage (activities.js) and on every
// mission completion. Nothing here touches the network.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function saveGame(state) {
  try {
    const data = {
      cash: state.player.cash,
      missionIndex: state.mission.index,
      packages: state.city.packages.map((p) => p.taken),
      health: state.player.health,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function applySave(state, data) {
  state.player.cash = data.cash || 0;
  if (typeof data.health === 'number') state.player.health = data.health;
  if (Array.isArray(data.packages)) {
    data.packages.forEach((taken, i) => {
      if (state.city.packages[i]) state.city.packages[i].taken = !!taken;
    });
  }
  return data.missionIndex || 0;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off; nothing to clear then.
  }
}
