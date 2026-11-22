import { createSignal, flush, For, Show, onCleanup } from 'solid-js';
import { render as mount } from '@solidjs/web';
import { Checkpoints } from './checkpoints';
import { saveLabel, type Save, type Command } from './model';
import { GameStatus } from './game-status';
import { ask, Dialog } from './dialog';
import { feedback, notify } from './feedback';
import { openMenu } from './row-menu';
import {
  dangerousMode,
  observeGame,
  revealSwitch,
  restoreBlocked,
} from './restore-policy';
import { api, RunningGameError } from './api';
import { Library } from './library';
import { Action } from './action';

function App() {
  const [saves, setSaves] = createSignal<Save[]>([]);
  const [pending, setPending] = createSignal('');
  const [profilePath, setProfilePath] = createSignal('');
  const [checkpointStatus, setCheckpointStatus] = createSignal('');
  const [filter, setFilter] = createSignal('Checkpoints');
  const [history, setHistory] = createSignal('');
  const [lastRefreshed, setLastRefreshed] = createSignal<Date | null>(null);
  const [refreshFailed, setRefreshFailed] = createSignal(false);
  function select(name: string) {
    openMenu('');
    setHistory('');
    setFilter(name);
  }
  function outside(e: MouseEvent) {
    if (!(e.target as Element).closest('.actions')) openMenu('');
  }
  function escape(e: KeyboardEvent) {
    if (e.key === 'Escape') openMenu('');
  }
  document.addEventListener('click', outside);
  document.addEventListener('keydown', escape);
  onCleanup(() => {
    document.removeEventListener('click', outside);
    document.removeEventListener('keydown', escape);
  });
  async function request(cmd?: Command) {
    if (pending()) return;
    if (cmd && ['activate', 'restore_checkpoint'].includes(cmd.op)) {
      if (restoreBlocked()) {
        revealSwitch();
        return;
      }
      cmd = { ...cmd, dangerous_mode: dangerousMode() };
    }
    setPending(
      cmd
        ? 'Wait for the current save operation to finish.'
        : 'Refreshing saves from disk. Wait for it to finish.',
    );
    const paired = [
      'checkpoint',
      'restore_checkpoint',
      'trash_checkpoint',
      'recover_checkpoint',
      'purge_checkpoint',
    ].includes(cmd?.op);
    const report = paired ? setCheckpointStatus : notify;
    if (paired) {
      report(
        {
          checkpoint: 'Creating checkpoint…',
          trash_checkpoint: 'Moving checkpoint to Trash…',
          recover_checkpoint: 'Recovering checkpoint…',
          purge_checkpoint: 'Permanently deleting checkpoint…',
          restore_checkpoint:
            'Backing up current progress and restoring checkpoint…',
        }[cmd.op],
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await api(cmd ? '/action' : '/saves', controller.signal, cmd);
      const profile = res.headers.get('X-Profile-Path');
      setProfilePath(profile ? decodeURIComponent(profile) : '');
      setSaves(await res.json());
      setLastRefreshed(new Date());
      setRefreshFailed(false);
      flush();
      report(
        cmd
          ? {
              trash_checkpoint: 'Checkpoint moved to Recently deleted.',
              recover_checkpoint: 'Checkpoint recovered.',
              purge_checkpoint: 'Checkpoint permanently deleted.',
              backup: 'Backup created.',
              copy: 'Copy saved.',
              history: '',
              checkpoint:
                res.headers.get('X-Checkpoint-Reused') === 'true'
                  ? 'Already saved. This checkpoint matches your selection.'
                  : 'Checkpoint created.',
              restore_checkpoint:
                'Checkpoint restored. Open Core Keeper to resume from this point. Your previous progress is in Backups.',
              activate:
                'Version restored. Undo from “Before restore” in save history.',
              note: cmd.value?.trim() ? 'Note saved.' : 'Note removed.',
              pin: 'Pin updated.',
            }[cmd.op]
          : 'Saves refreshed from disk.',
      );
      if (cmd?.op === 'checkpoint') {
        const card = document.getElementById(
          'point-' + res.headers.get('X-Checkpoint-Id'),
        );
        if (card) {
          card.focus({ preventScroll: true });
        }
      }
      if (cmd?.op === 'backup') {
        const backed = saves().find((r) => r.id === cmd.id);
        notify('Backup created for ' + saveLabel(backed) + '. ', true);
      }
    } catch (e) {
      if (!cmd) setRefreshFailed(true);
      if (e instanceof RunningGameError) {
        observeGame('running');
        revealSwitch();
      }
      const error = controller.signal.aborted
        ? cmd
          ? 'The app took too long to respond. You can retry creating a checkpoint safely.'
          : 'Refreshing saves took too long. Try again.'
        : e.message;
      report(
        cmd
          ? error
          : 'Could not refresh saves: ' +
              error +
              ' Displayed save times may be out of date.',
      );
    } finally {
      clearTimeout(timeout);
      setPending('');
    }
  }
  request();
  return (
    <>
      <header>
        <div>
          <span class="gem" aria-hidden="true" />
          Keeper Vault
          <span id="game-controls">
            <GameStatus />
          </span>
        </div>
      </header>
      <main>
        <div class="library-heading">
          <h1>Save library</h1>
          <Action
            label="Refresh saves"
            secondary
            pending={pending()}
            click={() => request()}
          />
        </div>
        <p id="profilePath">
          {profilePath() && 'Open profile · ' + profilePath()}
        </p>
        <p class="detail" id="save-refresh-time">
          <Show
            when={lastRefreshed()}
            fallback="Saves have not been loaded yet."
          >
            {(checked) => (
              <>
                Last refreshed:{' '}
                <time datetime={checked().toISOString()}>
                  {checked().toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'long',
                  })}
                </time>
              </>
            )}
          </Show>
        </p>
        <nav aria-label="Filter saves">
          <For each={['Checkpoints', 'Worlds', 'Characters', 'Backups']}>
            {(name) => (
              <button
                aria-pressed={filter() === name ? 'true' : 'false'}
                onClick={() => select(name)}
              >
                {name}
              </button>
            )}
          </For>
        </nav>
        <div id="msg" role="status">
          {feedback().text}
          <Show when={feedback().backups}>
            <button
              onClick={() => {
                select('Backups');
                notify('');
              }}
            >
              View backups
            </button>
          </Show>
        </div>
        <section
          id="checkpoint-panel"
          hidden={filter() !== 'Checkpoints'}
          aria-labelledby="checkpoint-heading"
        >
          <h2 id="checkpoint-heading" hidden>
            Checkpoints
          </h2>
          <p class="detail">
            A checkpoint is a restore point for a world, a character, or both.
            Include both to back them up or restore them together in one action.
            Save and quit in Core Keeper, then refresh saves before creating
            one. Refresh reads files already saved on disk.
          </p>
          <div id="checkpoints">
            <Checkpoints
              rows={saves()}
              pending={pending()}
              refreshFailed={refreshFailed()}
              request={request}
              ask={ask}
            />
          </div>
          <div id="checkpoint-status" role="status">
            {checkpointStatus()}
          </div>
        </section>
        <Show when={filter() !== 'Checkpoints'}>
          <Library
            rows={saves()}
            pending={pending()}
            request={request}
            filter={filter()}
            history={history()}
            openHistory={setHistory}
            select={select}
          />
        </Show>
      </main>
      <Dialog />
    </>
  );
}
mount(() => <App />, document.getElementById('app'));
