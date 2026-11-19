// SOLMAR — every tuning number and colour in one place.
// Logic lives on the x/z ground plane: a 40x40-block city, block 96, road 48,
// pitch 144, so the whole city is 5760x5760 world units. render.js draws that
// plane in 3D with Three.js; a high-angle chase camera (camera.js) follows
// the player so the minimap and objective markers stay readable.

export const STEP = 1 / 60;

export const CITY = {
  blocks: 40,
  block: 96,
  road: 48,
  pitch: 144,
  size: 40 * 144, // 5760
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  runSpeed: 260,
  healthMax: 100,
  punchDamage: 25,
  punchRange: 40,
  punchArc: 1.1,
  punchCooldown: 0.35,
  shootCooldown: 0.28,
  bulletSpeed: 700,
  bulletDamage: 34,
  bulletRange: 560,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 360,
  brake: 560,
  reverseAccel: 220,
  maxSpeed: 460,
  maxReverse: 160,
  turnRate: 2.7,
  grip: 0.9,
  healthMax: 100,
};

export const TRAFFIC = { count: 24, speed: 130, speedJitter: 45 };
export const PEDS = { count: 32, walkSpeed: 55 };

export const WANTED = {
  maxStars: 5,
  decayUnseenSeconds: 6,
  copCarSpeed: 420,
  copFootSpeed: 190,
  arrestSeconds: 2.0,
  maxCopCars: 5,
};

export const CLOCK = {
  startSeconds: 8 * 3600, // 08:00
  secondsPerRealSecond: 24, // a full day in one hour of play
};

export const MISSION_REWARDS = [300, 450, 600, 800, 1200, 2000];
export const PACKAGE_REWARD = 250;
export const TAXI_FARE_MIN = 120;
export const TAXI_FARE_MAX = 320;

export const SAVE_KEY = 'solmar.save.v1';

export const PALETTE = {
  grass: '#5d9b4a',
  park: '#3f7a37',
  sand: '#e0c98f',
  sea: '#2b7fb8',
  seaDeep: '#1d5f8f',
  asphalt: '#3a3d44',
  asphaltLine: '#d8c95a',
  sidewalk: '#9a938a',
  industrial: '#6f6f68',
  downtown: '#7d7f88',
  barrio: '#a9805a',
  residential: '#6a9a58',
  text: '#f4f1e8',
  muted: '#c9c4b4',
  panel: 'rgba(12, 16, 24, 0.72)',
  star: '#ffd23f',
  health: '#58d158',
  healthLow: '#e5534b',
  cash: '#7ee081',
  marker: '#ffd23f',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_DISPLAY = '"Trebuchet MS", system-ui, sans-serif';

// Motion identity (motion-design skill): Energetic for game feedback,
// Premium for menus. One signature easing for 80% of motion.
export const MOTION = {
  signatureEase: 'expo.out',
  popEase: 'back.out(1.7)',
  menuEase: 'power3.out',
  quick: 0.15,
  standard: 0.3,
  slow: 0.55,
  dramatic: 0.9,
  stagger: 0.08,
};
