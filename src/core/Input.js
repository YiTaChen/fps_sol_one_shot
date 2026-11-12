const BLOCKED_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "KeyF",
  "KeyR",
  "KeyC",
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "Space",
]);

export class InputManager {
  constructor(element, events) {
    this.element = element;
    this.events = events;
    this.keys = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.buttons = new Set();
    this.syntheticKeys = new Set();
    this.syntheticButtons = new Set();
    this.pressedButtons = new Set();
    this.releasedButtons = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    this.abort = new AbortController();
    this.install();
  }

  install() {
    const options = { signal: this.abort.signal };
    window.addEventListener("keydown", (event) => {
      if (!this.enabled) return;
      if (BLOCKED_KEYS.has(event.code)) event.preventDefault();
      if (!event.repeat && !this.keys.has(event.code)) {
        this.justPressed.add(event.code);
      }
      this.keys.add(event.code);
    }, options);
    window.addEventListener("keyup", (event) => {
      if (this.enabled && BLOCKED_KEYS.has(event.code)) event.preventDefault();
      if (this.keys.delete(event.code)) this.justReleased.add(event.code);
    }, options);
    window.addEventListener("mousedown", (event) => {
      if (!this.enabled || !this.locked) return;
      if (!this.buttons.has(event.button)) this.pressedButtons.add(event.button);
      this.buttons.add(event.button);
    }, options);
    window.addEventListener("mouseup", (event) => {
      if (this.buttons.delete(event.button)) this.releasedButtons.add(event.button);
    }, options);
    window.addEventListener("mousemove", (event) => {
      if (!this.enabled || !this.locked) return;
      this.lookX += event.movementX;
      this.lookY += event.movementY;
    }, options);
    window.addEventListener("wheel", (event) => {
      if (!this.enabled) return;
      this.wheel += Math.sign(event.deltaY);
    }, { ...options, passive: true });
    window.addEventListener("blur", () => this.reset(), options);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    }, options);
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.element;
      this.resetTransient();
      this.events.emit("input:pointer-lock", { locked: this.locked });
    }, options);
    document.addEventListener("pointerlockerror", () => {
      this.events.emit("input:pointer-lock-error", {});
    }, options);
    this.element.addEventListener("contextmenu", (event) => event.preventDefault(), options);
  }

  requestPointerLock() {
    if (document.pointerLockElement !== this.element) {
      try {
        const result = this.element.requestPointerLock({
          unadjustedMovement: true,
        });
        return Promise.resolve(result).catch(() =>
          this.element.requestPointerLock());
      } catch {
        return Promise.resolve(this.element.requestPointerLock());
      }
    }
    return Promise.resolve();
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code) {
    return this.keys.has(code) || this.syntheticKeys.has(code);
  }

  down(code) {
    return this.isDown(code);
  }

  wasPressed(code) {
    const value = this.justPressed.has(code);
    this.justPressed.delete(code);
    return value;
  }

  pressed(code) {
    return this.wasPressed(code);
  }

  consumePressed(code) {
    const value = this.justPressed.has(code);
    this.justPressed.delete(code);
    return value;
  }

  wasReleased(code) {
    const value = this.justReleased.has(code);
    this.justReleased.delete(code);
    return value;
  }

  buttonDown(button) {
    return this.buttons.has(button) || this.syntheticButtons.has(button);
  }

  buttonPressed(button) {
    return this.pressedButtons.has(button);
  }

  consumeButtonPressed(button) {
    return this.pressedButtons.delete(button);
  }

  consumeLook(target = { x: 0, y: 0 }) {
    target.x = this.lookX;
    target.y = this.lookY;
    this.lookX = 0;
    this.lookY = 0;
    return target;
  }

  endFrame() {
    this.justPressed.clear();
    this.justReleased.clear();
    this.pressedButtons.clear();
    this.releasedButtons.clear();
    this.wheel = 0;
  }

  /**
   * Deterministic development input. Normal builds never call this; the game
   * exposes it only through the ?test=1 interface.
   */
  setSynthetic(record = {}) {
    const previousKeys = new Set(this.syntheticKeys);
    this.syntheticKeys.clear();
    this.syntheticButtons.clear();
    const aliases = {
      forward: "KeyW",
      backward: "KeyS",
      left: "KeyA",
      right: "KeyD",
      sprint: "ShiftLeft",
      crouch: "ControlLeft",
      jump: "Space",
      reload: "KeyR",
      leanLeft: "KeyQ",
      leanRight: "KeyE",
      interact: "KeyF",
    };
    const keys = record.keys ?? record;
    for (const [name, value] of Object.entries(keys)) {
      if (!value) continue;
      const code = aliases[name] || name;
      if (/^(Key|Digit|Arrow|Shift|Control|Space)/.test(code)) {
        if (!previousKeys.has(code)) this.justPressed.add(code);
        this.syntheticKeys.add(code);
      }
    }
    const buttons = record.buttons ?? {};
    if (record.fire || buttons.left || buttons[0]) this.syntheticButtons.add(0);
    if (record.ads || buttons.right || buttons[2]) this.syntheticButtons.add(2);
    if (Number.isFinite(record.lookX)) this.lookX += record.lookX;
    if (Number.isFinite(record.lookY)) this.lookY += record.lookY;
  }

  clearSynthetic() {
    this.syntheticKeys.clear();
    this.syntheticButtons.clear();
  }

  resetTransient() {
    this.justPressed.clear();
    this.justReleased.clear();
    this.pressedButtons.clear();
    this.releasedButtons.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
  }

  reset() {
    this.keys.clear();
    this.buttons.clear();
    this.clearSynthetic();
    this.resetTransient();
  }

  dispose() {
    this.abort.abort();
    this.reset();
  }
}

export default InputManager;
