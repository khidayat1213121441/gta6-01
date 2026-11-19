// The chase camera: a high-angle camera that trails behind the player,
// smoothed with GSAP-driven rig values (motion-design skill: anticipation
// on entering a car — a brief push-in before the pull-back — follow-through
// on stops, ease-out-expo for every move, never linear). On foot the camera
// rides closer and steeper; in a car it pulls back and flattens so the road
// ahead stays visible.
import * as THREE from 'three';

export function createCameraRig(camera) {
  const rig = {
    // Smoothed values GSAP tweens; the per-frame update lerps the camera
    // toward them so motion never snaps.
    distance: 190,
    height: 235,
    lookAhead: 90,
    // Current camera position, lerped every frame.
    pos: new THREE.Vector3(0, 120, 150),
    look: new THREE.Vector3(0, 0, 0),
  };

  function setMode(inCar, instant) {
    const target = inCar
      ? { distance: 190, height: 235, lookAhead: 90 }
      : { distance: 130, height: 195, lookAhead: 30 };
    if (instant) {
      rig.distance = target.distance;
      rig.height = target.height;
      rig.lookAhead = target.lookAhead;
      return;
    }
    // Anticipation: dip slightly toward the player first, then settle out.
    const gsap = window.gsap;
    if (gsap) {
      gsap.to(rig, { distance: target.distance * 0.82, height: target.height * 0.9, duration: 0.18, ease: 'power2.in' });
      gsap.to(rig, {
        distance: target.distance, height: target.height, lookAhead: target.lookAhead,
        duration: 0.7, delay: 0.18, ease: 'expo.out', overwrite: 'auto',
      });
    } else {
      rig.distance = target.distance;
      rig.height = target.height;
      rig.lookAhead = target.lookAhead;
    }
  }

  function update(player, dt) {
    // Behind the player's heading, high and angled down.
    const backX = -Math.sin(player.angle);
    const backZ = -Math.cos(player.angle);
    const tx = player.x + backX * rig.distance + Math.sin(player.angle) * rig.lookAhead * 0.4;
    const tz = player.z + backZ * rig.distance + Math.cos(player.angle) * rig.lookAhead * 0.4;
    const k = 1 - Math.pow(0.0015, dt); // frame-rate independent smoothing
    rig.pos.x += (tx - rig.pos.x) * k;
    rig.pos.y += (rig.height - rig.pos.y) * k;
    rig.pos.z += (tz - rig.pos.z) * k;
    const lx = player.x + Math.sin(player.angle) * rig.lookAhead;
    const lz = player.z + Math.cos(player.angle) * rig.lookAhead;
    rig.look.x += (lx - rig.look.x) * k;
    rig.look.y += (0 - rig.look.y) * k;
    rig.look.z += (lz - rig.look.z) * k;
    camera.position.copy(rig.pos);
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
    rig.look.set(player.x, 0, player.z);
    camera.position.copy(rig.pos);
    camera.lookAt(rig.look);
  }

  return { rig, setMode, update, snap };
}
