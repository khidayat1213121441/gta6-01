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
      armor: state.player.armor || 0,
      respect: state.player.respect || 0,
      weapons: state.player.weapons || { owned: ['fists', 'pistol'], current: 'pistol' },
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
  state.player.armor = typeof data.armor === 'number' ? data.armor : 0;
  state.player.respect = typeof data.respect === 'number' ? data.respect : 0;
  if (data.weapons && Array.isArray(data.weapons.owned)) state.player.weapons = data.weapons;
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
