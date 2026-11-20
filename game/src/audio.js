// Procedural WebAudio sound: no audio files, everything synthesised.
// Engine hum (pitch follows speed), two-tone police siren, gunshot noise
// burst, punch thud, pickup chime, mission-complete arpeggio, and two
// generative radio stations (no audio files). All guarded: if the
// AudioContext cannot start, every call is a silent no-op.

// Two stations: chord roots in Hz, a bass note per bar and a pluck melody.
// The HUD reads radioLine() for the station + current track.
const STATIONS = [
  { freq: '98.4', name: 'Neon Coast', bpm: 92, roots: [220, 174.6, 196, 146.8], tracks: ['Midnight Cruise', 'Palm Static', 'Chrome Sunset'] },
  { freq: '101.2', name: 'Barrio Beats', bpm: 116, roots: [196, 164.8, 220, 185], tracks: ['Calle Fuego', 'Marina Nights', 'Bassline Barrio'] },
];
const MELODY = [0, 3, 7, 10, 7, 3, 12, 10];

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let radioStation = 0;
  let radioStep = 0;
  let radioNextTime = 0;
  let radioTrack = 0;

  function ensure() {
    if (context) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.14;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
  }

  function noiseBuffer(duration) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, duration, type, volume, when = 0) {
    if (!context) return;
    const t = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    unlock,
    /** Current station line for the HUD. Works with no audio context. */
    radioLine() {
      const st = STATIONS[radioStation];
      return `RADIO SOLMAR ${st.freq} — ${st.name} · “${st.tracks[radioTrack]}”`;
    },
    radioStation() { return radioStation; },
    nextStation() {
      radioStation = (radioStation + 1) % STATIONS.length;
      radioTrack = (radioTrack + 1) % STATIONS[radioStation].tracks.length;
      radioStep = 0;
      radioNextTime = 0;
      return STATIONS[radioStation].name;
    },
    /** Generative radio: schedule the next notes while the game runs. */
    radioTick() {
      if (!context || context.state !== 'running') return;
      const st = STATIONS[radioStation];
      const stepDur = 60 / st.bpm / 2; // eighth notes
      if (radioNextTime < context.currentTime) radioNextTime = context.currentTime + 0.05;
      while (radioNextTime < context.currentTime + 0.25) {
        const bar = Math.floor(radioStep / 8) % st.roots.length;
        const root = st.roots[bar];
        const t = radioNextTime;
        // Bass on the beat.
        if (radioStep % 2 === 0) {
          const o = context.createOscillator();
          const g = context.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(root / 2, t);
          g.gain.setValueAtTime(0.16, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
          o.connect(g); g.connect(master);
          o.start(t); o.stop(t + stepDur * 2);
        }
        if (radioStep % 2 === 1) {
          const semis = MELODY[radioStep % MELODY.length];
          const f = root * Math.pow(2, semis / 12);
          const o = context.createOscillator();
          const g = context.createGain();
          o.type = radioStation === 0 ? 'sine' : 'square';
          o.frequency.setValueAtTime(f, t);
          g.gain.setValueAtTime(0.07, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.5);
          o.connect(g); g.connect(master);
          o.start(t); o.stop(t + stepDur * 1.6);
        }
        radioStep += 1;
        if (radioStep % 64 === 0) radioTrack = (radioTrack + 1) % st.tracks.length;
        radioNextTime += stepDur;
      }
    },
    /** Engine hum follows speed 0..1; call every frame, pass 0 when on foot. */
    engine(speed01, on) {
      if (!ensure()) return;
      if (!on) {
        if (engineOsc) {
          try { engineOsc.stop(); } catch { /* already stopped */ }
          engineOsc = null;
          engineGain = null;
        }
        return;
      }
      if (!engineOsc) {
        engineOsc = context.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = context.createGain();
        engineGain.gain.value = 0.0;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, context.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, context.currentTime, 0.1);
    },
    /** Two-tone siren while wanted; call every frame with wanted > 0. */
    siren(on, dt) {
      if (!ensure()) return;
      if (!on) {
        if (sirenOsc) {
          try { sirenOsc.stop(); } catch { /* already stopped */ }
          sirenOsc = null;
          sirenGain = null;
        }
        return;
      }
      if (!sirenOsc) {
        sirenOsc = context.createOscillator();
        sirenOsc.type = 'square';
        sirenGain = context.createGain();
        sirenGain.gain.value = 0.02;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
      }
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = 0.42;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 920 : 690, context.currentTime, 0.03);
      }
    },
    shot() {
      if (!ensure()) return;
      const src = context.createBufferSource();
      src.buffer = noiseBuffer(0.14);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.5, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.14);
      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 900;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    },
    punch() {
      if (!ensure()) return;
      blip(90, 0.12, 'sine', 0.5);
      blip(55, 0.16, 'triangle', 0.35, 0.01);
    },
    pickup() {
      if (!ensure()) return;
      blip(880, 0.1, 'sine', 0.3);
      blip(1318, 0.16, 'sine', 0.3, 0.08);
    },
    cash() {
      if (!ensure()) return;
      blip(1046, 0.09, 'sine', 0.25);
      blip(1318, 0.09, 'sine', 0.25, 0.07);
      blip(1568, 0.14, 'sine', 0.25, 0.14);
    },
    missionComplete() {
      if (!ensure()) return;
      [523, 659, 784, 1046].forEach((freq, i) => blip(freq, 0.18, 'triangle', 0.3, i * 0.09));
    },
    busted() {
      if (!ensure()) return;
      blip(220, 0.5, 'sawtooth', 0.3);
      blip(165, 0.7, 'sawtooth', 0.3, 0.15);
    },
    crash() {
      if (!ensure()) return;
      const src = context.createBufferSource();
      src.buffer = noiseBuffer(0.2);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.4, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    },
  };
}
