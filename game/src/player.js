// The player: on-foot movement, entering/exiting/stealing cars, health.
// The player object holds both modes; when inCar is set the player's
// position follows the car and driving input goes to the car instead.
import { CAR, PLAYER } from './config.js';
import { collideCircle } from './world.js';
import { driveCar, nearestCar } from './vehicles.js';

export function createPlayer(x, z) {
  return {
    x, z,
    angle: 0, // facing, radians; 0 = +z (south)
    speed: 0,
    health: PLAYER.healthMax,
    armor: 0, // vest: absorbs damage before health (garage shop)
    cash: 0,
    respect: 0, // street standing: missions and races raise it
    inCar: null,
    punchCooldown: 0,
    shootCooldown: 0,
    invulnerable: 0,
    moving: false,
  };
}

/**
 * One step. `move` is {x, y} from input (x strafe, y forward), `aim` is the
 * world angle the player faces when shooting. Returns 'crash' when the car
 * hit a building hard, else null.
 */
export function updatePlayer(state, move, aimAngle, dt) {
  const player = state.player;
  if (player.punchCooldown > 0) player.punchCooldown -= dt;
  if (player.shootCooldown > 0) player.shootCooldown -= dt;
  if (player.invulnerable > 0) player.invulnerable -= dt;

  if (player.inCar) {
    const car = player.inCar;
    const throttle = -move.y; // W is up = forward
    const steer = move.x;
    const hit = driveCar(state, car, throttle, steer, dt);
    player.x = car.x;
    player.z = car.z;
    player.angle = car.angle;
    player.speed = car.speed;
    player.moving = Math.abs(car.speed) > 5;
    if (hit && Math.abs(car.speed) > 60) return 'crash';
    return null;
  }

  const speed = state.inputRunning ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const fx = Math.sin(player.angle);
  const fz = Math.cos(player.angle);
  const rx = -Math.cos(player.angle);
  const rz = Math.sin(player.angle);
  const fwd = -move.y;
  const strafe = move.x;
  let vx = (fx * fwd + rx * strafe) * speed;
  let vz = (fz * fwd + rz * strafe) * speed;
  const len = Math.hypot(vx, vz);
  if (len > speed) {
    vx = (vx / len) * speed;
    vz = (vz / len) * speed;
  }
  player.moving = len > 1;
  if (player.moving) player.angle = Math.atan2(vx, vz);
  else if (aimAngle !== null) player.angle = aimAngle;

  const nx = player.x + vx * dt;
  const nz = player.z + vz * dt;
  const resolved = collideCircle(state.city, nx, nz, PLAYER.radius);
  player.x = resolved.x;
  player.z = resolved.z;
  player.speed = len;
  return null;
}

/** Try to enter the nearest car (steal it if parked/traffic). Returns the car or null. */
export function tryEnterCar(state) {
  const player = state.player;
  if (player.inCar) {
    const car = player.inCar;
    player.inCar = null;
    car.kind = car.kind === 'player' ? 'parked' : car.kind;
    car.speed = 0;
    // Step out to the side of the car.
    const side = { x: player.x + Math.cos(player.angle) * 26, z: player.z - Math.sin(player.angle) * 26 };
    const resolved = collideCircle(state.city, side.x, side.z, PLAYER.radius);
    player.x = resolved.x;
    player.z = resolved.z;
    return null;
  }
  const car = nearestCar(state, player.x, player.z, 70, ['parked', 'traffic']);
  if (!car) return null;
  const wasParked = car.kind === 'parked';
  car.kind = 'player';
  car.driver = 'player';
  player.inCar = car;
  player.x = car.x;
  player.z = car.z;
  player.angle = car.angle;
  return { car, stolen: true, wasParked };
}

export function damagePlayer(state, amount) {
  const player = state.player;
  if (player.invulnerable > 0) return false;
  // Armor soaks damage first.
  const armor = player.armor || 0;
  if (armor > 0) {
    const soaked = Math.min(armor, amount);
    player.armor = armor - soaked;
    amount -= soaked;
  }
  player.health -= amount;
  player.invulnerable = 0.4;
  if (player.health <= 0) {
    player.health = 0;
    return true; // wasted
  }
  return false;
}

export function healPlayer(state, amount) {
  const player = state.player;
  player.health = Math.min(PLAYER.healthMax, player.health + amount);
}
