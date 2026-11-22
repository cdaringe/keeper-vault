import { Show } from 'solid-js';
import { NoteButton } from './note';
import { historyDates, historyEntry } from './history-entry';
import { restoreInstruction } from './restore-policy';
import { ask } from './dialog';
import { Action } from './action';
import { RowMenu, openMenu } from './row-menu';
import {
  saveLabel,
  source,
  when,
  slot,
  type Save,
  type Command,
} from './model';

export function SaveRow(props: {
  row: Save;
  rows: Save[];
  history: string;
  pending: string;
  openHistory(key: string): void;
  request(cmd: Command): Promise<void>;
  showTarget(row: Save): void;
}) {
  const r = () => props.row;
  const live = () => r().status === 'Live';
  const act = (op: string) => props.request({ op, id: r().id });
  const latest = () =>
    props.rows
      .filter((v) => slot(v) === slot(r()) && v.status !== 'Live')
      .sort((a, b) => b.created.localeCompare(a.created))[0];
  const target = () =>
    r().restore_target && props.rows.find((v) => v.id === r().restore_target);
  async function restore() {
    const save = r();
    const current =
      props.rows.find((v) => slot(v) === slot(save) && v.status === 'Live') ||
      save;
    if (
      (await ask(
        'Restore ' + saveLabel(save) + '?',
        source(save) +
          ' · ' +
          when(save) +
          '. ' +
          restoreInstruction() +
          ' The current ' +
          save.kind.toLowerCase() +
          ' ' +
          saveLabel(current) +
          ' will be backed up before replacement.',
        'Back up & restore',
      )) !== null
    )
      await props.request({ op: 'activate', id: save.id });
  }
  return (
    <article
      class={[
        live() && 'active-slot',
        props.history && 'point',
        props.history && live() && 'current',
      ]
        .filter(Boolean)
        .join(' ')}
      id={props.history ? 'point-' + r().id : undefined}
      tabindex={props.history ? -1 : undefined}
      data-id={props.history ? r().id : undefined}
      data-target={props.history && target() ? r().restore_target : undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(r().id);
      }}
    >
      <span class="icon">{r().kind === 'World' ? '◆' : '♟'}</span>
      <div class="info">
        <Show when={!props.history && r().matches_active}>
          <strong class="slot-label">Matches current save</strong>
        </Show>
        <div class="save-heading">
          <div class="title">
            {props.history ? historyEntry(r()) : saveLabel(r())}
          </div>
          <Show when={props.history && r().matches_active && !live()}>
            <span class="detail">Matches current</span>
          </Show>
          <Show when={!props.history && live()}>
            <strong class="slot-label">Current save</strong>
          </Show>
          <NoteButton
            row={r()}
            request={props.request}
            pending={props.pending}
          />
        </div>
        <div class="detail">
          {props.history
            ? historyDates(r()).join(' · ')
            : [r().kind, live() ? null : source(r()), r().created]
                .filter(Boolean)
                .join(' · ')}
        </div>
        <Show when={r().note}>
          <div class="save-note">{r().note}</div>
        </Show>
        <Show when={!props.history && live() && latest()}>
          {(point) => (
            <div class="detail">Latest restore point: {when(point())}</div>
          )}
        </Show>
        <Show when={props.history && target()}>
          {(point) => (
            <button class="target" onClick={() => props.showTarget(point())}>
              ↳ Restored {source(point())} ·{' '}
              {point().captured || point().created}
            </button>
          )}
        </Show>
      </div>
      <div class="actions">
        <Show
          when={live()}
          fallback={
            <>
              <Action
                label="Copy"
                secondary
                pending={props.pending}
                click={() => act('copy')}
              />
              <Action
                label="Restore"
                restore
                pending={props.pending}
                click={restore}
              />
            </>
          }
        >
          <Action
            label="Back up now"
            pending={props.pending}
            click={() => act('backup')}
          />
          <Show when={!props.history}>
            <Action
              label="View history"
              secondary
              pending={props.pending}
              click={() => {
                props.openHistory(slot(r()));
                return act('history');
              }}
            />
          </Show>
        </Show>
        <Action
          label={r().pinned ? '★' : '☆'}
          class="pin-star"
          pressed={r().pinned}
          accessibleLabel={(r().pinned ? 'Unpin ' : 'Pin ') + saveLabel(r())}
          pending={props.pending}
          click={() => act('pin')}
        />
        <RowMenu row={r()} />
      </div>
    </article>
  );
}
