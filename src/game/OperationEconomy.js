export const OPENING_CREDITS = 1400;
export const CREDIT_REWARDS = Object.freeze({ elimination: 125, relay: 250, victory: 400 });
export const THROWABLE_LIMIT = 4;
const MAX_CREDITS = 9900;

function copyLoadout(state) {
  return {
    credits: state.credits,
    owned: [...state.owned],
    equipped: { ...state.equipped },
    supplies: { ...state.supplies },
  };
}

/** Round inventory. A retry restores the opening loadout and discards rewards earned in the failed attempt. */
export class OperationEconomy {
  constructor(catalog, defaults, canUseService = () => false) {
    this.catalog = catalog;
    this.items = new Map(catalog.map((item) => [item.id, item]));
    this.defaults = defaults;
    this.canUseService = canUseService;
    this.state = {};
    this.resetCampaign();
  }

  resetCampaign() {
    this.checkpoint = {
      credits: OPENING_CREDITS,
      owned: Object.values(this.defaults),
      equipped: { ...this.defaults },
      supplies: {},
    };
    this.retry();
  }

  saveCheckpoint() {
    this.checkpoint = copyLoadout(this.state);
  }

  retry() {
    Object.assign(this.state, copyLoadout(this.checkpoint), { earned: 0, spent: 0 });
  }

  reward(amount) {
    const applied = Math.min(amount, MAX_CREDITS - this.state.credits);
    this.state.credits += applied;
    this.state.earned += applied;
    return applied;
  }

  quote(id) {
    const item = this.items.get(id);
    if (!item) return { allowed: false, label: 'Unavailable' };
    const { credits, equipped, owned, supplies } = this.state;
    if (item.slot && equipped[item.slot] === id) return { allowed: false, label: 'Equipped' };
    if (item.slot && owned.includes(id)) return { allowed: true, label: 'Equip' };
    if (item.kind === 'service' && !this.canUseService(id)) return { allowed: false, label: 'Reserve full' };
    if (item.kind === 'throwable') {
      if ((supplies[id] ?? 0) >= item.max) return { allowed: false, label: 'At item limit' };
      const total = Object.values(supplies).reduce((sum, count) => sum + count, 0);
      if (total >= THROWABLE_LIMIT) return { allowed: false, label: 'Pouches full' };
    }
    return credits >= item.price
      ? { allowed: true, label: item.price === 0 ? 'Equip' : `Buy · ${item.price}` }
      : { allowed: false, label: `Need ${item.price}` };
  }

  buy(id) {
    if (!this.quote(id).allowed) return false;
    const item = this.items.get(id);
    const { owned, equipped, supplies } = this.state;
    const cost = item.slot && owned.includes(id) ? 0 : item.price;
    this.state.credits -= cost;
    this.state.spent += cost;
    if (item.slot) {
      if (!owned.includes(id)) owned.push(id);
      equipped[item.slot] = id;
    } else if (item.kind === 'throwable') {
      supplies[id] = (supplies[id] ?? 0) + 1;
    }
    return true;
  }

  use(id) {
    if (!(this.state.supplies[id] > 0)) return false;
    this.state.supplies[id] -= 1;
    return true;
  }

  snapshot() {
    return { ...copyLoadout(this.state), earned: this.state.earned, spent: this.state.spent };
  }
}
