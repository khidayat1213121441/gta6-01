// The chase camera: a low GTA-style camera trailing behind the player,
// so the road ahead, the city and the SKY stay in frame. On foot it rides
// closer and lower; in a car it sits just behind the roofline and looks
// slightly up, so the horizon and the towers read instead of rooftops.
import * as THREE from 'three';

export function createCameraRig(camera) {
  const rig = {
    // toward them so motion never snaps.
    distance: 150,
    height: 68,
    lookAhead: 140,
    lookHeight: 18,
    pos: new THREE.Vector3(0, 68, 150),
    look: new THREE.Vector3(0, 18, 0),
    shakeT: 0,
  };

  /** Kick the camera. Amount is the shake amplitude in world units. */
  function shake(amount) {
    rig.shakeT = Math.min(1, Math.max(rig.shakeT, amount / 10));
  }

  function setMode(inCar, instant) {
    const target = inCar
      ? { distance: 150, height: 68, lookAhead: 140, lookHeight: 18 }
      : { distance: 110, height: 55, lookAhead: 60, lookHeight: 14 };
    if (instant) {
      rig.distance = target.distance;
      rig.height = target.height;
      rig.lookAhead = target.lookAhead;
      rig.lookHeight = target.lookHeight;
      return;
    }
    const gsap = window.gsap;
    if (gsap) {
      gsap.to(rig, { distance: target.distance * 0.82, height: target.height * 0.9, duration: 0.18, ease: 'power2.in' });
      gsap.to(rig, {
        distance: target.distance, height: target.height, lookAhead: target.lookAhead, lookHeight: target.lookHeight,
        duration: 0.7, delay: 0.18, ease: 'expo.out', overwrite: 'auto',
      });
    } else {
      rig.distance = target.distance;
      rig.height = target.height;
      rig.lookAhead = target.lookAhead;
      rig.lookHeight = target.lookHeight;
    }
  }

  function update(player, dt) {
    const backX = -Math.sin(player.angle);
    const backZ = -Math.cos(player.angle);
    const tx = player.x + backX * rig.distance + Math.sin(player.angle) * rig.lookAhead * 0.15;
    const tz = player.z + backZ * rig.distance + Math.cos(player.angle) * rig.lookAhead * 0.15;
    const k = 1 - Math.pow(0.0015, dt); // frame-rate independent smoothing
    rig.pos.x += (tx - rig.pos.x) * k;
    rig.pos.y += (rig.height - rig.pos.y) * k;
    rig.pos.z += (tz - rig.pos.z) * k;
    const lx = player.x + Math.sin(player.angle) * rig.lookAhead;
    const lz = player.z + Math.cos(player.angle) * rig.lookAhead;
    rig.look.x += (lx - rig.look.x) * k;
    rig.look.y += (rig.lookHeight - rig.look.y) * k;
    rig.look.z += (lz - rig.look.z) * k;
    camera.position.copy(rig.pos);
    if (rig.shakeT > 0.01) {
      camera.position.x += (Math.random() - 0.5) * rig.shakeT * 14;
      camera.position.y += (Math.random() - 0.5) * rig.shakeT * 10;
      rig.shakeT *= Math.pow(0.02, dt); // fast decay
    } else {
      rig.shakeT = 0;
    }
    camera.lookAt(rig.look);
  }

  function snap(player) {
    const backX = -Math.sin(player.angle);
    const backZ = -Math.cos(player.angle);
    rig.pos.set(
      player.x + backX * rig.distance,
      rig.height,
      player.z + backZ * rig.distance,
    );
    rig.look.set(player.x, rig.lookHeight, player.z);
    camera.position.copy(rig.pos);
    camera.lookAt(rig.look);
  }

  // Shots only: keep the snapped position (150 behind) but point the
  // camera where live play looks — up the road — so the frame shows the
  // road, city and sky instead of the ground at the player's feet.
  function settleLook(player) {
    rig.look.set(
      player.x + Math.sin(player.angle) * rig.lookAhead,
      rig.lookHeight,
      player.z + Math.cos(player.angle) * rig.lookAhead,
    );
    camera.lookAt(rig.look);
  }

  return { rig, setMode, update, snap, settleLook, shake };
}
