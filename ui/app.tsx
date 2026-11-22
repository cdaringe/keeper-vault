import { createSignal, createEffect, createRoot } from 'solid-js';
import { render as mount } from 'solid-js/web';
import { Checkpoints } from './checkpoints';
import { updateActions } from './controls';
import { saveLabel, type Save, type Command } from './model';
import { GameStatus, refreshGameStatus } from './game-status';
import { ask } from './dialog';
import { button } from './dom';
import {
  dangerousMode,
  observeGame,
  revealSwitch,
  restoreBlocked,
} from './restore-policy';
import { api, RunningGameError } from './api';
import { mountLibrary } from './library';

createRoot(() => {
  const [saves, setSaves] = createSignal<Save[]>([]);
  const [pending, setPending] = createSignal('');
  const msg = document.getElementById('msg');
  const showBackups = mountLibrary(saves, pending, request);
  async function request(cmd?: Command) {
    if (pending()) return;
    if (cmd && ['activate', 'restore_checkpoint'].includes(cmd.op)) {
      if (restoreBlocked()) {
        revealSwitch();
        return;
      }
      cmd = { ...cmd, dangerous_mode: dangerousMode() };
    }
    setPending('Wait for the current save operation to finish.');
    const paired = [
      'checkpoint',
      'restore_checkpoint',
      'trash_checkpoint',
      'recover_checkpoint',
      'purge_checkpoint',
    ].includes(cmd?.op);
    const feedback = paired
      ? document.querySelector('#checkpoint-status')
      : msg;
    if (paired) {
      feedback.textContent = {
        checkpoint: 'Creating checkpoint…',
        trash_checkpoint: 'Moving checkpoint to Trash…',
        recover_checkpoint: 'Recovering checkpoint…',
        purge_checkpoint: 'Permanently deleting checkpoint…',
        restore_checkpoint:
          'Backing up current progress and restoring checkpoint…',
      }[cmd.op];
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await api(cmd ? '/action' : '/saves', controller.signal, cmd);
      const profile = res.headers.get('X-Profile-Path');
      document.getElementById('profilePath').textContent = profile
        ? 'Open profile · ' + decodeURIComponent(profile)
        : '';
      setSaves(await res.json());
      feedback.textContent = cmd
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
        : '';
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
        msg.textContent = 'Backup created for ' + saveLabel(backed) + '. ';
        msg.append(button('View backups', showBackups));
      }
    } catch (e) {
      if (e instanceof RunningGameError) {
        observeGame('running');
        revealSwitch();
      }
      feedback.textContent = controller.signal.aborted
        ? 'The app took too long to respond. You can retry creating a checkpoint safely.'
        : e.message;
    } finally {
      clearTimeout(timeout);
      setPending('');
    }
  }
  mount(
    () => (
      <Checkpoints
        rows={saves()}
        pending={pending()}
        request={request}
        ask={ask}
      />
    ),
    document.getElementById('checkpoints'),
  );
  createEffect(() => updateActions(pending()));
  mount(() => <GameStatus />, document.getElementById('game-controls'));
  refreshGameStatus();
  request();
});
