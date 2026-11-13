import * as THREE from 'three';

const WEAPON_TIMBRES = Object.freeze({
  vesper: [3600, 168, 57, 0.14, 0.19, 1],
  smg: [4450, 220, 86, 0.073, 0.082, 0.72],
  precision: [2700, 110, 39, 0.22, 0.29, 1.08],
  sidearm: [5100, 245, 108, 0.091, 0.096, 0.73],
  'heavy-sidearm': [3800, 153, 56, 0.165, 0.19, 0.98],
  enemy: [2700, 132, 48, 0.115, 0.19, 0.8],
});

const UTILITY_TIMBRES = Object.freeze({
  pulse: [105, 48, 0.27, 'triangle', 0.37],
  haze: [880, 340, 0.46, 'sine', 0.15],
  stasis: [410, 770, 0.31, 'triangle', 0.22],
});

const tmpPosition = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();

const MATERIAL_PROFILES = Object.freeze({
  concrete: { frequency: 820, q: 0.72, pitch: 105, noise: 0.34, tone: 0.18 },
  plaster: { frequency: 620, q: 0.65, pitch: 82, noise: 0.3, tone: 0.1 },
  metal: { frequency: 2900, q: 5.2, pitch: 1180, noise: 0.18, tone: 0.32 },
  wood: { frequency: 520, q: 1.1, pitch: 186, noise: 0.22, tone: 0.2 },
  glass: { frequency: 4100, q: 8.5, pitch: 1820, noise: 0.16, tone: 0.3 },
  dirt: { frequency: 360, q: 0.5, pitch: 65, noise: 0.34, tone: 0.07 },
  sand: { frequency: 280, q: 0.45, pitch: 54, noise: 0.32, tone: 0.05 },
  fabric: { frequency: 230, q: 0.5, pitch: 48, noise: 0.2, tone: 0.04 },
  flesh: { frequency: 290, q: 0.8, pitch: 74, noise: 0.22, tone: 0.12 },
  asphalt: { frequency: 700, q: 0.7, pitch: 92, noise: 0.31, tone: 0.12 },
});

const ALIASES = Object.freeze({
  shot: 'rifle-fire',
  fire: 'rifle-fire',
  'weapon-fire': 'rifle-fire',
  'rifle-shot': 'rifle-fire',
  dry: 'weapon-dry',
  'reload-start': 'reload-grab',
  'reload-eject': 'reload-mag-out',
  'reload-insert': 'reload-mag-in',
  'reload-complete': 'reload-charge',
  impact: 'impact-concrete',
  footstep: 'footstep-concrete',
  land: 'player-land',
  jump: 'player-jump',
  damage: 'player-damage',
  death: 'player-death',
  confirm: 'ui-confirm',
  select: 'ui-select',
});

function emit(events, name, payload = {}) {
  if (!events) return;
  if (typeof events.emit === 'function') events.emit(name, payload);
  else if (typeof events.dispatch === 'function') events.dispatch(name, payload);
  else if (typeof events.dispatchEvent === 'function') {
    events.dispatchEvent(new CustomEvent(name, { detail: payload }));
  }
}

function subscribe(events, name, handler) {
  if (!events) return () => {};
  if (typeof events.on === 'function') {
    const result = events.on(name, handler);
    if (typeof result === 'function') return result;
    return () => events.off?.(name, handler);
  }
  if (typeof events.addEventListener === 'function') {
    const wrapped = (event) => handler(event.detail ?? event);
    events.addEventListener(name, wrapped);
    return () => events.removeEventListener(name, wrapped);
  }
  return () => {};
}

function readVector(value, target) {
  if (!value) return null;
  if (value.isVector3) return target.copy(value);
  if (Array.isArray(value) && value.length >= 3) {
    return target.set(Number(value[0]), Number(value[1]), Number(value[2]));
  }
  if (Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)) {
    return target.set(value.x, value.y, value.z);
  }
  return null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function random01(stream) {
  if (typeof stream?.float === 'function') return stream.float();
  if (typeof stream?.next === 'function') return stream.next();
  return 0.5;
}

function randomRange(stream, min, max) {
  if (typeof stream?.range === 'function') return stream.range(min, max);
  return min + (max - min) * random01(stream);
}

function setParam(param, value, time) {
  if (!param) return;
  param.setValueAtTime(value, time);
}

function rampParam(param, value, time) {
  if (!param) return;
  param.exponentialRampToValueAtTime(Math.max(0.0001, value), time);
}

export class AudioSystem {
  constructor(options = {}) {
    this.options = options;
    this.context = null;
    this.events = null;
    this.rng = null;
    this.master = null;
    this.compressor = null;
    this.reverb = null;
    this.reverbGain = null;
    this.buses = {};
    this.noiseBuffer = null;
    this.activeSources = new Set();
    this.ambientSources = new Set();
    this.pending = [];
    this.unsubscribers = [];
    this.gestureListeners = [];
    this.lastPlayed = new Map();
    this.listenerPosition = new THREE.Vector3();
    this.listenerForward = new THREE.Vector3(0, 0, -1);
    this.listenerUp = new THREE.Vector3(0, 1, 0);
    this.enabled = options.enabled !== false;
    this.started = false;
    this.disposed = false;
    this.ambientStarted = false;
  }

  init(context) {
    if (this.events) return this;
    this.events = context.events;
    this.rng = context.rng?.stream?.('audio-variation')
      ?? context.rng?.getStream?.('audio-variation')
      ?? null;
    this._bindEvents();
    this._installGestureUnlock();
    return this;
  }

  _bindEvents() {
    this.unsubscribers.push(
      subscribe(this.events, 'audio:play', (data) => {
        this.play(data?.name ?? data, {
          ...data,
          ...(data?.options ?? {}),
        });
      }),
      subscribe(this.events, 'game:start', () => {
        this.resume();
        this.play('ui-confirm', { volume: 0.38 });
      }),
      subscribe(this.events, 'game:resume', () => this.resume()),
      subscribe(this.events, 'game:restart', () => this.reset()),
      subscribe(this.events, 'game:victory', () => this.play('victory')),
      subscribe(this.events, 'game:defeat', () => this.play('defeat')),
      subscribe(this.events, 'weapon:fire', (data) => {
        const isEnemy = data?.kind === 'enemy' || String(data?.source ?? '').startsWith('enemy:');
        this.play(isEnemy ? 'enemy-fire' : 'rifle-fire', data);
      }),
      subscribe(this.events, 'weapon:melee', (data) => this.play('melee-swing', data)),
      subscribe(this.events, 'weapon:cycle', (data) => this.play('reload-charge', data)),
      subscribe(this.events, 'throwable:deployed', (data) => this.play(`orb-${data.id}`, data)),
      subscribe(this.events, 'weapon:dry', (data) => this.play('weapon-dry', data)),
      subscribe(this.events, 'weapon:reload-start', (data) => this.play('reload-grab', data)),
      subscribe(this.events, 'weapon:reload-phase', (data) => {
        const phase = String(data?.phase ?? '');
        if (phase.includes('out') || phase.includes('eject')) this.play('reload-mag-out', data);
        else if (phase.includes('in') || phase.includes('insert')) this.play('reload-mag-in', data);
        else if (phase.includes('charge') || phase.includes('bolt')) this.play('reload-charge', data);
        else this.play('reload-handle', data);
      }),
      subscribe(this.events, 'weapon:reload-complete', (data) => this.play('reload-settle', data)),
      subscribe(this.events, 'projectile:impact', (data) => {
        const materialName = data?.material ?? data?.surface ?? 'concrete';
        this.play(`impact-${materialName}`, data);
      }),
      subscribe(this.events, 'player:jump', (data) => this.play('player-jump', data)),
      subscribe(this.events, 'player:land', (data) => this.play('player-land', data)),
      subscribe(this.events, 'player:damage', (data) => this.play('player-damage', data)),
      subscribe(this.events, 'player:death', (data) => this.play('player-death', data)),
      subscribe(this.events, 'combat:hitmarker', (data) => {
        this.play(data?.lethal ? 'ui-kill' : 'ui-hit', data);
      }),
    );
  }

  _installGestureUnlock() {
    const unlock = () => {
      this.resume();
      this._removeGestureUnlock();
    };
    for (const type of ['pointerdown', 'keydown', 'touchstart']) {
      document.addEventListener(type, unlock, { capture: true, passive: true });
      this.gestureListeners.push(() => document.removeEventListener(type, unlock, { capture: true }));
    }
  }

  _removeGestureUnlock() {
    for (let i = this.gestureListeners.length - 1; i >= 0; i -= 1) {
      this.gestureListeners[i]();
    }
    this.gestureListeners.length = 0;
  }

  async resume() {
    if (!this.enabled || this.disposed) return false;
    if (!this.context) this._createContext();
    if (!this.context) return false;
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        return false;
      }
    }
    this.started = this.context.state === 'running';
    if (this.started) {
      this._removeGestureUnlock();
      this._startAmbience();
      const queue = this.pending.splice(0, 12);
      for (let i = 0; i < queue.length; i += 1) {
        this.play(queue[i].name, queue[i].options);
      }
    }
    return this.started;
  }

  _createContext() {
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Context) {
      this.enabled = false;
      return;
    }
    this.context = new Context({ latencyHint: 'interactive' });
    const now = this.context.currentTime;
    this.master = this.context.createGain();
    this.master.gain.setValueAtTime(clamp(this.options.volume ?? 0.72, 0, 1), now);
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-13, now);
    this.compressor.knee.setValueAtTime(12, now);
    this.compressor.ratio.setValueAtTime(5.5, now);
    this.compressor.attack.setValueAtTime(0.002, now);
    this.compressor.release.setValueAtTime(0.16, now);
    this.master.connect(this.compressor).connect(this.context.destination);

    const levels = {
      weapon: 0.9,
      impact: 0.72,
      foley: 0.62,
      ui: 0.46,
      ambience: 0.34,
      voice: 0.62,
    };
    Object.entries(levels).forEach(([name, level]) => {
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(level, now);
      gain.connect(this.master);
      this.buses[name] = gain;
    });

    this.noiseBuffer = this._makeNoiseBuffer(2.4);
    this.reverb = this.context.createConvolver();
    this.reverb.buffer = this._makeImpulseBuffer(1.25);
    this.reverbGain = this.context.createGain();
    this.reverbGain.gain.setValueAtTime(0.28, now);
    this.reverb.connect(this.reverbGain).connect(this.buses.ambience);
    this.rng?.reset?.();
    this._applyListener();
  }

  _makeNoiseBuffer(seconds) {
    const length = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i += 1) {
      const white = random01(this.rng) * 2 - 1;
      previous = previous * 0.18 + white * 0.82;
      channel[i] = previous;
    }
    return buffer;
  }

  _makeImpulseBuffer(seconds) {
    const length = Math.floor(this.context.sampleRate * seconds);
    const impulse = this.context.createBuffer(2, length, this.context.sampleRate);
    for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex += 1) {
      const channel = impulse.getChannelData(channelIndex);
      for (let i = 0; i < length; i += 1) {
        const normalized = i / length;
        const early = i < 1500 ? 0.45 : 0;
        channel[i] = (random01(this.rng) * 2 - 1) *
          (early + (1 - normalized) ** 2.8) *
          0.55;
      }
    }
    return impulse;
  }

  play(name, options = {}) {
    if (!this.enabled || this.disposed || !name) return null;
    const normalized = this._canonicalName(name, options);
    if (!this.context || this.context.state !== 'running') {
      if (this.pending.length < 12) this.pending.push({ name: normalized, options: { ...options } });
      return null;
    }

    const nowMs = performance.now();
    const position = readVector(options.position ?? options.origin, tmpPosition);
    const last = this.lastPlayed.get(normalized);
    if (last && nowMs - last.time < 10) {
      const samePosition = !position || !last.position ||
        Math.hypot(
          position.x - last.position[0],
          position.y - last.position[1],
          position.z - last.position[2],
        ) < 0.25;
      if (samePosition) return null;
    }
    this.lastPlayed.set(normalized, {
      time: nowMs,
      position: position ? [position.x, position.y, position.z] : null,
    });

    if (normalized === 'rifle-fire') return this._playRifle(options, false);
    if (normalized === 'enemy-fire') return this._playRifle(options, true);
    if (normalized === 'melee-swing') return this._playMelee(options);
    if (normalized.startsWith('orb-')) return this._playOrb(normalized.slice(4), options);
    if (normalized === 'weapon-dry') return this._playDry(options);
    if (
      normalized.startsWith('reload-') ||
      normalized === 'enemy-reload' ||
      normalized === 'weapon-mechanical'
    ) {
      return this._playReload(normalized, options);
    }
    if (normalized.startsWith('impact-')) {
      return this._playImpact(normalized.slice(7), options);
    }
    if (normalized === 'shell' || normalized === 'shell-impact' || normalized === 'shell-drop') {
      return this._playShell(options);
    }
    if (normalized.includes('footstep')) return this._playFootstep(normalized, options);
    if (normalized === 'player-jump') return this._playJump(options);
    if (normalized === 'player-land') return this._playLand(options);
    if (normalized === 'relay-pulse') return this._playRelayPulse(options);
    if (normalized === 'slide' || normalized === 'mantle') {
      return this._playMovement(normalized, options);
    }
    if (normalized === 'player-damage') return this._playDamage(options);
    if (normalized === 'player-death') return this._playDeath(options);
    if (normalized === 'enemy-death') return this._playEnemyDeath(options, false);
    if (normalized === 'enemy-headshot') return this._playEnemyDeath(options, true);
    if (normalized === 'victory' || normalized === 'defeat') return this._playResult(normalized);
    if (normalized.startsWith('ui-')) return this._playUI(normalized, options);
    return this._playUI('ui-select', options);
  }

  _canonicalName(name, options) {
    let value = String(name)
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .trim()
      .replaceAll('_', '-');
    value = ALIASES[value] ?? value;
    if (value === 'impact') value = `impact-${options.material ?? 'concrete'}`;
    if (value === 'enemy-footstep') value = `enemy-footstep-${options.surface ?? 'concrete'}`;
    if (value === 'player-footstep') value = `footstep-${options.surface ?? 'concrete'}`;
    return value;
  }

  _output(options, busName, reverbAmount = 0) {
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = options.occluded ? 900 : 20000;
    filter.Q.value = options.occluded ? 0.8 : 0.01;
    gain.connect(filter);

    const position = readVector(options.position ?? options.origin, tmpPosition);
    let panner = null;
    if (position) {
      panner = this.context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = Number(options.refDistance ?? 2.5);
      panner.maxDistance = Number(options.maxDistance ?? 80);
      panner.rolloffFactor = Number(options.rolloff ?? 1.15);
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
      filter.connect(panner);
      panner.connect(this.buses[busName] ?? this.master);
      if (reverbAmount > 0) {
        const send = this.context.createGain();
        send.gain.value = reverbAmount;
        panner.connect(send).connect(this.reverb);
      }
    } else {
      filter.connect(this.buses[busName] ?? this.master);
      if (reverbAmount > 0) {
        const send = this.context.createGain();
        send.gain.value = reverbAmount;
        filter.connect(send).connect(this.reverb);
      }
    }
    return { gain, nodes: [gain, filter, panner].filter(Boolean) };
  }

  _track(source, nodes, ambient = false) {
    this.activeSources.add(source);
    if (ambient) this.ambientSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      this.ambientSources.delete(source);
      source.disconnect();
      for (let i = 0; i < nodes.length; i += 1) nodes[i]?.disconnect?.();
    };
    return source;
  }

  _tone({
    frequency,
    endFrequency = frequency,
    type = 'sine',
    duration = 0.1,
    attack = 0.002,
    volume = 0.2,
    delay = 0,
    bus = 'foley',
    reverb = 0,
    options = {},
    detune = 0,
  }) {
    const now = this.context.currentTime + delay;
    const output = this._output(options, bus, reverb);
    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.detune.setValueAtTime(detune, now);
    setParam(oscillator.frequency, Math.max(1, frequency), now);
    rampParam(oscillator.frequency, Math.max(1, endFrequency), now + duration);
    output.gain.gain.setValueAtTime(0.0001, now);
    output.gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + attack);
    output.gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(output.gain);
    this._track(oscillator, output.nodes);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.015);
    return oscillator;
  }

  _noise({
    duration = 0.1,
    attack = 0.001,
    volume = 0.2,
    delay = 0,
    frequency = 1200,
    endFrequency = frequency,
    filterType = 'lowpass',
    q = 0.7,
    playbackRate = 1,
    bus = 'foley',
    reverb = 0,
    options = {},
  }) {
    const now = this.context.currentTime + delay;
    const output = this._output(options, bus, reverb);
    const filter = this.context.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(q, now);
    setParam(filter.frequency, Math.max(20, frequency), now);
    rampParam(filter.frequency, Math.max(20, endFrequency), now + duration);
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.setValueAtTime(playbackRate, now);
    output.gain.gain.setValueAtTime(0.0001, now);
    output.gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + attack);
    output.gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(output.gain);
    this._track(source, [...output.nodes, filter]);
    const offsetMax = Math.max(0, this.noiseBuffer.duration - duration * playbackRate - 0.02);
    source.start(now, randomRange(this.rng, 0, offsetMax));
    source.stop(now + duration + 0.015);
    return source;
  }

  _playRifle(options, enemy) {
    const key = options.weaponId ?? (enemy ? 'enemy' : 'vesper');
    const [crack, pitch, endPitch, bodyTime, tailTime, gain] = WEAPON_TIMBRES[key] ?? WEAPON_TIMBRES.vesper;
    const volume = clamp(options.volume ?? 1, 0, 1.5) * gain * 0.9;
    this._noise({
      duration: 0.032,
      attack: 0.0005,
      volume: volume,
      frequency: crack,
      endFrequency: 920,
      filterType: 'bandpass',
      q: 0.62,
      bus: 'weapon',
      options,
    });
    this._tone({
      frequency: pitch,
      endFrequency: endPitch,
      type: 'sawtooth',
      duration: bodyTime,
      volume: volume * 0.58,
      bus: 'weapon',
      options,
    });
    this._noise({
      duration: tailTime,
      delay: 0.018,
      attack: 0.003,
      volume: volume * 0.36,
      frequency: 910,
      endFrequency: 260,
      q: 0.55,
      bus: 'weapon',
      reverb: options.indoor || options.interior ? 0.7 : 0.35,
      options,
    });
    this._tone({
      frequency: enemy ? 920 : 1240,
      endFrequency: 420,
      type: 'square',
      duration: 0.026,
      delay: 0.008,
      volume: volume * 0.12,
      bus: 'weapon',
      options,
    });
    return true;
  }

  _playMelee(options) {
    return this._noise({
      frequency: 2750,
      endFrequency: 560,
      duration: 0.17,
      attack: 0.027,
      volume: 0.23,
      filterType: 'bandpass',
      bus: 'foley',
      options,
    });
  }

  _playOrb(id, options) {
    const profile = UTILITY_TIMBRES[id];
    if (!profile) return null;
    const [frequency, endFrequency, duration, type, volume] = profile;
    this._noise({
      frequency: id === 'haze' ? 1750 : 780,
      endFrequency: 220,
      duration,
      attack: id === 'haze' ? 0.04 : 0.004,
      volume: volume * 0.52,
      bus: 'foley',
      reverb: 0.28,
      options,
    });
    return this._tone({ frequency, endFrequency, duration, type, volume, bus: 'foley', options });
  }

  _playDry(options) {
    this._tone({
      frequency: 1540,
      endFrequency: 620,
      type: 'square',
      duration: 0.028,
      volume: clamp(options.volume ?? 0.24, 0, 0.6),
      bus: 'foley',
      options,
    });
    this._tone({
      frequency: 310,
      type: 'triangle',
      duration: 0.045,
      delay: 0.015,
      volume: 0.12,
      bus: 'foley',
      options,
    });
    return true;
  }

  _playReload(name, options) {
    const profiles = {
      'reload-grab': [410, 0.052, 0.12],
      'reload-mag-out': [670, 0.065, 0.16],
      'reload-mag-in': [930, 0.075, 0.2],
      'reload-charge': [1180, 0.09, 0.22],
      'reload-settle': [510, 0.055, 0.14],
      'reload-handle': [760, 0.05, 0.12],
      'enemy-reload': [630, 0.065, 0.13],
      'weapon-mechanical': [980, 0.038, 0.13],
    };
    const [pitch, duration, volume] = profiles[name] ?? profiles['reload-handle'];
    this._noise({
      duration,
      volume: volume * clamp(options.volume ?? 1, 0, 1.5),
      frequency: pitch * 2.2,
      endFrequency: pitch * 0.7,
      filterType: 'bandpass',
      q: 1.8,
      bus: 'foley',
      options,
    });
    this._tone({
      frequency: pitch,
      endFrequency: pitch * 0.62,
      type: 'triangle',
      duration: duration * 0.78,
      volume: volume * 0.46,
      bus: 'foley',
      options,
    });
    return true;
  }

  _playImpact(materialName, options) {
    const material = MATERIAL_PROFILES[materialName] ?? MATERIAL_PROFILES.concrete;
    const volume = clamp(options.volume ?? 0.62, 0, 1.2);
    this._noise({
      duration: materialName === 'dirt' || materialName === 'sand' ? 0.14 : 0.075,
      volume: volume * material.noise,
      frequency: material.frequency,
      endFrequency: material.frequency * 0.42,
      filterType: 'bandpass',
      q: material.q,
      bus: 'impact',
      reverb: 0.08,
      options,
    });
    this._tone({
      frequency: material.pitch * randomRange(this.rng, 0.92, 1.08),
      endFrequency: material.pitch * 0.56,
      type: materialName === 'metal' || materialName === 'glass' ? 'sine' : 'triangle',
      duration: materialName === 'metal' || materialName === 'glass' ? 0.18 : 0.06,
      volume: volume * material.tone,
      bus: 'impact',
      reverb: materialName === 'metal' ? 0.25 : 0.04,
      options,
    });
    return true;
  }

  _playShell(options) {
    const pitch = randomRange(this.rng, 1480, 2240);
    this._tone({
      frequency: pitch,
      endFrequency: pitch * 0.78,
      type: 'sine',
      duration: 0.11,
      volume: clamp(options.volume ?? 0.09, 0, 0.25),
      bus: 'foley',
      options,
    });
    return true;
  }

  _playFootstep(name, options) {
    const surface = options.surface ?? name.split('-').at(-1);
    const profile = MATERIAL_PROFILES[surface] ?? MATERIAL_PROFILES.concrete;
    const enemy = name.startsWith('enemy');
    const volume = clamp(options.volume ?? (enemy ? 0.3 : 0.5), 0, 1);
    this._noise({
      duration: surface === 'dirt' || surface === 'sand' ? 0.14 : 0.085,
      volume: volume * 0.56,
      frequency: profile.frequency * 0.54,
      endFrequency: profile.frequency * 0.24,
      filterType: 'lowpass',
      q: 0.7,
      bus: 'foley',
      options,
    });
    this._tone({
      frequency: profile.pitch * 0.72,
      endFrequency: profile.pitch * 0.38,
      type: 'sine',
      duration: 0.075,
      volume: volume * 0.26,
      bus: 'foley',
      options,
    });
    return true;
  }

  _playJump(options) {
    this._noise({
      duration: 0.11,
      volume: clamp(options.volume ?? 0.22, 0, 0.6),
      frequency: 620,
      endFrequency: 270,
      bus: 'foley',
      options,
    });
    return true;
  }

  _playLand(options) {
    const strength = clamp(options.strength ?? options.speed ?? 1, 0.4, 2);
    this._noise({
      duration: 0.15,
      volume: 0.32 * strength,
      frequency: 520,
      endFrequency: 120,
      bus: 'foley',
      options,
    });
    this._tone({
      frequency: 72,
      endFrequency: 38,
      duration: 0.12,
      volume: 0.2 * strength,
      bus: 'foley',
      options,
    });
    return true;
  }

  _playMovement(name, options) {
    this._noise({
      duration: name === 'slide' ? 0.32 : 0.16,
      volume: clamp(options.volume ?? (name === 'slide' ? 0.24 : 0.18), 0, 0.6),
      frequency: name === 'slide' ? 980 : 680,
      endFrequency: name === 'slide' ? 180 : 260,
      filterType: 'bandpass',
      q: 0.65,
      bus: 'foley',
      options,
    });
    return true;
  }

  _playDamage(options) {
    const amount = clamp(options.amount ?? options.damage ?? 20, 1, 100);
    this._noise({
      duration: 0.2,
      volume: 0.17 + amount * 0.002,
      frequency: 820,
      endFrequency: 170,
      filterType: 'bandpass',
      q: 0.8,
      bus: 'ui',
      options: {},
    });
    this._tone({
      frequency: 88,
      endFrequency: 44,
      duration: 0.22,
      volume: 0.24,
      bus: 'ui',
      options: {},
    });
    return true;
  }

  _playDeath() {
    this._tone({
      frequency: 96,
      endFrequency: 27,
      type: 'sawtooth',
      duration: 1.1,
      volume: 0.25,
      bus: 'ui',
      options: {},
    });
    this._noise({
      duration: 0.8,
      volume: 0.18,
      frequency: 740,
      endFrequency: 95,
      bus: 'ui',
      options: {},
    });
    return true;
  }

  _playEnemyDeath(options, headshot) {
    if (headshot) {
      this._tone({
        frequency: 1780,
        endFrequency: 860,
        type: 'sine',
        duration: 0.075,
        volume: 0.15,
        bus: 'impact',
        options,
      });
    }
    this._noise({
      duration: 0.19,
      volume: clamp(options.volume ?? 0.36, 0, 0.8),
      frequency: headshot ? 1200 : 420,
      endFrequency: 120,
      bus: 'voice',
      options,
    });
    return true;
  }

  _playUI(name, options) {
    const profiles = {
      'ui-confirm': [680, 980, 0.09, 0.13],
      'ui-select': [820, 620, 0.055, 0.08],
      'ui-back': [520, 360, 0.07, 0.08],
      'ui-error': [190, 142, 0.13, 0.14],
      'ui-hit': [1380, 1180, 0.045, 0.1],
      'ui-kill': [760, 1320, 0.11, 0.13],
    };
    const [from, to, duration, level] = profiles[name] ?? profiles['ui-select'];
    this._tone({
      frequency: from,
      endFrequency: to,
      type: 'sine',
      duration,
      volume: level * clamp(options.volume ?? 1, 0, 1.5),
      bus: 'ui',
      options: {},
    });
    return true;
  }

  _playRelayPulse(options) {
    const volume = clamp(options.volume ?? 0.8, 0, 1.5);
    for (const [frequency, delay] of [[218, 0], [326, 0.15], [490, 0.30]]) {
      this._tone({
        frequency,
        endFrequency: frequency * 0.73,
        type: 'triangle',
        duration: 0.18,
        volume: volume * 0.36,
        delay,
        reverb: 0.2,
        options,
      });
    }
    return true;
  }

  _playResult(name) {
    const victory = name === 'victory';
    const notes = victory ? [220, 277.18, 329.63, 440] : [196, 174.61, 146.83];
    notes.forEach((frequency, index) => {
      this._tone({
        frequency,
        endFrequency: frequency * (victory ? 1.005 : 0.82),
        type: index === 0 ? 'triangle' : 'sine',
        duration: 0.5,
        delay: index * 0.115,
        volume: 0.11,
        bus: 'ui',
        reverb: 0.2,
        options: {},
      });
    });
    return true;
  }

  _startAmbience() {
    if (this.ambientStarted || !this.started || !this.context) return;
    this.ambientStarted = true;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = 0.58;
    filter.type = 'bandpass';
    filter.frequency.value = 210;
    filter.Q.value = 0.48;
    gain.gain.value = 0.075;
    source.connect(filter).connect(gain).connect(this.buses.ambience);
    this._track(source, [filter, gain], true);
    source.start(now, 0.37);

    for (const [frequency, level] of [[48, 0.045], [73, 0.027]]) {
      const oscillator = this.context.createOscillator();
      const toneGain = this.context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      toneGain.gain.value = level;
      oscillator.connect(toneGain).connect(this.buses.ambience);
      this._track(oscillator, [toneGain], true);
      oscillator.start(now);
    }
  }

  setListener(transform) {
    if (!transform) return;
    readVector(transform.position ?? transform, this.listenerPosition);
    if (transform.forward) readVector(transform.forward, this.listenerForward);
    else if (transform.quaternion) {
      const quaternion = transform.quaternion;
      tmpQuaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      this.listenerForward.set(0, 0, -1).applyQuaternion(tmpQuaternion);
      this.listenerUp.set(0, 1, 0).applyQuaternion(tmpQuaternion);
    } else if (typeof transform.getWorldDirection === 'function') {
      transform.getWorldDirection(this.listenerForward);
      if (transform.up) this.listenerUp.copy(transform.up);
    }
    if (transform.up) readVector(transform.up, this.listenerUp);
    this._applyListener();
  }

  _applyListener() {
    if (!this.context) return;
    const listener = this.context.listener;
    const now = this.context.currentTime;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(this.listenerPosition.x, now);
      listener.positionY.setValueAtTime(this.listenerPosition.y, now);
      listener.positionZ.setValueAtTime(this.listenerPosition.z, now);
      listener.forwardX.setValueAtTime(this.listenerForward.x, now);
      listener.forwardY.setValueAtTime(this.listenerForward.y, now);
      listener.forwardZ.setValueAtTime(this.listenerForward.z, now);
      listener.upX.setValueAtTime(this.listenerUp.x, now);
      listener.upY.setValueAtTime(this.listenerUp.y, now);
      listener.upZ.setValueAtTime(this.listenerUp.z, now);
    } else {
      listener.setPosition(
        this.listenerPosition.x,
        this.listenerPosition.y,
        this.listenerPosition.z,
      );
      listener.setOrientation(
        this.listenerForward.x,
        this.listenerForward.y,
        this.listenerForward.z,
        this.listenerUp.x,
        this.listenerUp.y,
        this.listenerUp.z,
      );
    }
  }

  setMasterVolume(value) {
    this.options.volume = clamp(value, 0, 1);
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(this.options.volume, this.context.currentTime, 0.035);
  }

  reset() {
    this.pending.length = 0;
    this.lastPlayed.clear();
    this.rng?.reset?.();
    for (const source of [...this.activeSources]) {
      if (this.ambientSources.has(source)) continue;
      try {
        source.stop();
      } catch {
        // Source may already be naturally stopped.
      }
    }
    if (this.started) this.play('ui-select', { volume: 0.25 });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._removeGestureUnlock();
    for (let i = this.unsubscribers.length - 1; i >= 0; i -= 1) {
      this.unsubscribers[i]();
    }
    this.unsubscribers.length = 0;
    this.pending.length = 0;
    for (const source of [...this.activeSources]) {
      try {
        source.stop();
      } catch {
        // Source may already be stopped.
      }
    }
    this.activeSources.clear();
    this.ambientSources.clear();
    this.master?.disconnect();
    this.compressor?.disconnect();
    this.reverb?.disconnect();
    this.reverbGain?.disconnect();
    Object.values(this.buses).forEach((bus) => bus.disconnect());
    this.context?.close?.().catch?.(() => {});
    this.context = null;
    this.events = null;
    this.rng = null;
  }
}

export default AudioSystem;
