import { NoteButton } from './note';
import { restoreInstruction } from './restore-policy';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { Action } from './action';
import { CheckpointTrash } from './checkpoint-trash';
import {
  SaveKind,
  saveLabel,
  when,
  type Command,
  type Save,
  type SlotKind,
} from './model';
import { SaveTime } from './save-time';

interface Props {
  rows: Save[];
  pending: string;
  refreshFailed: boolean;
  request(cmd: Command): Promise<void>;
  ask(
    title: string,
    description: string,
    action: string,
  ): Promise<string | null>;
}

export function Checkpoints(props: Props) {
  const [deletedOnly, setDeletedOnly] = createSignal(false);
  function saveSelection(kind: SlotKind) {
    const [value, setValue] = createSignal('');
    const options = createMemo(() =>
      props.rows.filter((row) => row.kind === kind && row.status === 'Live'),
    );
    const selected = createMemo(() =>
      options().find((row) => row.id === value()),
    );
    const skipped = () => value() === 'skip';
    return { kind, options, selected, skipped, setValue };
  }
  const world = saveSelection(SaveKind.World);
  const character = saveSelection(SaveKind.Character);
  const points = createMemo(() =>
    props.rows
      .filter((r) => r.status === (deletedOnly() ? 'Trashed' : 'Checkpoint'))
      .sort((a, b) => b.created.localeCompare(a.created)),
  );
  type SortKey = 'name' | 'created' | 'note';
  const [sort, setSort] = createSignal<{ key: SortKey; ascending: boolean }>({
    key: 'created',
    ascending: false,
  });
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  const sortedPoints = createMemo(() => {
    const { key, ascending } = sort();
    if (key === 'created')
      return ascending ? [...points()].reverse() : points();
    const value = (row: Save) =>
      key === 'name' ? row.checkpoint_scope || row.name : row.note || '';
    return [...points()].sort(
      (a, b) => collator.compare(value(a), value(b)) * (ascending ? 1 : -1),
    );
  });
  function sortHeader(key: SortKey, label: string) {
    const active = () => sort().key === key;
    return (
      <th
        scope="col"
        aria-sort={
          active() ? (sort().ascending ? 'ascending' : 'descending') : undefined
        }
      >
        <button
          class="sort-header"
          onClick={() =>
            setSort({
              key,
              ascending: active() ? !sort().ascending : key !== 'created',
            })
          }
        >
          {label}{' '}
          <span aria-hidden="true">
            {active() ? (sort().ascending ? '↑' : '↓') : '↕'}
          </span>
        </button>
      </th>
    );
  }
  const missing = () => {
    const needsWorld = !world.selected() && !world.skipped();
    const needsCharacter = !character.selected() && !character.skipped();
    if (needsWorld && needsCharacter)
      return 'Choose a save or Skip in each dropdown.';
    if (needsWorld) return 'Choose a world or Skip world.';
    if (needsCharacter) return 'Choose a character or Skip character.';
    return world.selected() || character.selected()
      ? ''
      : 'Include at least one save.';
  };

  function tableRow(point: Save, latest: () => boolean) {
    async function restore() {
      if (
        (await props.ask(
          'Restore this checkpoint?',
          (point.checkpoint_scope || point.name) +
            ' · ' +
            when(point) +
            '. ' +
            restoreInstruction() +
            ' Vault will back up and restore only the saves listed here.',
          'Restore checkpoint',
        )) !== null
      ) {
        await props.request({ op: 'restore_checkpoint', id: point.id });
      }
    }
    return (
      <tr id={'point-' + point.id} tabindex={-1}>
        <th scope="row">
          <Show
            when={point.checkpoint_saves?.length}
            fallback={<span>{point.checkpoint_scope || point.name}</span>}
          >
            <For each={point.checkpoint_saves}>
              {(save) => (
                <div class="checkpoint-save">
                  <span>
                    {save.kind}: {saveLabel(save)}
                  </span>
                  <div class="detail">
                    <SaveTime value={save.source_modified} />
                  </div>
                </div>
              )}
            </For>
          </Show>
          <Show when={latest() && !deletedOnly()}>
            <small>Latest</small>
          </Show>
        </th>
        <td>{when(point)}</td>
        <td>
          <div class="save-note">{point.note}</div>
          <Show when={!deletedOnly()}>
            <NoteButton
              row={point}
              request={props.request}
              pending={props.pending}
            />
          </Show>
        </td>
        <td>
          <div class="table-actions">
            <Show
              when={!deletedOnly()}
              fallback={
                <CheckpointTrash
                  row={point}
                  pending={props.pending}
                  request={props.request}
                  ask={props.ask}
                />
              }
            >
              <Action
                label="Restore"
                pending={props.pending}
                restore
                click={restore}
              />
              <Action
                label="Move to Trash"
                trashIcon
                pending={props.pending}
                secondary
                click={() =>
                  props.request({ op: 'trash_checkpoint', id: point.id })
                }
              />
            </Show>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <Show when={!deletedOnly()}>
        <div class="checkpoint-controls">
          <For each={[world, character]}>
            {(choice) => (
              <div class="checkpoint-selection">
                <label>
                  {choice.kind}
                  <select
                    aria-label={choice.kind}
                    aria-describedby={choice.kind.toLowerCase() + '-save-time'}
                    onChange={(e) => choice.setValue(e.currentTarget.value)}
                  >
                    <option
                      value=""
                      disabled
                      selected={!choice.selected() && !choice.skipped()}
                    >
                      Choose {choice.kind.toLowerCase()}…
                    </option>
                    <option value="skip" selected={choice.skipped()}>
                      Skip {choice.kind.toLowerCase()}
                    </option>
                    <For each={choice.options()}>
                      {(r) => (
                        <option
                          value={r.id}
                          selected={r.id === choice.selected()?.id}
                        >
                          {saveLabel(r)}
                        </option>
                      )}
                    </For>
                  </select>
                </label>
                <p
                  class="detail"
                  id={choice.kind.toLowerCase() + '-save-time'}
                  aria-live="polite"
                >
                  <Show when={choice.selected()}>
                    {(save) => <SaveTime value={save().source_modified} />}
                  </Show>
                </p>
              </div>
            )}
          </For>
          <Action
            label="Create checkpoint"
            pending={props.pending}
            reason={
              props.refreshFailed
                ? 'Refresh saves successfully before creating a checkpoint.'
                : missing()
            }
            click={() =>
              props.request({
                op: 'checkpoint',
                id: world.selected()?.id || '',
                value: character.selected()?.id || '',
              })
            }
          />
        </div>
      </Show>
      <label class="checkpoint-filter">
        Status
        <select
          aria-label="Checkpoint status"
          value={deletedOnly() ? 'deleted' : 'active'}
          onChange={(e) => setDeletedOnly(e.currentTarget.value === 'deleted')}
        >
          <option value="active">Active</option>
          <option value="deleted">Recently deleted</option>
        </select>
      </label>
      <table class="checkpoint-table" aria-label="Checkpoints">
        <thead>
          <tr>
            {sortHeader('name', 'Included saves')}
            {sortHeader('created', 'Captured')}
            {sortHeader('note', 'Note')}
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <For
            each={sortedPoints()}
            fallback={
              <tr>
                <td colspan={3}>
                  {deletedOnly()
                    ? 'No recently deleted checkpoints.'
                    : 'No checkpoints yet.'}
                </td>
                <td>
                  <Show when={!deletedOnly()}>
                    <Action
                      label="Restore"
                      reason="Create a checkpoint first."
                      pending={props.pending}
                      click={() => {}}
                    />
                  </Show>
                </td>
              </tr>
            }
          >
            {(point) => tableRow(point, () => point === points()[0])}
          </For>
        </tbody>
      </table>
    </>
  );
}
