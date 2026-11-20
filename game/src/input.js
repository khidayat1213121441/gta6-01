// Keyboard + mouse input. Keys are read as a held set every frame; actions
// (confirm, pause, enter-car, punch, shoot) are edge-triggered and consumed
// once by the loop through takeActions(). Mouse position is kept in canvas
// pixels so aiming and menus can use it.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_RUN = 32;
export const ACTION_SHOP_1 = 64;
export const ACTION_SHOP_2 = 128;
export const ACTION_SHOP_3 = 256;
export const ACTION_SHOP_4 = 512;
export const ACTION_SHOP_5 = 1024;
export const ACTION_SHOP_6 = 2048;
export const ACTION_RADIO = 4096;
export const ACTION_WEAPON = 8192;

const KEY_ACTIONS = {
  Space: ACTION_CONFIRM,
  Enter: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyE: ACTION_ENTER,
  KeyF: ACTION_PUNCH,
  ShiftLeft: ACTION_RUN,
  ShiftRight: ACTION_RUN,
  Digit1: ACTION_SHOP_1,
  Digit2: ACTION_SHOP_2,
  Digit3: ACTION_SHOP_3,
  Digit4: ACTION_SHOP_4,
  Digit5: ACTION_SHOP_5,
  Digit6: ACTION_SHOP_6,
  KeyR: ACTION_RADIO,
  KeyQ: ACTION_WEAPON,
};

export function createInput(canvas) {
  const keys = new Set();
  let queued = 0;
  const mouse = { x: 0, y: 0, down: false };
  let clicked = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action !== undefined) queued |= action;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }

  function onMouseDown(event) {
    onMouseMove(event);
    mouse.down = true;
    clicked = true;
    queued |= ACTION_SHOOT;
  }

  function onMouseUp() {
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    /** {x, y}: x strafe right, y forward (W = -1 in screen terms, flipped by caller). */
    move() {
      const left = keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0;
      const right = keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0;
      const up = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
      const down = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
      return { x: right - left, y: down - up };
    },
    running() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    takeActions() {
      const actions = queued | (clicked ? ACTION_SHOOT : 0);
      queued = 0;
      clicked = false;
      return actions;
    },
  };
}
