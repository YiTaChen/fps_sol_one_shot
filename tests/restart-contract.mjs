export function assertRestartSnapshot(before, after, cycle) {
  const prefix = `restart cycle ${cycle}`;
  if (!after) throw new Error(`${prefix}: snapshot missing`);
  const player = after.player ?? {};
  const weapon = after.weapon ?? {};
  const enemies = after.enemies ?? [];
  const state = after.state ?? after;
  if (Number(player.health ?? 100) !== 100) {
    throw new Error(`${prefix}: player health was not restored`);
  }
  if (Number(state.kills ?? 0) !== 0) {
    throw new Error(`${prefix}: kill counter was not cleared`);
  }
  if (weapon.reloading) {
    throw new Error(`${prefix}: weapon remained in reload state`);
  }
  if (Array.isArray(enemies) && enemies.length < 6) {
    throw new Error(`${prefix}: expected at least six active enemies`);
  }
  if (
    before?.listenerCount !== undefined &&
    after.listenerCount !== undefined &&
    before.listenerCount !== after.listenerCount
  ) {
    throw new Error(
      `${prefix}: listener count changed from ${before.listenerCount} to ${after.listenerCount}`,
    );
  }
}

