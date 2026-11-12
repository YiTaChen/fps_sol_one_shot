import { assert } from '../scripts/lib/browserHarness.mjs';

export async function runRelayAndInputContract(page) {
  const outcome = await page.evaluate(async () => {
    const api = window.__FPS_TEST__;
    const game = window.__CINDERLINE__;
    game.events.emit('game:menu');
    await api.start('relay');
    const route = api.missionRoute();
    const first = route[0];
    const extraction = route.at(-1);
    const positionOf = ({ position }) => [position.x, position.y + 0.04, position.z];
    const runInteraction = async (checkpoint) => {
      await api.teleport(positionOf(checkpoint));
      api.setInput({ interact: true });
      const snapshot = await api.step(70);
      api.setInput({});
      await api.step(1);
      return snapshot.state;
    };

    const prematureExtraction = await runInteraction(extraction);
    await api.teleport(positionOf(first));
    api.setInput({ interact: true });
    const initialHold = await api.step(30);
    await api.pause();
    const paused = api.state();
    await api.resume();
    api.setInput({ interact: true });
    await api.step(24);
    await api.damagePlayer(1);
    const interrupted = await api.step(12);
    api.setInput({});
    await api.step(45);

    const steps = [];
    for (const checkpoint of route) steps.push(await runInteraction(checkpoint));
    const victoryMenu = document.querySelector('[data-screen="victory"]');
    const noNextLevel = victoryMenu.querySelector('[data-action="next-level"]').hidden;
    await api.restart();
    const restarted = api.state();

    game.events.emit('game:menu');
    await api.start();
    const stateBefore = api.snapshot();
    let shot = null;
    const unsubscribe = game.events.on('weapon:fire', (data) => { shot = data; });
    api.setInput({ lookX: 240 });
    game.input.pressedButtons.add(0);
    game.update(1 / 144, 1);
    await api.step(1);
    unsubscribe();
    const stateAfter = api.snapshot();
    const shotYaw = Math.atan2(-shot?.direction.x, -shot?.direction.z);
    const yawError = Math.abs(shotYaw - stateAfter.player.yaw);

    game.events.emit('game:menu');
    return {
      prematureExtraction: prematureExtraction.phase,
      held: initialHold.state.mission.progress,
      paused: paused.mission.progress,
      interrupted: interrupted.state.mission,
      steps: steps.map(({ phase, mission }) => ({ phase, mission })),
      restarted: restarted.mission,
      noNextLevel,
      ammoConsumed: stateBefore.weapon.magazine - stateAfter.weapon.magazine,
      yawError,
    };
  });

  assert(outcome.prematureExtraction === 'playing', 'Extraction was possible before the relays');
  assert(outcome.held > 0.35 && outcome.held < 0.6, 'Hold progress did not accrue');
  assert(outcome.paused === 0, 'Pause preserved a partial hold');
  assert(outcome.interrupted.interrupted && outcome.interrupted.progress === 0,
    'Damage did not interrupt the relay hold');
  for (let index = 0; index < 3; index += 1) {
    const step = outcome.steps[index];
    assert(step.phase === 'playing' && step.mission.completed === index + 1,
      `Relay ${index + 1} did not advance exactly once`);
  }
  assert(outcome.steps[3].phase === 'victory' && outcome.steps[3].mission.extracted,
    'Extraction after three relays did not complete the mission');
  assert(outcome.noNextLevel && outcome.restarted.completed === 0,
    'Relay replay or debrief still uses sweep progression');
  assert(outcome.ammoConsumed === 1, 'A short click did not survive a render-only frame');
  assert(outcome.yawError < 0.04, 'The shot used stale aim from before the simultaneous turn');
  return outcome;
}
