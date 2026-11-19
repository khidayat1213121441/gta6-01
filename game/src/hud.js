// The HUD: DOM panels over the 3D canvas — minimap, wanted stars, health,
// cash, mission objective, speed and clock — plus the title / pause /
// busted / wasted / win screens. Motion follows the motion-design skill:
// Energetic pops for game feedback (ease-out-back, 150–300ms), Premium
// slides for menus (power3.out, 400–600ms), staggered entrances under
// 500ms total, never opacity-only, never linear.
import { CITY, MOTION } from './config.js';
import { districtAt } from './world.js';

const { size } = CITY;

function el(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function formatClock(seconds) {
  const total = Math.floor(seconds) % 86400;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createHud(callbacks) {
  const root = document.getElementById('hud') || el('div', '', document.body);
  root.id = 'hud';
  root.innerHTML = '';
  const gsap = window.gsap;

  const style = document.createElement('style');
  style.textContent = `
    #hud { position: fixed; inset: 0; pointer-events: none; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #f4f1e8; z-index: 5; }
    #hud .panel { background: rgba(12,16,24,0.72); border: 1px solid rgba(255,255,255,0.14); border-radius: 10px; backdrop-filter: blur(2px); }
    #hud .minimap-wrap { position: absolute; top: 14px; left: 14px; padding: 8px; }
    #hud .minimap-wrap .city-name { font-weight: 800; letter-spacing: 2px; font-size: 13px; margin-bottom: 5px; }
    #hud canvas.minimap { display: block; border-radius: 6px; }
    #hud .top-right { position: absolute; top: 14px; right: 14px; text-align: right; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
    #hud .stars { font-size: 26px; letter-spacing: 3px; line-height: 1; text-shadow: 0 2px 6px rgba(0,0,0,0.7); }
    #hud .stars .on { color: #ffd23f; } #hud .stars .off { color: rgba(255,255,255,0.25); }
    #hud .cash { font-size: 22px; font-weight: 800; color: #7ee081; text-shadow: 0 2px 6px rgba(0,0,0,0.7); }
    #hud .health-bar { width: 190px; height: 12px; background: rgba(0,0,0,0.55); border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.2); }
    #hud .health-fill { height: 100%; background: #58d158; width: 100%; }
    #hud .objective { position: absolute; left: 14px; bottom: 14px; padding: 12px 16px; max-width: 430px; }
    #hud .objective .mission-title { font-size: 15px; font-weight: 800; letter-spacing: 1px; color: #ffd23f; }
    #hud .objective .mission-text { font-size: 15px; margin-top: 3px; line-height: 1.35; }
    #hud .bottom-right { position: absolute; right: 14px; bottom: 14px; text-align: right; }
    #hud .speed { font-size: 34px; font-weight: 800; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
    #hud .speed small { font-size: 13px; font-weight: 600; color: #c9c4b4; }
    #hud .clock { font-size: 16px; color: #c9c4b4; text-shadow: 0 2px 6px rgba(0,0,0,0.8); }
    #hud .toasts { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; align-items: center; }
    #hud .toast { padding: 8px 16px; font-size: 15px; font-weight: 600; white-space: nowrap; }
    #hud .brief { position: absolute; top: 84px; left: 50%; transform: translateX(-50%); padding: 16px 24px; max-width: 560px; text-align: center; }
    #hud .brief h2 { margin: 0 0 6px; font-size: 22px; letter-spacing: 1px; color: #ffd23f; }
    #hud .brief p { margin: 0; font-size: 15px; line-height: 1.45; }
    #hud .flash { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; background: rgba(10,0,0,0.55); }
    #hud .flash h1 { font-size: 72px; margin: 0; letter-spacing: 8px; color: #ff5347; text-shadow: 0 4px 24px rgba(0,0,0,0.9); }
    #hud .flash p { font-size: 18px; margin: 12px 0 0; }
    #hud .screen { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: linear-gradient(180deg, rgba(8,12,20,0.12) 0%, rgba(8,12,20,0.45) 100%); pointer-events: auto; }
    #hud .screen .card { text-align: center; max-width: 620px; padding: 28px 40px; }
    #hud .screen h1 { font-size: 84px; margin: 0; letter-spacing: 10px; color: #ffd23f; text-shadow: 0 6px 30px rgba(0,0,0,0.9); font-family: "Trebuchet MS", system-ui, sans-serif; }
    #hud .screen h2 { font-size: 18px; margin: 4px 0 18px; letter-spacing: 4px; color: #f4f1e8; font-weight: 600; }
    #hud .screen p { font-size: 15px; line-height: 1.6; color: #c9c4b4; margin: 6px 0; }
    #hud .screen .keys { font-size: 14px; color: #f4f1e8; background: rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 14px; margin: 14px 0; line-height: 1.9; }
    #hud button { pointer-events: auto; cursor: pointer; font-size: 17px; font-weight: 700; letter-spacing: 1px; color: #10131a; background: #ffd23f; border: none; border-radius: 8px; padding: 12px 30px; margin: 6px 4px 0; }
    #hud button.secondary { background: rgba(255,255,255,0.16); color: #f4f1e8; border: 1px solid rgba(255,255,255,0.3); }
    #hud .hidden { display: none !important; }
  `;
  document.head.appendChild(style);

  // --- minimap ---
  const minimapWrap = el('div', 'panel minimap-wrap', root);
  el('div', 'city-name', minimapWrap, 'SOLMAR CITY');
  const minimap = el('canvas', 'minimap', minimapWrap);
  minimap.width = 200;
  minimap.height = 200;
  const mm = minimap.getContext('2d');

  // --- top right: stars, cash, health ---
  const topRight = el('div', 'top-right', root);
  const starsEl = el('div', 'stars', topRight);
  const cashEl = el('div', 'cash', topRight, '$0');
  const healthBar = el('div', 'health-bar', topRight);
  const healthFill = el('div', 'health-fill', healthBar);

  // --- objective (bottom left) ---
  const objective = el('div', 'panel objective', root);
  const missionTitle = el('div', 'mission-title', objective, '');
  const missionText = el('div', 'mission-text', objective, '');

  // --- speed + clock (bottom right) ---
  const bottomRight = el('div', 'bottom-right', root);
  const speedEl = el('div', 'speed', bottomRight);
  speedEl.innerHTML = '0 <small>km/h</small>';
  const clockEl = el('div', 'clock', bottomRight, '08:00');

  // --- toasts + brief ---
  const toasts = el('div', 'toasts', root);
  const brief = el('div', 'panel brief hidden', root);
  const briefTitle = el('h2', '', brief, '');
  const briefText = el('p', '', brief, '');

  // --- flash (busted / wasted / win) ---
  const flash = el('div', 'flash hidden', root);
  const flashTitle = el('h1', '', flash, '');
  const flashSub = el('p', '', flash, '');

  // --- screens ---
  const titleScreen = el('div', 'screen', root);
  const titleCard = el('div', 'card', titleScreen);
  el('h1', '', titleCard, 'SOLMAR');
  el('h2', '', titleCard, 'A SUN-SOAKED OPEN-WORLD CRIME STORY');
  el('p', '', titleCard, 'Rico’s crew runs Solmar City — downtown towers, the marina, the barrio. Steal cars, outrun the law, run six jobs and take the city.');
  const keys = el('div', 'keys', titleCard);
  keys.innerHTML = 'WASD / Arrows — move &amp; drive &nbsp;·&nbsp; E — enter / steal car<br>Mouse — aim &nbsp;·&nbsp; Click / F — shoot &nbsp;·&nbsp; Space — punch &nbsp;·&nbsp; Shift — run<br>P / Esc — pause &nbsp;·&nbsp; Save at Rico’s Garage';
  const startBtn = el('button', '', titleCard, 'START ENGINE');
  const continueBtn = el('button', 'secondary hidden', titleCard, 'CONTINUE');
  startBtn.addEventListener('click', () => callbacks.onStart(false));
  continueBtn.addEventListener('click', () => callbacks.onStart(true));

  const pauseScreen = el('div', 'screen hidden', root);
  const pauseCard = el('div', 'card', pauseScreen);
  el('h1', '', pauseCard, 'PAUSED');
  el('p', '', pauseCard, 'Solmar waits for no one. Except now.');
  const resumeBtn = el('button', '', pauseCard, 'RESUME');
  resumeBtn.addEventListener('click', () => callbacks.onResume());

  // Pre-render the minimap base (roads, water, districts) once.
  const base = document.createElement('canvas');
  base.width = 200;
  base.height = 200;
  {
    const b = base.getContext('2d');
    const s = 200 / size;
    b.fillStyle = '#3a5a2e';
    b.fillRect(0, 0, 200, 200);
    for (let bx = 0; bx < 40; bx += 1) {
      for (let bz = 0; bz < 40; bz += 1) {
        const d = districtAt(bx, bz);
        b.fillStyle = d === 'sea' ? '#2b7fb8' : d === 'beach' ? '#e0c98f' : d === 'downtown' ? '#5a5e66' : d === 'park' ? '#2f5e2a' : '#4c7a3c';
        b.fillRect(bx * 144 * s, bz * 144 * s, 144 * s, 144 * s);
      }
    }
    b.strokeStyle = '#3a3d44';
    b.lineWidth = 1.6;
    for (let i = 0; i < 40; i += 1) {
      const c = (i * 144 + 24) * s;
      b.beginPath(); b.moveTo(c, 0); b.lineTo(c, 200); b.stroke();
      b.beginPath(); b.moveTo(0, c); b.lineTo(200, c); b.stroke();
    }
  }

  let lastStars = -1;
  let lastCash = -1;
  let cashShown = 0;
  let briefTimer = null;

  // In shot mode GSAP's ticker cannot be trusted under virtual time, so
  // every animation lands in its final state at once.
  const shotMode = () => !!window.__shotMode;

  function pop(node) {
    if (!gsap || shotMode()) return;
    gsap.fromTo(node, { scale: 1.35 }, { scale: 1, duration: MOTION.quick + 0.1, ease: MOTION.popEase, overwrite: 'auto' });
  }

  function showToast(text, ms = 2600) {
    const toast = el('div', 'panel toast', toasts, text);
    if (shotMode()) {
      setTimeout(() => toast.remove(), ms);
      return;
    }
    if (gsap) {
      gsap.fromTo(toast, { y: -14, opacity: 0 }, { y: 0, opacity: 1, duration: MOTION.standard, ease: MOTION.signatureEase });
      gsap.to(toast, { opacity: 0, y: -8, delay: ms / 1000, duration: 0.3, ease: 'power2.in', onComplete: () => toast.remove() });
    } else {
      setTimeout(() => toast.remove(), ms);
    }
  }

  function showBrief(title, text) {
    briefTitle.textContent = title;
    briefText.textContent = text;
    brief.classList.remove('hidden');
    if (shotMode()) return;
    if (gsap) {
      gsap.fromTo(brief, { y: -26, opacity: 0 }, { y: 0, opacity: 1, duration: MOTION.slow, ease: MOTION.signatureEase, overwrite: 'auto' });
    }
    if (briefTimer) clearTimeout(briefTimer);
    briefTimer = setTimeout(() => {
      if (gsap) gsap.to(brief, { opacity: 0, y: -14, duration: 0.3, ease: 'power2.in', onComplete: () => brief.classList.add('hidden') });
      else brief.classList.add('hidden');
    }, 5200);
  }

  function showFlash(title, sub, ms = 2200) {
    flashTitle.textContent = title;
    flashSub.textContent = sub;
    flash.classList.remove('hidden');
    if (gsap) {
      gsap.fromTo(flashTitle, { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: MOTION.dramatic, ease: MOTION.popEase });
      gsap.fromTo(flash, { x: 0 }, { x: 8, duration: 0.05, repeat: 5, yoyo: true, ease: 'none' });
    }
    setTimeout(() => flash.classList.add('hidden'), ms);
  }

  function update(state) {
    // Stars.
    if (state.wanted.stars !== lastStars) {
      lastStars = state.wanted.stars;
      let html = '';
      for (let i = 0; i < 5; i += 1) {
        html += `<span class="${i < state.wanted.stars ? 'on' : 'off'}">★</span>`;
      }
      starsEl.innerHTML = html;
      if (state.wanted.stars > 0) pop(starsEl);
    }
    // Cash with a tick-up tween.
    if (state.player.cash !== lastCash) {
      const from = cashShown;
      const to = state.player.cash;
      lastCash = to;
      cashShown = to;
      if (gsap && Math.abs(to - from) > 0 && !shotMode()) {
        const obj = { v: from };
        gsap.to(obj, {
          v: to, duration: 0.5, ease: 'power2.out',
          onUpdate: () => { cashEl.textContent = `$${Math.round(obj.v).toLocaleString('en-US')}`; },
        });
        gsap.fromTo(cashEl, { scale: 1.18 }, { scale: 1, duration: 0.3, ease: MOTION.popEase });
      } else {
        cashEl.textContent = `$${to.toLocaleString('en-US')}`;
      }
    }
    // Health.
    const hp = Math.max(0, state.player.health);
    healthFill.style.width = `${hp}%`;
    healthFill.style.background = hp < 30 ? '#e5534b' : '#58d158';
    // Speed + clock.
    const kmh = Math.round(Math.abs(state.player.inCar ? state.player.inCar.speed : state.player.speed) * 0.24);
    speedEl.innerHTML = state.player.inCar ? `${kmh} <small>km/h</small>` : '';
    clockEl.textContent = `${formatClock(state.clock)}  ·  PKG ${state.stats.packages}  ·  FARES ${state.stats.fares}`;
    // Objective.
    missionTitle.textContent = state.missionTitle || '';
    missionText.textContent = state.missionObjective || '';

    // --- minimap ---
    const s = 200 / size;
    mm.clearRect(0, 0, 200, 200);
    mm.drawImage(base, 0, 0);
    // Packages.
    mm.fillStyle = '#ff8c1a';
    for (const pkg of state.city.packages) {
      if (pkg.taken) continue;
      mm.beginPath();
      mm.arc(pkg.x * s, pkg.z * s, 2.5, 0, Math.PI * 2);
      mm.fill();
    }
    // Mission target.
    if (state.mission.target) {
      const pulse = 5 + Math.sin(performance.now() / 300) * 2;
      mm.fillStyle = '#ffd23f';
      mm.beginPath();
      mm.arc(state.mission.target.x * s, state.mission.target.z * s, pulse, 0, Math.PI * 2);
      mm.fill();
      mm.strokeStyle = 'rgba(0,0,0,0.6)';
      mm.lineWidth = 1;
      mm.stroke();
    }
    // Taxi passenger.
    if (state.taxi && state.taxi.active && !state.taxi.hasPassenger) {
      mm.fillStyle = '#7ee081';
      mm.beginPath();
      mm.arc(state.taxi.px * s, state.taxi.pz * s, 4, 0, Math.PI * 2);
      mm.fill();
    }
    // Police.
    const flashOn = Math.floor(performance.now() / 300) % 2 === 0;
    mm.fillStyle = flashOn ? '#ff3b30' : '#3b82ff';
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      mm.beginPath();
      mm.arc(car.x * s, car.z * s, 3, 0, Math.PI * 2);
      mm.fill();
    }
    // Player arrow.
    const px = state.player.x * s;
    const pz = state.player.z * s;
    mm.save();
    mm.translate(px, pz);
    mm.rotate(state.player.angle);
    mm.fillStyle = '#ffffff';
    mm.strokeStyle = 'rgba(0,0,0,0.7)';
    mm.lineWidth = 1;
    mm.beginPath();
    mm.moveTo(0, -7);
    mm.lineTo(5, 6);
    mm.lineTo(-5, 6);
    mm.closePath();
    mm.fill();
    mm.stroke();
    mm.restore();
  }

  function showScreen(name) {
    titleScreen.classList.toggle('hidden', name !== 'title');
    pauseScreen.classList.toggle('hidden', name !== 'paused');
    if (name === 'title' && gsap && !shotMode()) {
      gsap.fromTo(titleCard.children, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: MOTION.slow, stagger: MOTION.stagger, ease: MOTION.signatureEase, overwrite: 'auto' });
    }
  }

  function setContinueVisible(visible) {
    continueBtn.classList.toggle('hidden', !visible);
  }

  return {
    update, showToast, showBrief, showFlash, showScreen, setContinueVisible,
    root,
  };
}
