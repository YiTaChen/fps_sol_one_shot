export const RELAY_PATROLS = Object.freeze([
  [-34, 0, -29.1, Math.PI / 2],
  [-17, 0, -29.1, Math.PI / 2],
  [5.5, 0, -29.1, Math.PI],
  [26.3, 0, -30.55, Math.PI / 2],
  [39.4, 0, -26.3, 0],
  [28, 0, 0.8, -Math.PI / 2],
  [-17.55, 0, 7.4, 0],
]);

const HOLD_SECONDS = 1.1;
const DAMAGE_RECOVERY_SECONDS = 0.65;

export class RelayMission {
  constructor(route, extraction) {
    this.route = route;
    this.checkpoints = [...route, extraction];
    this.state = {
      completed: 0,
      total: route.length,
      target: this.checkpoints[0],
      nearby: false,
      progress: 0,
      interrupted: false,
      extracted: false,
    };
    this.reset();
  }

  reset() {
    this.clearHold();
    this.cooldown = 0;
    Object.assign(this.state, {
      completed: 0,
      target: this.checkpoints[0],
      nearby: false,
      interrupted: false,
      extracted: false,
    });
  }

  clearHold() {
    this.holdSeconds = 0;
    this.state.progress = 0;
  }

  interrupt() {
    this.clearHold();
    this.cooldown = DAMAGE_RECOVERY_SECONDS;
  }

  update(dt, position, held) {
    const { state } = this;
    const target = state.target;
    if (!target || state.extracted) return null;

    this.cooldown = Math.max(0, this.cooldown - dt);
    state.interrupted = this.cooldown > 0;
    const distance = Math.hypot(position.x - target.position.x, position.z - target.position.z);
    state.nearby = distance <= target.radius && Math.abs(position.y - target.position.y) < 0.9;
    if (!held || !state.nearby || state.interrupted) {
      this.clearHold();
      return null;
    }

    this.holdSeconds += dt;
    state.progress = Math.min(1, this.holdSeconds / HOLD_SECONDS);
    if (state.progress < 1) return null;

    this.clearHold();
    state.nearby = false;
    if (state.completed === this.route.length) {
      state.extracted = true;
      state.target = null;
      return 'extracted';
    }

    state.completed += 1;
    state.target = this.checkpoints[state.completed];
    return 'relay';
  }
}
