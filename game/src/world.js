// The city itself: a seeded 40x40-block grid with districts, buildings,
// trees, hidden packages and named landmarks. Pure data + geometry helpers —
// no drawing, no Three.js here. Everything is placed on the x/z ground
// plane; render.js draws it, the AI drives on it.
import { CITY } from './config.js';
import { randomInt, randomPick } from './random.js';

const { blocks, block, road, pitch, size } = CITY;

export function districtAt(bx, bz) {
  if (bx >= 38) return 'sea';
  if (bx >= 35) return 'beach';
  if (bx >= 15 && bx <= 25 && bz >= 15 && bz <= 25) return 'downtown';
  if (bx <= 9 && bz <= 9) return 'industrial';
  if (bx >= 28 && bx <= 34 && bz >= 2 && bz <= 9) return 'park';
  if (bx <= 11 && bz >= 26) return 'barrio';
  return 'residential';
}

export function districtAtPoint(x, z) {
  return districtAt(Math.floor(x / pitch), Math.floor(z / pitch));
}

/** Centre of the road with index i (roads run between the blocks). */
export function roadCenter(i) {
  return i * pitch + road / 2;
}

function blockOrigin(b) {
  return b * pitch + road;
}

const ROOF_COLORS = {
  downtown: [0x5a7ab8, 0x3d6a9a, 0x7a9ab8, 0x8a6a4a, 0x4a8a9a],
  barrio: [0xd06a3a, 0xe08a4a, 0xc05a6a, 0xe8b04a],
  industrial: [0x8a7a5a, 0x6f7a68, 0x9a8a6a],
  residential: [0x7a9a5a, 0x4a8a7a, 0xc07a3a, 0x8a6a9a],
};

export function createCity(rng) {
  const buildings = [];
  const trees = [];
  const packages = [];

  for (let bx = 0; bx < blocks; bx += 1) {
    for (let bz = 0; bz < blocks; bz += 1) {
      const district = districtAt(bx, bz);
      const ox = blockOrigin(bx);
      const oz = blockOrigin(bz);
      if (district === 'sea' || district === 'beach') {
        if (district === 'beach') {
          for (let t = 0; t < 3; t += 1) {
            trees.push({ x: ox + 12 + rng() * (block - 24), z: oz + 12 + rng() * (block - 24), s: 1.2 + rng() * 0.5, palm: true });
          }
        }
        continue;
      }
      if (district === 'park') {
        for (let t = 0; t < 9; t += 1) {
          trees.push({ x: ox + 8 + rng() * (block - 16), z: oz + 8 + rng() * (block - 16), s: 0.9 + rng() * 0.9, palm: false });
        }
        continue;
      }
      if (district === 'downtown') {
        const colors = ROOF_COLORS.downtown;
        buildings.push({
          x: ox + block / 2, z: oz + block / 2,
          w: 62 + rng() * 18, d: 62 + rng() * 18,
          h: 55 + rng() * 95, color: randomPick(rng, colors), district,
        });
        continue;
      }
      const colors = ROOF_COLORS[district] || ROOF_COLORS.residential;
      const count = district === 'industrial' ? 1 : 2 + Math.floor(rng() * 3);
      for (let b = 0; b < count; b += 1) {
        const w = 22 + rng() * 26;
        const d = 22 + rng() * 26;
        const x = ox + w / 2 + 6 + rng() * Math.max(1, block - w - 12);
        const z = oz + d / 2 + 6 + rng() * Math.max(1, block - d - 12);
        buildings.push({
          x, z, w, d,
          h: district === 'industrial' ? 12 + rng() * 10 : 8 + rng() * 16,
          color: randomPick(rng, colors), district,
        });
      }
      if (district === 'residential' || district === 'barrio') {
        for (let t = 0; t < 2; t += 1) {
          trees.push({ x: ox + 10 + rng() * (block - 20), z: oz + 10 + rng() * (block - 20), s: 0.8 + rng() * 0.6, palm: district === 'barrio' && rng() < 0.5 });
        }
      }
    }
  }

  function landmark(bx, bz, label) {
    return { x: blockOrigin(bx) + block / 2, z: blockOrigin(bz) + block / 2, label };
  }
  const landmarks = {
    garage: landmark(20, 27, 'Rico’s Garage'),
    hospital: landmark(10, 18, 'Solmar General'),
    hotel: landmark(24, 14, 'Palms Hotel'),
    warehouse: landmark(34, 20, 'Marina Warehouse'),
    tower: landmark(20, 20, 'Solmar Tower'),
    safehouse: landmark(6, 32, 'Safehouse'),
    marina: landmark(34, 24, 'Marina Pier'),
  };

  const used = new Set();
  while (packages.length < 10) {
    const bx = randomInt(rng, 1, 38);
    const bz = randomInt(rng, 1, 38);
    const key = `${bx},${bz}`;
    if (used.has(key) || districtAt(bx, bz) === 'sea') continue;
    used.add(key);
    const vertical = rng() < 0.5;
    const along = roadCenter(bx) + (rng() - 0.5) * (pitch - 40);
    const across = vertical
      ? roadCenter(bz) + (rng() < 0.5 ? -1 : 1) * (road / 2 + 8)
      : roadCenter(bx) + (rng() < 0.5 ? -1 : 1) * (road / 2 + 8);
    packages.push({
      x: vertical ? along : across,
      z: vertical ? across : along,
      taken: false,
    });
  }

  return { buildings, trees, packages, landmarks, size };
}

/** Is this ground point in the sea (impassable)? */
export function isWater(x, z) {
  return x >= 38 * pitch - 4 || x < 0 || z < 0 || z >= size;
}

/** Push a circle out of buildings, water and the city edge. Returns {x, z, hit}. */
export function collideCircle(city, x, z, r) {
  let hit = false;
  x = Math.max(r, Math.min(size - r, x));
  z = Math.max(r, Math.min(size - r, z));
  if (x > 38 * pitch - 4 - r) {
    x = 38 * pitch - 4 - r;
    hit = true;
  }
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    const hw = b.w / 2 + r;
    const hd = b.d / 2 + r;
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      hit = true;
      const px = hw - Math.abs(dx);
      const pz = hd - Math.abs(dz);
      if (px < pz) x = b.x + (dx > 0 ? hw : -hw);
      else z = b.z + (dz > 0 ? hd : -hd);
    }
  }
  return { x, z, hit };
}

/** Snap a point to the nearest road centreline (keeps cars on roads). */
export function nearestRoadPoint(x, z) {
  const ix = Math.round((x - road / 2) / pitch);
  const iz = Math.round((z - road / 2) / pitch);
  const cx = roadCenter(Math.max(0, Math.min(blocks - 1, ix)));
  const cz = roadCenter(Math.max(0, Math.min(blocks - 1, iz)));
  if (Math.abs(x - cx) < Math.abs(z - cz)) return { x: cx, z };
  return { x, z: cz };
}

/** A random point on a random road. */
export function randomRoadPoint(rng) {
  const vertical = rng() < 0.5;
  const roadIndex = randomInt(rng, 0, blocks - 1);
  const along = rng() * size;
  return vertical
    ? { x: roadCenter(roadIndex), z: along }
    : { x: along, z: roadCenter(roadIndex) };
}

export function distance(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}
