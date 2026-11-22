import { Show, onCleanup } from 'solid-js';
import { api } from './api';
import {
  gameState,
  observeGame,
  switchVisible,
  dangerousMode,
  setDangerousMode,
} from './restore-policy';

export function GameStatus() {
  const lifetime = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  async function refresh() {
    try {
      const response = await api(
        '/game-status',
        AbortSignal.any([lifetime.signal, AbortSignal.timeout(5000)]),
      );
      const running = await response.json();
      if (!lifetime.signal.aborted)
        observeGame(running ? 'running' : 'stopped');
    } catch {
      if (!lifetime.signal.aborted) observeGame('unknown');
    }
    if (!lifetime.signal.aborted) timer = setTimeout(refresh, 5000);
  }
  refresh();
  onCleanup(() => {
    lifetime.abort();
    clearTimeout(timer);
  });
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
