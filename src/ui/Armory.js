export const ARMORY_STYLES = `
.cl-armory {
  background:rgba(6,11,15,.87);
}
.cl-armory-shell {
  width:min(1110px, calc(100% - 44px)); margin:24px auto; padding:26px;
  border:1px solid rgba(174,203,211,.28); background:#101b22; color:#e7efeb;
}
.cl-armory-header {
  display:flex; justify-content:space-between; align-items:end; gap:12px; border-bottom:1px solid #33454c;
  padding-bottom:16px;
}
.cl-armory h1 { margin:0; color:#f5f6f2; font-size:clamp(34px,5vw,66px); line-height:.9; letter-spacing:-.055em; }
.cl-armory-location { margin:0 0 8px; color:#9bd7d9; font-size:10px; font-weight:750; }
.cl-armory-credit { color:#e8c38a; font-size:12px; text-align:right; white-space:nowrap; }
.cl-armory-credit strong { display:block; color:#ffdc9e; font-size:32px; letter-spacing:-.03em; }
.cl-armory-groups { display:grid; gap:15px; margin:17px 0; }
.cl-armory-group h2 { margin:0 0 7px; font-size:10px; color:#9fb5bc; letter-spacing:.16em; }
.cl-armory-items { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,156px),1fr)); gap:8px; }
.cl-armory-card { display:flex; flex-direction:column; gap:7px; background:#18262e; border:1px solid #33454c; padding:11px; }
.cl-armory-card[data-equipped="true"] { border-color:#69a8aa; background:#192b32; }
.cl-armory-card strong { font-size:13px; color:#e7f2ec; }
.cl-armory-card p {
  margin:0; color:#bacbd0; font-size:11px; letter-spacing:.025em; text-transform:none; line-height:1.4;
}
.cl-armory-card small { color:#81c4cb; font-size:9px; }
.cl-armory-buy {
  margin-top:auto; min-height:28px; color:#151b1a; background:#deb76d; border:1px solid #deb76d;
  font-size:10px; font-weight:750; letter-spacing:.075em; text-transform:uppercase;
  cursor:pointer;
}
.cl-armory-buy:hover { background:#f6d690; }
.cl-armory-buy:disabled { color:#acc3c5; background:#152128; border-color:#3b5158; cursor:default; }
.cl-armory-footer { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
.cl-armory-footer p { margin:0; color:#9fb5bc; font-size:11px; letter-spacing:.02em; text-transform:none; }
.cl-armory-message { min-height:1.5em; margin-top:9px; color:#e8c38a; font-size:10px; }
@media(max-height:760px) { .cl-armory-shell { margin:12px auto; padding:17px; } }
@media(max-width:600px) { .cl-armory-shell { width:calc(100% - 24px); } }
`;

const GROUPS = [
  ['primary', 'Primary weapons'],
  ['secondary', 'Sidearms and melee'],
  ['supplies', 'Supplies'],
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
        <div class="cl-armory-groups"></div>
        <footer class="cl-armory-footer">
          <p>Earn credits from eliminations, relay restores and operation clears.</p>
          <button class="cl-btn is-primary" data-action="armory-close">Return to field</button>
        </footer>
        <div class="cl-armory-message" role="status"></div>
      </div>
    `;
    this.groups = this.root.querySelector('.cl-armory-groups');
    this.credits = this.root.querySelector('[data-armory-credits]');
    this.location = this.root.querySelector('[data-armory-location]');
    this.message = this.root.querySelector('.cl-armory-message');
    this.continueButton = this.root.querySelector('[data-action="armory-close"]');
    for (const [group, label] of GROUPS) {
      const items = economy.catalog.filter((item) => group === 'supplies'
        ? !item.slot
        : group === 'primary' ? item.slot === 'primary' : item.slot && item.slot !== 'primary');
      if (!items.length) continue;
      const section = element('section', 'cl-armory-group');
      const entries = element('div', 'cl-armory-items');
      section.append(element('h2', '', label), entries);
      for (const item of items) entries.append(this.buildCard(item));
      this.groups.append(section);
    }
    this.click = (event) => {
      const button = event.target.closest('button[data-buy]');
      if (button) events.emit('armory:buy', { id: button.dataset.buy });
    };
    this.root.addEventListener('click', this.click);
    root.append(this.root);
  }

  buildCard(item) {
    const card = element('div', 'cl-armory-card');
    card.dataset.item = item.id;
    const status = element('small');
    const button = element('button', 'cl-armory-buy');
    button.type = 'button';
    button.dataset.buy = item.id;
    card.append(element('strong', '', item.label), element('p', '', item.detail), status, button);
    this.cards.push({ item, card, status, button });
    return card;
  }

  open(location, opening) {
    this.location.textContent = location;
    this.continueButton.textContent = opening ? 'Deploy with loadout' : 'Return to field';
    this.message.textContent = '';
    this.update();
    this.continueButton.focus();
  }

  update(message) {
    if (message !== undefined) this.message.textContent = message;
    const { credits, equipped, owned, supplies } = this.economy.state;
    this.credits.textContent = credits.toLocaleString('en-US');
    for (const { item, card, status, button } of this.cards) {
      const selected = item.slot && equipped[item.slot] === item.id;
      card.dataset.equipped = String(Boolean(selected));
      const quote = this.economy.quote(item.id);
      button.disabled = !quote.allowed;
      button.textContent = quote.label;
      button.setAttribute('aria-label', `${quote.label} ${item.label}`);
      status.textContent = item.kind === 'throwable'
        ? `${supplies[item.id] ?? 0} / ${item.max} carried`
        : selected ? `Equipped · ${item.spec}`
          : owned.includes(item.id) ? `Owned · ${item.spec}` : item.spec ?? 'Supply service';
    }
  }

  dispose() {
    this.root.removeEventListener('click', this.click);
    this.root.remove();
  }
}
