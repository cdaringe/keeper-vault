import { batch, createSignal } from 'solid-js';

type GameState = 'unknown' | 'running' | 'stopped';
export const [gameState, setState] = createSignal<GameState>('unknown');
export const [dangerousMode, setDangerousMode] = createSignal(false);
export const [switchVisible, setSwitchVisible] = createSignal(false);

export function observeGame(state: GameState) {
  batch(() => {
    setState(state);
    if (state !== 'running') {
      setSwitchVisible(false);
      setDangerousMode(false);
    }
  });
}

export function restoreBlocked() {
  return gameState() === 'running' && !dangerousMode();
}

export function revealSwitch() {
  if (!restoreBlocked()) return;
  setSwitchVisible(true);
  document.getElementById('dangerous-mode')?.focus();
}

export function restoreInstruction() {
  return dangerousMode() && gameState() === 'running'
    ? 'Dangerous mode is on. The running game may overwrite the restored files.'
    : 'Quit Core Keeper and wait for Steam to finish syncing.';
}
