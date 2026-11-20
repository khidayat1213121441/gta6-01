// Rico's Garage shop: the cash sink. Near the garage (within SHOP_RANGE)
// the player can spend mission/taxi/package cash on four things. Every
// purchase is checked the same way in the game and in the sim: in range,
// affordable, and actually useful (no repairing a full car, no bribing
// with no stars). Failed buys explain why instead of silently eating cash.
// Weapons (SMG, shotgun) are a second catalogue in the same shop, bought
// with keys 5–6; they stay out of SHOP_ITEMS so the consumable list and
// its one-of-each total never change.
import { distance } from './world.js';
import { WEAPONS, ensureWeapons } from './combat.js';

export const SHOP_RANGE = 150;

export const SHOP_ITEMS = [
  { id: 'repair', name: 'Full Repair', price: 150, desc: 'Car back to 100 hp' },
  { id: 'health', name: 'Health Refill', price: 100, desc: 'You back to 100 hp' },
  { id: 'armor', name: 'Armor Vest', price: 250, desc: '50 armor — soaks damage first' },
  { id: 'bribe', name: 'Bribe the Desk', price: 300, desc: 'Drop 1 wanted star' },
];

export function shopItem(id) {
  return SHOP_ITEMS.find((item) => item.id === id) || null;
}

export function nearShop(state) {
  const garage = state.city.landmarks.garage;
  return distance(state.player.x, state.player.z, garage.x, garage.z) < SHOP_RANGE;
}

/** { ok, reason } — reason is a human sentence for the toast when not ok. */
export function canBuy(state, id) {
  const item = shopItem(id);
  if (!item) return { ok: false, reason: 'No such item.' };
  if (!nearShop(state)) return { ok: false, reason: 'Get to Rico’s Garage to shop.' };
  if (state.player.cash < item.price) {
    return { ok: false, reason: `Need $${item.price} — you have $${state.player.cash}.` };
  }
  if (id === 'repair') {
    if (!state.player.inCar) return { ok: false, reason: 'Bring a car to repair it.' };
    if (state.player.inCar.health >= 100) return { ok: false, reason: 'Car is already mint.' };
  }
  if (id === 'health' && state.player.health >= 100) {
    return { ok: false, reason: 'You’re already at full health.' };
  }
  if (id === 'armor' && (state.player.armor || 0) >= 50) {
    return { ok: false, reason: 'Vest is already at full armor.' };
  }
  if (id === 'bribe' && state.wanted.stars <= 0) {
    return { ok: false, reason: 'No heat to bribe away.' };
  }
  return { ok: true, reason: '' };
}

/** Applies the purchase. Returns true on success, false (with a toast event) otherwise. */
export function buyShopItem(state, id) {
  const item = shopItem(id);
  const check = canBuy(state, id);
  if (!item || !check.ok) {
    state.events.push({ type: 'shop-denied', text: check.reason });
    return false;
  }
  const player = state.player;
  player.cash -= item.price;
  if (id === 'repair') player.inCar.health = 100;
  else if (id === 'health') player.health = 100;
  else if (id === 'armor') player.armor = 50;
  else if (id === 'bribe') {
    state.wanted.heat = Math.max(0, state.wanted.heat - 20);
    const heat = state.wanted.heat;
    state.wanted.stars = heat <= 0 ? 0 : heat < 20 ? 1 : heat < 40 ? 2 : heat < 60 ? 3 : heat < 85 ? 4 : 5;
  }
  state.events.push({ type: 'shop-bought', id, price: item.price, text: `${item.name} — $${item.price}. ${item.desc}.` });
  return true;
}

export const WEAPON_ITEMS = WEAPONS.filter((w) => w.price > 0).map((w) => ({
  id: w.id, name: w.name, price: w.price,
  desc: w.id === 'smg' ? 'Fast fire, 16 dmg/shot' : '5 pellets, 26 dmg each up close',
}));

export function canBuyWeapon(state, id) {
  const item = WEAPON_ITEMS.find((w) => w.id === id);
  if (!item) return { ok: false, reason: 'No such weapon.' };
  if (!nearShop(state)) return { ok: false, reason: 'Get to Rico’s Garage to shop.' };
  const owned = ensureWeapons(state.player).owned;
  if (owned.includes(id)) return { ok: false, reason: `You already own the ${item.name}.` };
  if (state.player.cash < item.price) {
    return { ok: false, reason: `Need $${item.price} — you have $${state.player.cash}.` };
  }
  return { ok: true, reason: '' };
}

export function buyWeapon(state, id) {
  const item = WEAPON_ITEMS.find((w) => w.id === id);
  const check = canBuyWeapon(state, id);
  if (!item || !check.ok) {
    state.events.push({ type: 'shop-denied', text: check.reason });
    return false;
  }
  state.player.cash -= item.price;
  const w = ensureWeapons(state.player);
  w.owned.push(id);
  w.current = id;
  state.events.push({ type: 'shop-bought', id, price: item.price, text: `${item.name} bought — $${item.price}. Press Q to switch weapons.` });
  return true;
}
