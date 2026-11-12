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
      return { ...snapshot.state, districtStage: game.worldBuilder.powerStage };
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

    const powerStages = [];
    const signals = [];
    const stopPower = game.events.on('relay:power', ({ stage }) => powerStages.push(stage));
    const stopSignals = game.events.on('relay:decoy', ({ stage, responders }) => {
      signals.push({ stage, responders });
    });
    const steps = [];
    steps.push(await runInteraction(first));
    await api.teleport(game.player.spawnPosition.toArray());
    api.setInput({ decoy: true });
    const queued = (await api.step(24)).state.mission.decoy;
    await api.pause();
    const frozen = (await api.step(120)).state.mission.decoy;
    const pulsesWhilePaused = signals.length;
    await api.resume();
    api.setInput({ decoy: true });
    const spent = (await api.step(115)).state.mission.decoy;
    api.setInput({});
    for (const checkpoint of route.slice(1)) steps.push(await runInteraction(checkpoint));
    stopPower();
    stopSignals();
    const victoryMenu = document.querySelector('[data-screen="victory"]');
    const noNextLevel = victoryMenu.querySelector('[data-action="next-level"]').hidden;
    await api.restart();
    const restarted = api.state();
    const restartedDistrict = game.worldBuilder.powerStage;

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
      steps: steps.map(({ phase, mission, districtStage }) => ({ phase, mission, districtStage })),
      restarted: restarted.mission,
      restartedDistrict,
      noNextLevel,
      powerStages,
      signals,
      queued,
      frozen,
      spent,
      pulsesWhilePaused,
      sweepMission: stateAfter.state.mission,
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
    assert(step.phase === 'playing' && step.mission.completed === index + 1
      && step.districtStage === index + 1,
      `Relay ${index + 1} did not advance exactly once`);
    assert(step.mission.decoy?.ready, `Relay ${index + 1} did not charge a decoy`);
  }
  assert(outcome.powerStages.join(',') === '1,2,3', 'Power stages did not apply in sequence');
  assert(!outcome.queued.ready && outcome.queued.remaining > 1
    && outcome.queued.remaining < 1.5, 'Decoy did not consume the charge and begin its countdown');
  assert(outcome.frozen.remaining === outcome.queued.remaining && outcome.pulsesWhilePaused === 0,
    'Decoy countdown advanced while paused');
  assert(outcome.signals.length === 1 && outcome.signals[0].stage === 1
    && outcome.signals[0].responders <= 2 && outcome.spent.remaining === 0 && !outcome.spent.ready,
    'Decoy repeated, responded early, or diverted more than two patrols');
  assert(outcome.steps[3].phase === 'victory' && outcome.steps[3].mission.extracted,
    'Extraction after three relays did not complete the mission');
  assert(outcome.noNextLevel && outcome.restarted.completed === 0,
    'Relay replay or debrief still uses sweep progression');
  assert(!outcome.restarted.decoy && !outcome.sweepMission && outcome.restartedDistrict === 0,
    'District power or decoy state leaked into replay or Endless Sweep');
  assert(outcome.ammoConsumed === 1, 'A short click did not survive a render-only frame');
  assert(outcome.yawError < 0.04, 'The shot used stale aim from before the simultaneous turn');
  return outcome;
}
