const UI_STYLE_ID = 'cinderline-ui-styles';

const UI_STYLES = `
:root {
  --cl-ink: #e9eee6;
  --cl-muted: #aab6ad;
  --cl-accent: #d9ad55;
  --cl-alert: #e15645;
  --cl-ok: #73c69a;
  --cl-glass: rgba(10, 15, 15, .78);
  --cl-line: rgba(226, 235, 220, .18);
}
.cl-ui, .cl-ui * { box-sizing: border-box; }
.cl-ui {
  position: fixed; inset: 0; z-index: 40; pointer-events: none;
  color: var(--cl-ink); font-family: "Arial Narrow", "Roboto Condensed", Arial, sans-serif;
  text-transform: uppercase; letter-spacing: .09em; user-select: none;
  overflow: hidden; font-variant-numeric: tabular-nums;
}
.cl-ui::before {
  content:""; position:absolute; inset:0; opacity:.22; pointer-events:none;
  background: radial-gradient(circle at 50% 45%, transparent 35%, rgba(0,0,0,.68) 120%);
}
.cl-screen {
  position:absolute; inset:0; display:none; place-items:center; pointer-events:auto;
  background:
    linear-gradient(100deg, rgba(5,9,9,.94) 0 35%, rgba(6,11,11,.62) 58%, rgba(5,9,9,.2)),
    radial-gradient(circle at 72% 48%, rgba(186,120,42,.11), transparent 45%);
}
.cl-screen.is-visible { display:grid; }
.cl-panel {
  width:min(1120px, calc(100vw - 80px)); min-height:min(640px, calc(100vh - 70px));
  display:grid; grid-template-columns:minmax(360px, 1.15fr) minmax(270px, .65fr);
  gap:64px; align-items:center; position:relative;
}
.cl-panel::before {
  content:""; position:absolute; left:-18px; top:4%; width:2px; height:92%;
  background:linear-gradient(transparent, var(--cl-accent) 12% 88%, transparent);
  box-shadow:0 0 18px rgba(217,173,85,.45);
}
.cl-kicker { color:var(--cl-accent); font-size:12px; font-weight:800; letter-spacing:.28em; margin-bottom:18px; }
.cl-title {
  margin:0; font-size:clamp(54px,8vw,108px); line-height:.78; letter-spacing:-.045em;
  font-weight:900; text-shadow:0 12px 35px rgba(0,0,0,.58);
}
.cl-title small {
  display:block; margin-top:22px; font-size:.2em; line-height:1; letter-spacing:.42em;
  color:var(--cl-accent); transform:translateX(.12em);
}
.cl-mission {
  max-width:590px; margin:34px 0 30px; padding-left:16px; border-left:1px solid var(--cl-line);
  color:var(--cl-muted); font-size:13px; line-height:1.8; letter-spacing:.1em; text-transform:none;
}
.cl-record {
  display:inline-flex; margin:-14px 0 28px; padding:7px 10px;
  color:var(--cl-accent); border:1px solid rgba(217,173,85,.26);
  background:rgba(217,173,85,.07); font-size:9px; font-weight:800; letter-spacing:.2em;
}
.cl-record[hidden] { display:none; }
.cl-button-row { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
.cl-btn {
  min-width:190px; border:1px solid rgba(231,239,227,.28); padding:14px 22px;
  color:var(--cl-ink); background:rgba(224,235,221,.055); cursor:pointer;
  font:800 12px/1 Arial, sans-serif; letter-spacing:.17em; text-transform:uppercase;
  transition:background .15s,border .15s,transform .15s,color .15s;
}
.cl-btn:hover,.cl-btn:focus-visible {
  outline:none; border-color:var(--cl-accent); color:#fff;
  background:rgba(217,173,85,.15); transform:translateY(-1px);
}
.cl-btn.is-primary { color:#101513; border-color:var(--cl-accent); background:var(--cl-accent); }
.cl-btn.is-primary:hover { background:#edc570; }
.cl-controls {
  align-self:center; padding:24px 24px 20px; background:rgba(10,15,15,.38);
  border:1px solid var(--cl-line); backdrop-filter:blur(10px);
}
.cl-controls h2 { margin:0 0 20px; color:var(--cl-muted); font-size:11px; letter-spacing:.24em; }
.cl-control { display:grid; grid-template-columns:116px 1fr; gap:16px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.055); }
.cl-control:last-child { border:0; }
.cl-control kbd {
  color:var(--cl-accent); font:800 11px/1.4 Arial,sans-serif; letter-spacing:.12em;
  background:none; white-space:nowrap;
}
.cl-control span { color:#c3ccc4; font-size:10px; line-height:1.45; letter-spacing:.12em; }
.cl-quality { display:flex; gap:6px; margin-top:18px; }
.cl-quality button {
  flex:1; border:1px solid var(--cl-line); padding:9px 4px; color:var(--cl-muted);
  background:rgba(255,255,255,.025); cursor:pointer; font:700 9px Arial,sans-serif;
  letter-spacing:.12em; text-transform:uppercase;
}
.cl-quality button:hover,.cl-quality button.is-active { color:#111; background:var(--cl-accent); border-color:var(--cl-accent); }
.cl-status-title { font-size:clamp(58px,9vw,128px); }
.cl-status-data { display:flex; gap:34px; margin:38px 0 32px; }
.cl-stat { min-width:100px; border-top:1px solid var(--cl-line); padding-top:9px; }
.cl-stat strong { display:block; color:var(--cl-accent); font-size:28px; letter-spacing:-.02em; }
.cl-stat span { color:var(--cl-muted); font-size:9px; letter-spacing:.18em; }
.cl-hud { position:absolute; inset:0; opacity:1; transition:opacity .16s; }
.cl-hud.is-hidden { opacity:0; }
.cl-topbar { position:absolute; top:21px; left:50%; transform:translateX(-50%); width:min(620px,58vw); text-align:center; }
.cl-compass {
  display:inline-flex; align-items:center; gap:10px; min-width:300px; justify-content:center;
  color:#e8eee8; font-size:10px; font-weight:800; text-shadow:0 2px 4px #000;
}
.cl-compass::before,.cl-compass::after { content:""; height:1px; width:104px; background:linear-gradient(90deg,transparent,var(--cl-line)); }
.cl-compass::after { transform:scaleX(-1); }
.cl-heading { min-width:42px; color:var(--cl-accent); }
.cl-objective {
  display:inline-flex; align-items:center; gap:11px; margin-top:9px; padding:6px 12px;
  color:var(--cl-muted); font-size:9px; background:rgba(3,8,8,.44); border:1px solid rgba(255,255,255,.08);
}
.cl-objective .cl-operation {
  padding-right:11px; border-right:1px solid rgba(255,255,255,.12);
}
.cl-objective b { color:var(--cl-ink); font-size:11px; }
.cl-objective i { width:5px; height:5px; background:var(--cl-accent); transform:rotate(45deg); box-shadow:0 0 8px var(--cl-accent); }
.cl-bottom-left { position:absolute; left:32px; bottom:27px; display:flex; align-items:flex-end; gap:18px; }
.cl-health-mark {
  width:62px; height:62px; display:grid; place-items:center; position:relative;
  background:conic-gradient(var(--health-color,var(--cl-ok)) var(--health-angle), rgba(220,230,220,.09) 0);
  clip-path:polygon(50% 0,100% 22%,100% 78%,50% 100%,0 78%,0 22%);
}
.cl-health-mark::after {
  content:""; position:absolute; inset:4px; background:rgba(9,14,13,.82);
  clip-path:inherit;
}
.cl-health-value { z-index:1; font:900 24px/1 Arial,sans-serif; letter-spacing:-.06em; }
.cl-health-label { margin-bottom:7px; }
.cl-health-label span { display:block; color:var(--cl-muted); font-size:9px; }
.cl-health-label b { display:block; margin-top:4px; font-size:10px; letter-spacing:.16em; }
.cl-bottom-right { position:absolute; right:32px; bottom:28px; text-align:right; }
.cl-weapon-name { color:var(--cl-muted); font-size:9px; margin-bottom:3px; }
.cl-ammo { display:flex; justify-content:flex-end; align-items:baseline; gap:9px; text-shadow:0 2px 8px #000; }
.cl-ammo-current { font:900 48px/.85 Arial,sans-serif; letter-spacing:-.07em; }
.cl-ammo-divider { color:var(--cl-line); font-size:22px; }
.cl-ammo-reserve { color:var(--cl-muted); font:700 18px Arial,sans-serif; }
.cl-reload { min-height:12px; margin-top:8px; color:var(--cl-accent); font-size:9px; letter-spacing:.2em; }
.cl-crosshair {
  --spread:8px; position:absolute; left:50%; top:50%; width:0; height:0;
  filter:drop-shadow(0 1px 2px rgba(0,0,0,.85)); transition:opacity .08s;
}
.cl-crosshair.is-ads { opacity:.28; }
.cl-crosshair-piece { position:absolute; background:#f2f5eb; opacity:.92; }
.cl-crosshair-piece.h { width:8px; height:1px; top:0; }
.cl-crosshair-piece.v { width:1px; height:8px; left:0; }
.cl-crosshair-piece.l { right:var(--spread); }
.cl-crosshair-piece.r { left:var(--spread); }
.cl-crosshair-piece.t { bottom:var(--spread); }
.cl-crosshair-piece.b { top:var(--spread); }
.cl-crosshair-dot { position:absolute; width:2px; height:2px; left:-1px; top:-1px; background:var(--cl-accent); }
.cl-hitmarker { position:absolute; left:50%; top:50%; opacity:0; transform:scale(.75); transition:opacity .12s,transform .12s; }
.cl-hitmarker.is-visible { opacity:1; transform:scale(1); }
.cl-hitmarker.is-kill { filter:drop-shadow(0 0 6px var(--cl-alert)); }
.cl-hitmarker i { position:absolute; width:9px; height:2px; background:#fff; }
.cl-hitmarker i:nth-child(1){ transform:translate(-13px,-10px) rotate(45deg); }
.cl-hitmarker i:nth-child(2){ transform:translate(4px,-10px) rotate(-45deg); }
.cl-hitmarker i:nth-child(3){ transform:translate(-13px,7px) rotate(-45deg); }
.cl-hitmarker i:nth-child(4){ transform:translate(4px,7px) rotate(45deg); }
.cl-hitmarker.is-headshot i { background:var(--cl-accent); }
.cl-damage-ring { position:absolute; left:50%; top:50%; width:min(42vw,460px); aspect-ratio:1; transform:translate(-50%,-50%); }
.cl-damage {
  position:absolute; left:50%; top:50%; width:58px; height:132px; transform-origin:50% 0;
  opacity:0; background:linear-gradient(to bottom,rgba(225,70,53,.72),transparent 75%);
  clip-path:polygon(38% 0,62% 0,100% 100%,0 100%); filter:blur(2px);
}
.cl-damage-vignette {
  position:absolute; inset:0; opacity:0; background:radial-gradient(circle,transparent 35%,rgba(135,12,7,.64) 100%);
  mix-blend-mode:screen;
}
.cl-announcement {
  position:absolute; left:50%; top:28%; transform:translate(-50%,-8px); opacity:0;
  min-width:320px; padding:11px 22px; text-align:center; font-size:11px; font-weight:900;
  border-top:1px solid transparent; border-bottom:1px solid transparent;
  transition:opacity .18s,transform .18s;
}
.cl-announcement.is-visible { opacity:1; transform:translate(-50%,0); border-color:var(--cl-line); background:rgba(4,9,9,.42); }
.cl-announcement[data-tone="warning"] { color:var(--cl-accent); }
.cl-announcement[data-tone="danger"] { color:#ff8b78; }
.cl-announcement[data-tone="success"] { color:var(--cl-ok); }
.cl-killfeed { position:absolute; top:104px; right:30px; width:min(330px,35vw); text-align:right; }
.cl-kill-entry {
  margin-bottom:7px; color:var(--cl-ink); font-size:10px; font-weight:800;
  animation:cl-kill-in 3s forwards; text-shadow:0 2px 5px #000;
}
.cl-kill-entry b { color:var(--cl-accent); margin-left:8px; }
@keyframes cl-kill-in { 0%{opacity:0;transform:translateX(8px)} 9%,77%{opacity:1;transform:none} 100%{opacity:0} }
.cl-pause-tip { position:absolute; left:50%; bottom:16px; transform:translateX(-50%); color:rgba(230,235,227,.45); font-size:8px; }
@media (max-width: 760px) {
  .cl-panel { width:calc(100vw - 44px); grid-template-columns:1fr; gap:28px; align-content:center; }
  .cl-controls { display:none; } .cl-bottom-left{left:18px}.cl-bottom-right{right:18px}
}
`;

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

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function positiveSafeInteger(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) return fallback;
  return Math.min(numeric, 100_000);
}

function getEventDirection(event) {
  const direction = event?.direction ?? event?.sourceDirection;
  if (Number.isFinite(direction)) return { relativeAngle: direction };
  if (!direction) return null;
  if (Array.isArray(direction)) return { x: Number(direction[0]), z: Number(direction[2]) };
  if (Number.isFinite(direction.x) && Number.isFinite(direction.z)) return direction;
  return null;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class UI {
  constructor(options = {}) {
    this.options = options;
    this.context = null;
    this.events = null;
    this.root = null;
    this.style = null;
    this.nodes = {};
    this.unsubscribers = [];
    this.domListeners = [];
    this.screen = 'start';
    this.quality = options.quality ?? 'medium';
    this.hitmarkerUntil = 0;
    this.announcementUntil = 0;
    this.crosshairKick = 0;
    this.damageFlash = 0;
    this.damageArcs = [];
    this.time = 0;
    this.last = Object.create(null);
    this.disposed = false;
  }

  init(context) {
    if (this.root) return this;
    this.context = context;
    this.events = context.events;
    this.quality = context.quality?.name ?? context.quality?.preset ?? this.quality;
    this._installStyles();
    this._build();
    this._bindEvents();
    this.setScreen('start', context.state);
    return this;
  }

  _installStyles() {
    const existing = document.getElementById(UI_STYLE_ID);
    if (existing) {
      this.style = existing;
      return;
    }
    this.style = document.createElement('style');
    this.style.id = UI_STYLE_ID;
    this.style.textContent = UI_STYLES;
    document.head.appendChild(this.style);
    this.style.dataset.owner = 'cinderline-ui';
  }

  _build() {
    this.root = element('div', 'cl-ui');
    this.root.id = 'cinderline-ui';
    this.root.innerHTML = `
      <section class="cl-screen cl-start" data-screen="start" aria-label="Start screen">
        <div class="cl-panel">
          <div>
            <div class="cl-kicker" data-start-operation>OPERATION 1 · ASH MARKET</div>
            <h1 class="cl-title">CINDER<br>LINE<small>ONE SHOT</small></h1>
            <p class="cl-mission">Sweep the Ash Market industrial quarter. Break contact when needed, use cover, and neutralize every hostile in the district.</p>
            <div class="cl-record" data-highest-cleared hidden></div>
            <div class="cl-button-row">
              <button class="cl-btn is-primary" data-action="start">Deploy</button>
            </div>
          </div>
          <div class="cl-controls">
            <h2>Field controls</h2>
            <div class="cl-control"><kbd>W A S D</kbd><span>Move through the district</span></div>
            <div class="cl-control"><kbd>Mouse · LMB</kbd><span>Aim · fire</span></div>
            <div class="cl-control"><kbd>RMB · R</kbd><span>Aim down sight · reload</span></div>
            <div class="cl-control"><kbd>Shift · Ctrl / C</kbd><span>Sprint · crouch / slide</span></div>
            <div class="cl-control"><kbd>Space</kbd><span>Jump / mantle</span></div>
            <div class="cl-control"><kbd>Q · E</kbd><span>Lean left · right</span></div>
            <div class="cl-control"><kbd>Esc</kbd><span>Pause / release pointer lock</span></div>
            <h2 style="margin-top:22px">Render profile</h2>
            <div class="cl-quality" role="group" aria-label="Graphics quality">
              <button data-quality="low">Low</button>
              <button data-quality="medium">Medium</button>
              <button data-quality="high">High</button>
            </div>
          </div>
        </div>
      </section>
      <section class="cl-screen cl-pause" data-screen="pause" aria-label="Pause screen">
        <div class="cl-panel">
          <div>
            <div class="cl-kicker">TACTICAL HOLD</div>
            <h1 class="cl-title cl-status-title">PAUSED</h1>
            <p class="cl-mission">Simulation suspended. Input has been cleared and weapon controls are safe.</p>
            <div class="cl-button-row">
              <button class="cl-btn is-primary" data-action="resume">Resume</button>
              <button class="cl-btn" data-action="restart">Restart operation</button>
            </div>
          </div>
          <div class="cl-controls">
            <h2>Render profile</h2>
            <div class="cl-quality" role="group" aria-label="Graphics quality">
              <button data-quality="low">Low</button>
              <button data-quality="medium">Medium</button>
              <button data-quality="high">High</button>
            </div>
          </div>
        </div>
      </section>
      <section class="cl-screen cl-result" data-screen="victory" aria-label="Victory screen">
        <div class="cl-panel">
          <div>
            <div class="cl-kicker" data-victory-operation>OPERATION 1 · DISTRICT SECURE</div>
            <h1 class="cl-title cl-status-title">CLEAR</h1>
            <div class="cl-status-data">
              <div class="cl-stat"><strong data-result-kills>0</strong><span>Hostiles</span></div>
              <div class="cl-stat"><strong data-result-time>00:00</strong><span>Elapsed</span></div>
            </div>
            <div class="cl-button-row">
              <button class="cl-btn is-primary" data-action="next-level">Next operation</button>
              <button class="cl-btn" data-action="restart">Restart current</button>
            </div>
          </div>
        </div>
      </section>
      <section class="cl-screen cl-result" data-screen="defeat" aria-label="Defeat screen">
        <div class="cl-panel">
          <div>
            <div class="cl-kicker">SIGNAL LOST</div>
            <h1 class="cl-title cl-status-title">DOWN</h1>
            <div class="cl-status-data">
              <div class="cl-stat"><strong data-result-kills>0</strong><span>Neutralized</span></div>
              <div class="cl-stat"><strong data-result-time>00:00</strong><span>Elapsed</span></div>
            </div>
            <button class="cl-btn is-primary" data-action="restart">Redeploy</button>
          </div>
        </div>
      </section>
      <div class="cl-hud is-hidden" aria-label="Heads up display">
        <div class="cl-topbar">
          <div class="cl-compass"><span data-cardinal>N</span><span class="cl-heading" data-heading>000</span></div>
          <div class="cl-objective"><span class="cl-operation">Operation <b data-level>1</b></span><i></i><span>Neutralize hostiles</span><b><span data-kills>0</span> / <span data-required>7</span></b></div>
        </div>
        <div class="cl-bottom-left">
          <div class="cl-health-mark" style="--health-angle:360deg"><span class="cl-health-value" data-health>100</span></div>
          <div class="cl-health-label"><span>Condition</span><b data-condition>Operational</b></div>
        </div>
        <div class="cl-bottom-right">
          <div class="cl-weapon-name" data-weapon-name>CR-27 Vesper</div>
          <div class="cl-ammo"><span class="cl-ammo-current" data-magazine>30</span><span class="cl-ammo-divider">/</span><span class="cl-ammo-reserve" data-reserve>120</span></div>
          <div class="cl-reload" data-reload></div>
        </div>
        <div class="cl-crosshair">
          <i class="cl-crosshair-piece h l"></i><i class="cl-crosshair-piece h r"></i>
          <i class="cl-crosshair-piece v t"></i><i class="cl-crosshair-piece v b"></i>
          <i class="cl-crosshair-dot"></i>
        </div>
        <div class="cl-hitmarker"><i></i><i></i><i></i><i></i></div>
        <div class="cl-damage-ring"></div>
        <div class="cl-damage-vignette"></div>
        <div class="cl-announcement" data-tone="neutral"></div>
        <div class="cl-killfeed"></div>
        <div class="cl-pause-tip">Esc · pause</div>
      </div>
    `;
    (this.options.container ?? document.body).appendChild(this.root);

    const query = (selector) => this.root.querySelector(selector);
    this.nodes.hud = query('.cl-hud');
    this.nodes.crosshair = query('.cl-crosshair');
    this.nodes.hitmarker = query('.cl-hitmarker');
    this.nodes.damageRing = query('.cl-damage-ring');
    this.nodes.damageVignette = query('.cl-damage-vignette');
    this.nodes.announcement = query('.cl-announcement');
    this.nodes.killfeed = query('.cl-killfeed');
    this.nodes.healthMark = query('.cl-health-mark');
    this.nodes.health = query('[data-health]');
    this.nodes.condition = query('[data-condition]');
    this.nodes.magazine = query('[data-magazine]');
    this.nodes.reserve = query('[data-reserve]');
    this.nodes.weaponName = query('[data-weapon-name]');
    this.nodes.reload = query('[data-reload]');
    this.nodes.kills = query('[data-kills]');
    this.nodes.required = query('[data-required]');
    this.nodes.level = query('[data-level]');
    this.nodes.startOperation = query('[data-start-operation]');
    this.nodes.highestCleared = query('[data-highest-cleared]');
    this.nodes.victoryOperation = query('[data-victory-operation]');
    this.nodes.heading = query('[data-heading]');
    this.nodes.cardinal = query('[data-cardinal]');

    this.root.querySelectorAll('[data-action]').forEach((button) => {
      const handler = () => this._action(button.dataset.action);
      button.addEventListener('click', handler);
      this.domListeners.push(() => button.removeEventListener('click', handler));
    });
    this.root.querySelectorAll('[data-quality]').forEach((button) => {
      const handler = () => this._setQuality(button.dataset.quality, true);
      button.addEventListener('click', handler);
      this.domListeners.push(() => button.removeEventListener('click', handler));
    });
    this._setQuality(this.quality, false);
  }

  _bindEvents() {
    this.unsubscribers.push(
      subscribe(this.events, 'game:start', () => this.setScreen('playing')),
      subscribe(this.events, 'game:pause', () => this.setScreen('pause')),
      subscribe(this.events, 'game:resume', () => this.setScreen('playing')),
      subscribe(this.events, 'game:restart', () => this.reset()),
      subscribe(this.events, 'game:next-level', () => {
        this.reset('NEXT OPERATION DEPLOYED');
      }),
      subscribe(this.events, 'game:victory', (data) => this.setScreen('victory', data)),
      subscribe(this.events, 'game:defeat', (data) => this.setScreen('defeat', data)),
      subscribe(this.events, 'quality:change', (data) => {
        const value = typeof data === 'string' ? data : data?.preset ?? data?.name;
        if (value) this._setQuality(value, false);
      }),
      subscribe(this.events, 'player:damage', (data) => this._showDamage(data)),
      subscribe(this.events, 'weapon:fire', (data) => {
        if (data?.kind !== 'enemy' && !String(data?.source ?? '').startsWith('enemy:')) {
          this.crosshairKick = Math.min(14, this.crosshairKick + 4.5);
        }
      }),
      subscribe(this.events, 'weapon:reload-start', () => {
        this.nodes.reload.textContent = 'Reloading';
      }),
      subscribe(this.events, 'weapon:reload-phase', (data) => {
        const phase = String(data?.phase ?? '').replaceAll('-', ' ');
        this.nodes.reload.textContent = phase || 'Reloading';
      }),
      subscribe(this.events, 'weapon:reload-complete', () => {
        this.nodes.reload.textContent = '';
      }),
      subscribe(this.events, 'combat:hitmarker', (data) => this._showHitmarker(data)),
      subscribe(this.events, 'combat:kill', (data) => this._showKill(data)),
      subscribe(this.events, 'ui:announce', (data) => {
        this.announce(data?.text ?? data, data?.tone, data?.duration);
      }),
    );
  }

  _action(action) {
    if (action === 'start') {
      emit(this.events, 'game:start', { source: 'ui' });
      emit(this.events, 'audio:play', { name: 'ui-confirm' });
    } else if (action === 'resume') {
      emit(this.events, 'game:resume', { source: 'ui' });
      emit(this.events, 'audio:play', { name: 'ui-confirm' });
    } else if (action === 'restart') {
      emit(this.events, 'game:restart', { source: 'ui' });
      emit(this.events, 'audio:play', { name: 'ui-confirm' });
    } else if (action === 'next-level') {
      emit(this.events, 'game:next-level', { source: 'ui' });
      emit(this.events, 'audio:play', { name: 'ui-confirm' });
    }
  }

  _setQuality(value, shouldEmit) {
    const quality = ['low', 'medium', 'high'].includes(value) ? value : 'medium';
    this.quality = quality;
    this.root?.querySelectorAll('[data-quality]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.quality === quality);
      button.setAttribute('aria-pressed', String(button.dataset.quality === quality));
    });
    if (shouldEmit) {
      emit(this.events, 'quality:change', { preset: quality, name: quality, source: 'ui' });
      emit(this.events, 'audio:play', { name: 'ui-select', volume: 0.38 });
    }
  }

  setScreen(name, data = {}) {
    const canonical = name === 'play' || name === 'game' ? 'playing' : name;
    this._updateProgression(data);
    this.screen = canonical;
    this.root.querySelectorAll('[data-screen]').forEach((screen) => {
      screen.classList.toggle('is-visible', screen.dataset.screen === canonical);
    });
    this.nodes.hud.classList.toggle('is-hidden', canonical !== 'playing');
    if (canonical === 'victory' || canonical === 'defeat') {
      const screen = this.root.querySelector(`[data-screen="${canonical}"]`);
      const kills = Number(data?.kills ?? this.last.kills ?? 0);
      const elapsed = Number(data?.elapsed ?? this.last.elapsed ?? 0);
      screen.querySelector('[data-result-kills]').textContent = String(kills);
      screen.querySelector('[data-result-time]').textContent = this._formatTime(elapsed);
    }
    if (data?.requiredKills !== undefined) {
      this.nodes.required.textContent = String(data.requiredKills);
    }
  }

  _updateProgression(data = {}) {
    const state = data?.state ?? data?.game ?? data;
    const contextState = this.context?.state ?? {};
    const level = positiveSafeInteger(state?.level ?? contextState.level, 1);
    const highest = positiveSafeInteger(
      state?.highestClearedLevel ?? contextState.highestClearedLevel,
      0,
    );
    this._text('level', level);
    this.nodes.startOperation.textContent = `OPERATION ${level} · ASH MARKET`;
    this.nodes.victoryOperation.textContent =
      `OPERATION ${level} · DISTRICT SECURE`;
    this.nodes.highestCleared.hidden = highest <= 0;
    this.nodes.highestCleared.textContent =
      highest > 0 ? `HIGHEST CLEARED · OPERATION ${highest}` : '';
  }

  render(snapshot = {}) {
    this.time += Number(snapshot.dt ?? 1 / 60);
    const player = snapshot.player ?? snapshot.playerSnapshot ?? snapshot;
    const weapon = snapshot.weapon ?? snapshot.weaponSnapshot ?? {};
    const state = snapshot.state ?? snapshot.game ?? snapshot;
    const health = clamp(player.health ?? state.health ?? 100, 0, 100);
    const magazine = Math.max(0, Number(weapon.magazine ?? weapon.ammo ?? state.magazine ?? 0));
    const reserve = Math.max(0, Number(weapon.reserve ?? weapon.reserveAmmo ?? state.reserve ?? 0));
    const kills = Math.max(0, Number(state.kills ?? snapshot.kills ?? 0));
    const required = Math.max(1, Number(state.requiredKills ?? snapshot.requiredKills ?? 7));
    const level = positiveSafeInteger(state.level ?? snapshot.level, 1);
    const elapsed = Number(state.elapsed ?? snapshot.elapsed ?? 0);
    const yaw = Number(player.yaw ?? snapshot.yaw ?? this.context?.camera?.rotation?.y ?? 0);
    const ads = Boolean(weapon.ads ?? weapon.isADS ?? player.ads);
    const speed = Number(player.speed ?? player.velocity?.length?.() ?? 0);
    const baseSpread = Number(weapon.spread ?? weapon.crosshairSpread ?? (ads ? 1.5 : 7 + speed * 0.7));
    this.crosshairKick = Math.max(0, this.crosshairKick - 22 * (snapshot.dt ?? 1 / 60));
    const spread = clamp(baseSpread + this.crosshairKick, 1, 24);

    this._text('health', Math.ceil(health));
    this._text('magazine', Math.floor(magazine).toString().padStart(2, '0'));
    this._text('reserve', Math.floor(reserve).toString().padStart(3, '0'));
    this._text('kills', kills);
    this._text('required', required);
    this._text('level', level);
    this._updateProgression(state);
    if (weapon.name) this._text('weaponName', weapon.name);
    this.last.kills = kills;
    this.last.elapsed = elapsed;
    this.nodes.healthMark.style.setProperty('--health-angle', `${health * 3.6}deg`);
    this.nodes.healthMark.style.setProperty(
      '--health-color',
      health <= 30 ? 'var(--cl-alert)' : 'var(--cl-ok)',
    );
    this.nodes.condition.textContent = health > 65 ? 'Operational' : health > 30 ? 'Wounded' : 'Critical';
    this.nodes.condition.style.color = health <= 30 ? 'var(--cl-alert)' : '';
    this.nodes.crosshair.style.setProperty('--spread', `${spread.toFixed(1)}px`);
    this.nodes.crosshair.classList.toggle('is-ads', ads);

    let degrees = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
    if (Math.abs(degrees - 360) < 0.5) degrees = 0;
    this.nodes.heading.textContent = String(Math.round(degrees)).padStart(3, '0');
    this.nodes.cardinal.textContent = CARDINALS[Math.round(degrees / 45) % 8];

    const now = performance.now();
    if (now > this.hitmarkerUntil) {
      this.nodes.hitmarker.classList.remove('is-visible', 'is-kill', 'is-headshot');
    }
    if (now > this.announcementUntil) {
      this.nodes.announcement.classList.remove('is-visible');
    }
    this.damageFlash = Math.max(0, this.damageFlash - (snapshot.dt ?? 1 / 60) * 1.7);
    this.nodes.damageVignette.style.opacity = String(this.damageFlash * 0.58);
    for (let i = this.damageArcs.length - 1; i >= 0; i -= 1) {
      const arc = this.damageArcs[i];
      arc.life -= snapshot.dt ?? 1 / 60;
      arc.node.style.opacity = String(clamp(arc.life / 0.72, 0, 1));
      if (arc.life <= 0) {
        arc.node.remove();
        this.damageArcs.splice(i, 1);
      }
    }
  }

  _text(name, value) {
    const stringValue = String(value);
    if (this.last[name] === stringValue) return;
    this.last[name] = stringValue;
    this.nodes[name].textContent = stringValue;
  }

  _showDamage(data) {
    const amount = clamp(data?.amount ?? data?.damage ?? 12, 0, 100);
    this.damageFlash = Math.min(1, this.damageFlash + 0.22 + amount / 100);
    const direction = getEventDirection(data);
    const yaw = Number(
      this.context?.state?.player?.yaw ??
      this.context?.state?.playerSnapshot?.yaw ??
      this.context?.camera?.rotation?.y ??
      0,
    );
    const worldAngle = direction && direction.relativeAngle === undefined
      ? Math.atan2(direction.x, direction.z)
      : yaw;
    const relative = direction?.relativeAngle !== undefined
      ? direction.relativeAngle * 180 / Math.PI
      : (worldAngle - yaw) * 180 / Math.PI;
    const arc = element('i', 'cl-damage');
    arc.style.transform = `translate(-50%,-50%) rotate(${relative.toFixed(1)}deg) translateY(-188px)`;
    this.nodes.damageRing.appendChild(arc);
    this.damageArcs.push({ node: arc, life: 0.76 });
    while (this.damageArcs.length > 4) {
      this.damageArcs.shift().node.remove();
    }
  }

  _showHitmarker(data = {}) {
    this.hitmarkerUntil = performance.now() + (data.lethal ? 270 : 150);
    this.nodes.hitmarker.classList.add('is-visible');
    this.nodes.hitmarker.classList.toggle('is-kill', Boolean(data.lethal));
    this.nodes.hitmarker.classList.toggle('is-headshot', Boolean(data.headshot));
  }

  _showKill(data = {}) {
    this._showHitmarker({ ...data, lethal: true });
    const entry = element('div', 'cl-kill-entry');
    const label = data.headshot ? 'Precision neutralization' : 'Hostile neutralized';
    entry.textContent = label;
    const suffix = element('b', '', data.headshot ? '+150' : '+100');
    entry.appendChild(suffix);
    this.nodes.killfeed.prepend(entry);
    while (this.nodes.killfeed.children.length > 4) {
      this.nodes.killfeed.lastElementChild.remove();
    }
    const remove = () => entry.remove();
    entry.addEventListener('animationend', remove, { once: true });
  }

  announce(text, tone = 'neutral', duration = 2) {
    if (!text) return;
    this.nodes.announcement.textContent = String(text);
    this.nodes.announcement.dataset.tone = tone ?? 'neutral';
    this.nodes.announcement.classList.add('is-visible');
    this.announcementUntil = performance.now() + clamp(duration, 0.5, 8) * 1000;
  }

  reset(announcement = 'OPERATION RESTARTED') {
    this.hitmarkerUntil = 0;
    this.announcementUntil = 0;
    this.crosshairKick = 0;
    this.damageFlash = 0;
    this.damageArcs.splice(0).forEach((arc) => arc.node.remove());
    this.nodes.killfeed.replaceChildren();
    this.nodes.reload.textContent = '';
    this.nodes.hitmarker.classList.remove('is-visible', 'is-kill', 'is-headshot');
    this.nodes.damageVignette.style.opacity = '0';
    this.last = Object.create(null);
    this.setScreen('playing', this.context?.state);
    this.announce(announcement, 'neutral', 1.4);
  }

  _formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const remainder = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = this.unsubscribers.length - 1; i >= 0; i -= 1) {
      this.unsubscribers[i]();
    }
    for (let i = this.domListeners.length - 1; i >= 0; i -= 1) {
      this.domListeners[i]();
    }
    this.unsubscribers.length = 0;
    this.domListeners.length = 0;
    this.damageArcs.splice(0).forEach((arc) => arc.node.remove());
    this.root?.remove();
    if (this.style?.dataset.owner === 'cinderline-ui') this.style.remove();
    this.root = null;
    this.context = null;
    this.events = null;
  }
}

export default UI;
