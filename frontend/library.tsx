import { createMemo, For, Show, flush } from 'solid-js';
import { HistoryGraph } from './graph';
import { saveLabel, slot, type Save, type Command } from './model';
import { SaveRow } from './save-row';
export function Library(props: {
  rows: Save[];
  pending: string;
  request(cmd: Command): Promise<void>;
  filter: string;
  history: string;
  openHistory(key: string): void;
  select(name: string): void;
}) {
  const shown = createMemo(() => {
    const rows = props.rows;
    const liveSlots = new Set(
      rows.filter((r) => r.status === 'Live').map(slot),
    );
    return rows
      .filter(
        (r) =>
          r.kind !== 'Checkpoint' &&
          (props.history
            ? slot(r) === props.history
            : props.filter === 'Backups'
              ? r.status !== 'Live'
              : props.filter === r.kind + 's' &&
                (r.status === 'Live' || !liveSlots.has(slot(r)))),
      )
      .sort(
        (a, b) =>
          (!props.history && Number(b.pinned) - Number(a.pinned)) ||
          Number(b.status === 'Live') - Number(a.status === 'Live') ||
          b.created.localeCompare(a.created) ||
          a.name.localeCompare(b.name),
      );
  });
  function showTarget(row: Save) {
    if (row.kind === 'Checkpoint') {
      props.select('Checkpoints');
      flush();
    }
    const dest = document.getElementById('point-' + row.id);
    dest?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    dest?.focus({ preventScroll: true });
  }
  const historyName = () => {
    const row = shown().find((save) => save.status === 'Live') || shown()[0];
    return row ? saveLabel(row) : 'Save';
  };
  return (
    <section id="list" aria-label="Saves">
      <Show when={!props.history && props.filter === 'Backups'}>
        <p class="detail">Choose a backup to restore its world or character.</p>
      </Show>
      <Show when={props.history}>
        <button onClick={() => props.openHistory('')}>← {props.filter}</button>
        <h2>{historyName()} · Save history</h2>
      </Show>
      <div class={props.history ? 'timeline' : undefined}>
        <Show when={props.history}>
          <HistoryGraph rows={shown()} />
        </Show>
        <For
          each={shown()}
          keyed={(r) => r.id}
          fallback={<p>No saves in this view.</p>}
        >
          {(r) => (
            <SaveRow
              row={r()}
              rows={props.rows}
              pending={props.pending}
              history={props.history}
              openHistory={props.openHistory}
              request={props.request}
              showTarget={showTarget}
            />
          )}
        </For>
        <Show
          when={
            props.history &&
            shown().length === 1 &&
            shown()[0].status === 'Live'
          }
        >
          <p class="detail">No backups yet.</p>
        </Show>
      </div>
    </section>
  );
}
