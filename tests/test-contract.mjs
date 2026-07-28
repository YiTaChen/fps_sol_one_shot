export const REQUIRED_TEST_METHODS = Object.freeze([
  'ready',
  'state',
  'diagnostics',
  'start',
  'pause',
  'resume',
  'restart',
  'resize',
  'captureReady',
  'snapshot',
  'setInput',
  'step',
  'fire',
  'damagePlayer',
  'killEnemy',
  'setCapturePose',
  'frameStats',
  'runPerformance',
  'pointerLock',
  'pointerLocked',
]);

export const CAPTURE_VIEWS = Object.freeze([
  {
    id: 'wide-street',
    file: '01-wide-street.png',
    description: 'Wide market street composition',
  },
  {
    id: 'facade-close',
    file: '02-facade-close.png',
    description: 'Close procedural façade',
  },
  {
    id: 'interior',
    file: '03-interior.png',
    description: 'Enterable dressed interior',
  },
  {
    id: 'weapon-hip',
    file: '04-weapon-hip.png',
    description: 'Hip-fire weapon close-up',
  },
  {
    id: 'weapon-ads',
    file: '05-weapon-ads.png',
    description: 'ADS weapon alignment',
  },
  {
    id: 'enemy',
    file: '06-enemy.png',
    description: 'Enemy soldier at combat distance',
  },
  {
    id: 'active-combat',
    file: '07-active-combat.png',
    description: 'Active combat, effects, enemy, world, and HUD',
  },
]);

export function missingMethods(capabilities) {
  if (!capabilities) return [...REQUIRED_TEST_METHODS];
  return REQUIRED_TEST_METHODS.filter(
    (name) => capabilities.methods?.[name] !== 'function',
  );
}

