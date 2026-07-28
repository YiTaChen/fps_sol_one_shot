/**
 * Small synchronous event bus. Publishers treat payloads as immutable and
 * listeners may remove themselves safely during dispatch.
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
    this.dispatchDepth = 0;
    this.pendingRemovals = [];
  }

  on(type, listener) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => this.off(type, listener);
  }

  once(type, listener) {
    const off = this.on(type, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  off(type, listener) {
    if (this.dispatchDepth > 0) {
      this.pendingRemovals.push([type, listener]);
      return;
    }
    const set = this.listeners.get(type);
    set?.delete(listener);
    if (set?.size === 0) this.listeners.delete(type);
  }

  emit(type, payload = Object.freeze({})) {
    const set = this.listeners.get(type);
    if (!set?.size) return;
    this.dispatchDepth += 1;
    try {
      for (const listener of [...set]) listener(payload);
    } finally {
      this.dispatchDepth -= 1;
      if (this.dispatchDepth === 0 && this.pendingRemovals.length) {
        const removals = this.pendingRemovals.splice(0);
        for (const [eventType, listener] of removals) {
          this.off(eventType, listener);
        }
      }
    }
  }

  listenerCount(type = null) {
    if (type) return this.listeners.get(type)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  clear() {
    this.listeners.clear();
    this.pendingRemovals.length = 0;
  }
}

export default EventBus;
