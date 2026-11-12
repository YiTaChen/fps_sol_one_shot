import { ArmoryPreview } from './ArmoryPreview.js';

const images = import.meta.glob('./armory-art/*.webp', { eager: true, query: '?url', import: 'default' });
const thumbnail = (id) => images[`./armory-art/${id}.webp`];

export const ARMORY_STYLES = `
.cl-armory {
  background:rgba(4,9,13,.85);
}
.cl-armory-shell {
  width:min(1220px, calc(100% - 36px)); margin:16px auto; padding:18px 20px;
  border:1px solid #3c535c; background:#101a21; color:#e7efeb; box-shadow:0 12px 55px #0008;
}
.cl-armory-header {
  display:flex; justify-content:space-between; align-items:center; gap:12px;
  border-bottom:1px solid #35464f; padding-bottom:13px;
}
.cl-armory h1 { margin:0; color:#f4f4ec; font-size:clamp(34px,4.6vw,57px); line-height:.91; letter-spacing:-.055em; }
.cl-armory-location { margin:0 0 6px; color:#91c8cd; font-size:10px; font-weight:750; }
.cl-armory-credit { color:#dbc096; font-size:10px; text-align:right; white-space:nowrap; }
.cl-armory-credit strong { display:block; color:#ffdc9e; font-size:33px; line-height:1.08; letter-spacing:-.04em; }
.cl-armory-body {
  display:grid; grid-template-columns:minmax(0,1.55fr) minmax(252px,1fr);
  align-items:start; gap:15px; margin:13px 0;
}
.cl-armory-groups { display:grid; gap:11px; min-width:0; }
.cl-armory-group h2 { margin:0 0 5px; font-size:11px; color:#aac0c7; letter-spacing:.13em; }
.cl-armory-items { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
.cl-armory-group[data-group="supplies"] .cl-armory-items { grid-template-columns:repeat(4,minmax(0,1fr)); }
.cl-armory-card { min-width:0; background:#17252e; border:1px solid #30454e; }
.cl-armory-card[data-inspected="true"] { background:#23363f; border-color:#c69b5f; }
.cl-armory-product {
  display:grid; width:100%; grid-template-rows:70px auto; gap:4px; text-align:left;
  padding:4px 8px 6px; border:0; background:none; color:#eaf1ef;
  font:inherit; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.035em; cursor:pointer;
}
.cl-armory-product img { display:block; width:100%; height:100%; object-fit:contain; pointer-events:none; }
.cl-armory-product:hover { background:#b8e6ee0c; }
.cl-armory-product:focus-visible,.cl-armory-buy:focus-visible,.cl-armory-rotate button:focus-visible {
  outline:2px solid #f8d096; outline-offset:-2px;
}
.cl-armory-card .cl-armory-buy {
  width:100%; min-height:23px; border:0; border-top:1px solid #40535b; text-align:left; padding:4px 8px;
  background:#2b3c44; color:#f0c587;
}
.cl-armory-card .cl-armory-buy:hover { background:#3b515b; }
.cl-armory-card .cl-armory-buy:disabled { background:#192830; color:#9cabb0; border-top-color:#30454e; }
.cl-armory-card[data-equipped="true"] .cl-armory-buy:disabled { color:#a3e3db; }
.cl-armory-buy {
  min-height:30px; color:#171e1f; background:#e0b873; border:1px solid #d4ab65;
  font:inherit; font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; cursor:pointer;
}
.cl-armory-buy:hover { background:#f6d690; }
.cl-armory-buy:disabled { color:#acc3c5; background:#17272f; border-color:#3b5158; cursor:default; }
.cl-armory-inspector { min-width:0; border:1px solid #3a515b; background:#14232b; }
.cl-armory-inspector-head { padding:11px 12px 9px; }
.cl-armory-inspector-head small { color:#a8d3d6; font-size:11px; }
.cl-armory-inspector-head h2 { margin:3px 0 0; font-size:clamp(15px,2.3vw,26px); letter-spacing:-.025em; }
.cl-armory-stage {
  position:relative; overflow:hidden; height:clamp(154px,32vh,250px); width:100%;
  background:radial-gradient(ellipse at 52% 49%, #53616a 0%, #293942 54%, #18262f 100%);
  border-top:1px solid #394f59; border-bottom:1px solid #394f59;
}
.cl-armory-view { position:absolute; inset:0; }
.cl-armory-view canvas { display:block; width:100%; height:100%; touch-action:none; cursor:grab; }
.cl-armory-view canvas:active { cursor:grabbing; }
.cl-armory-view canvas:focus-visible { outline:2px solid #ffdc9e; outline-offset:-2px; }
.cl-armory-fallback {
  position:absolute; inset:5%; width:90%; height:90%; object-fit:contain; pointer-events:none;
}
.cl-armory-rotate {
  position:absolute; right:6px; bottom:6px; display:flex; align-items:center; gap:4px;
}
.cl-armory-rotate button {
  color:#e5eeed; border:1px solid #79929a; background:#18262fe8;
  padding:4px 7px; font:inherit; font-size:10px; cursor:pointer;
}
.cl-armory-rotate button:hover { background:#314b57; }
.cl-armory-rotate span { margin-right:2px; color:#e5eeed; font-size:9px; }
.cl-armory-info { padding:10px 12px; }
.cl-armory-info p { margin:0 0 8px; color:#c1d0d2; font-size:13px; letter-spacing:.018em; text-transform:none; line-height:1.4; }
.cl-armory-facts { display:flex; gap:5px 14px; flex-wrap:wrap; margin:0 0 9px; color:#c9d7d6; font-size:11px; }
.cl-armory-facts div { display:grid; gap:3px; }
.cl-armory-facts dt { color:#90b0b9; }
.cl-armory-facts dd { margin:0; font-weight:800; }
.cl-armory-order { display:grid; gap:4px; }
.cl-armory-state { color:#9adbd4; font-size:11px; }
.cl-armory-loadout {
  display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px; margin:0; padding:8px 11px;
  list-style:none; border-top:1px solid #344b55; font-size:10px;
}
.cl-armory-loadout li { min-width:0; color:#c8d5d7; }
.cl-armory-loadout span { display:block; margin:0 0 3px; color:#92b1ba; }
.cl-armory-footer { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
.cl-armory-footer p { flex:1 1 175px; min-height:1.5em; margin:0; color:#abc1c8; font-size:11px; letter-spacing:.025em; text-transform:none; }
.cl-armory-footer .cl-btn { min-width:0; padding:10px 14px; }
@media(max-height:760px) { .cl-armory-shell { margin:10px auto; padding:12px 15px; } }
@media(max-width:760px) {
  .cl-armory-shell { width:calc(100% - 22px); }
  .cl-armory-body { grid-template-columns:1fr; }
}
@media(max-width:450px) {
  .cl-armory-group[data-group="supplies"] .cl-armory-items { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .cl-armory-product { grid-template-rows:56px auto; }
}
`;

const GROUPS = [
  ['primary', 'Primary weapons'],
  ['secondary', 'Sidearms and melee'],
  ['supplies', 'Supplies'],
];
const LOADOUT = [
  ['primary', '1 · Primary'],
  ['secondary', '2 · Sidearm'],
  ['melee', '3 · Melee'],
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class Armory {
  constructor(root, economy, events) {
    this.economy = economy;
    this.cards = [];
    this.root = element('section', 'cl-screen cl-armory');
    this.root.dataset.screen = 'armory';
    this.root.setAttribute('aria-label', 'Armory');
    this.root.innerHTML = `
      <div class="cl-armory-shell">
        <header class="cl-armory-header">
          <div><p class="cl-armory-location" data-armory-location></p><h1>Armory</h1></div>
          <div class="cl-armory-credit"><strong data-armory-credits>1400</strong>Credits</div>
        </header>
        <div class="cl-armory-body">
          <div class="cl-armory-groups"></div>
          <aside class="cl-armory-inspector" aria-label="Item inspection">
            <div class="cl-armory-inspector-head"><small data-inspect-type></small><h2 data-inspect-name></h2></div>
            <div class="cl-armory-stage">
              <img class="cl-armory-fallback" alt="" draggable="false">
              <div class="cl-armory-view"></div>
              <div class="cl-armory-rotate" hidden>
                <span>Drag to rotate</span>
                <button type="button" data-orbit="left" aria-label="Rotate model left">◀</button>
                <button type="button" data-orbit="reset">Reset view</button>
                <button type="button" data-orbit="right" aria-label="Rotate model right">▶</button>
              </div>
            </div>
            <div class="cl-armory-info">
              <p data-inspect-detail></p>
              <dl class="cl-armory-facts"></dl>
              <div class="cl-armory-order">
                <span class="cl-armory-state" data-inspect-state></span>
                <button type="button" class="cl-armory-buy" data-inspect-buy></button>
              </div>
            </div>
            <ul class="cl-armory-loadout" aria-label="Current loadout"></ul>
          </aside>
        </div>
        <footer class="cl-armory-footer">
          <p class="cl-armory-message" role="status"></p>
          <button class="cl-btn is-primary" data-action="armory-close">Return to field</button>
        </footer>
      </div>
    `;
    const query = (selector) => this.root.querySelector(selector);
    this.groups = query('.cl-armory-groups');
    this.credits = query('[data-armory-credits]');
    this.location = query('[data-armory-location]');
    this.message = query('.cl-armory-message');
    this.continueButton = query('[data-action="armory-close"]');
    this.inspector = query('.cl-armory-inspector');
    this.fallback = query('.cl-armory-fallback');
    this.orbit = query('.cl-armory-rotate');
    this.inspectName = query('[data-inspect-name]');
    this.inspectType = query('[data-inspect-type]');
    this.inspectDetail = query('[data-inspect-detail]');
    this.inspectState = query('[data-inspect-state]');
    this.inspectBuy = query('[data-inspect-buy]');
    this.facts = query('.cl-armory-facts');
    this.preview = new ArmoryPreview(query('.cl-armory-view'), {
      onUnavailable: () => this.setLivePreview(false),
      onAvailable: () => this.setLivePreview(true),
    });
    this.slots = LOADOUT.map(([slot, label]) => {
      const line = element('li');
      const value = element('b');
      line.append(element('span', '', label), value);
      query('.cl-armory-loadout').append(line);
      return { slot, value };
    });

    for (const [group, label] of GROUPS) {
      const items = economy.catalog.filter((item) => group === 'supplies'
        ? !item.slot
        : group === 'primary' ? item.slot === 'primary' : item.slot && item.slot !== 'primary');
      if (!items.length) continue;
      const section = element('section', 'cl-armory-group');
      section.dataset.group = group;
      const entries = element('div', 'cl-armory-items');
      section.append(element('h2', '', label), entries);
      for (const item of items) entries.append(this.buildCard(item));
      this.groups.append(section);
    }
    this.click = (event) => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.inspect) {
        this.select(button.dataset.inspect);
        if (window.matchMedia('(max-width: 760px)').matches) {
          this.inspector.scrollIntoView({ block: 'nearest' });
        }
      } else if (button.dataset.buy) {
        this.select(button.dataset.buy);
        events.emit('armory:buy', { id: button.dataset.buy });
      } else if (button.hasAttribute('data-inspect-buy') && this.selected) {
        events.emit('armory:buy', { id: this.selected.id });
      } else if (button.dataset.orbit === 'reset') {
        this.preview.resetView();
      } else if (button.dataset.orbit) {
        this.preview.rotate(button.dataset.orbit === 'left' ? -Math.PI / 12 : Math.PI / 12);
      }
    };
    this.root.addEventListener('click', this.click);
    root.append(this.root);
  }

  buildCard(item) {
    const card = element('div', 'cl-armory-card');
    card.dataset.item = item.id;
    const product = element('button', 'cl-armory-product');
    product.type = 'button';
    product.dataset.inspect = item.id;
    product.setAttribute('aria-label', `Inspect ${item.label}`);
    product.setAttribute('aria-pressed', 'false');
    const image = element('img');
    image.alt = '';
    image.draggable = false;
    if (thumbnail(item.id)) image.src = thumbnail(item.id);
    product.append(image, element('span', '', item.label));
    const buy = element('button', 'cl-armory-buy');
    buy.type = 'button';
    buy.dataset.buy = item.id;
    card.append(product, buy);
    this.cards.push({ item, card, product, buy });
    return card;
  }

  open(location, opening) {
    this.location.textContent = location;
    this.continueButton.textContent = opening ? 'Deploy with loadout' : 'Return to field';
    this.message.textContent = 'Choose an item to inspect it.';
    this.selected = null;
    this.select(this.economy.state.equipped.primary);
    this.continueButton.focus({ preventScroll: true });
  }

  close() {
    this.preview.hide();
    this.setLivePreview(false);
  }

  select(id) {
    const item = this.economy.items.get(id);
    if (!item || this.selected?.id === id) return;
    this.selected = item;
    this.inspector.dataset.inspected = id;
    this.inspectName.textContent = item.label;
    this.inspectType.textContent = item.category;
    this.inspectDetail.textContent = item.detail;
    this.facts.replaceChildren(...(item.facts ?? []).map(([label, value]) => {
      const pair = element('div');
      pair.append(element('dt', '', label), element('dd', '', value));
      return pair;
    }));
    const src = thumbnail(id);
    if (src) this.fallback.src = src;
    else this.fallback.removeAttribute('src');
    this.setLivePreview(this.preview.show(id));
    this.update();
  }

  setLivePreview(live) {
    this.fallback.hidden = Boolean(live) || !this.fallback.hasAttribute('src');
    this.orbit.hidden = !live;
    this.inspector.dataset.preview = live ? 'model' : 'image';
  }

  update(message) {
    if (message !== undefined) this.message.textContent = message;
    const { credits, equipped, owned, supplies } = this.economy.state;
    this.credits.textContent = credits.toLocaleString('en-US');
    for (const { item, card, product, buy } of this.cards) {
      const inspecting = item.id === this.selected?.id;
      card.dataset.inspected = String(inspecting);
      card.dataset.equipped = String(Boolean(item.slot && equipped[item.slot] === item.id));
      product.setAttribute('aria-pressed', String(inspecting));
      this.updateBuy(buy, item);
    }
    for (const { slot, value } of this.slots) {
      value.textContent = this.economy.items.get(equipped[slot])?.label ?? 'Empty';
    }
    if (this.selected) {
      const { id, slot, kind, max } = this.selected;
      this.inspectState.textContent = kind === 'throwable'
        ? `${supplies[id] ?? 0} / ${max} carried`
        : slot && equipped[slot] === id ? 'Equipped' : owned.includes(id) ? 'Owned' : '';
      this.updateBuy(this.inspectBuy, this.selected);
    }
  }

  updateBuy(button, item) {
    const quote = this.economy.quote(item.id);
    button.disabled = !quote.allowed;
    button.textContent = item.kind === 'throwable' && button.dataset.buy
      ? `${quote.label} · ${this.economy.state.supplies[item.id] ?? 0}/${item.max}`
      : quote.label;
    const selection = button.hasAttribute('data-inspect-buy') ? ' selected item' : '';
    button.setAttribute('aria-label', `${quote.label} ${item.label}${selection}`);
  }

  dispose() {
    this.preview.dispose();
    this.root.removeEventListener('click', this.click);
    this.root.remove();
  }
}
