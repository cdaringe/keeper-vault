import { Show } from 'solid-js';
import { api } from './api';
import {
  gameState,
  observeGame,
  switchVisible,
  dangerousMode,
  setDangerousMode,
} from './restore-policy';

export function GameStatus() {
  return (
    <>
      <span id="game-status" role="status" data-state={gameState()}>
        {
          {
            running: 'Core Keeper running',
            stopped: 'Core Keeper not running',
            unknown: 'Game status unavailable',
          }[gameState()]
        }
      </span>
      <Show when={switchVisible()}>
        <label class="danger-switch">
          <input
            id="dangerous-mode"
            type="checkbox"
            role="switch"
            checked={dangerousMode()}
            onChange={(e) => setDangerousMode(e.currentTarget.checked)}
          />{' '}
          Dangerous mode
        </label>
      </Show>
    </>
  );
}

export async function refreshGameStatus() {
  try {
    const response = await api('/game-status', AbortSignal.timeout(5000));
    observeGame((await response.json()) ? 'running' : 'stopped');
  } catch {
    observeGame('unknown');
  }
  setTimeout(refreshGameStatus, 5000);
}
