export enum SaveKind {
  World = 'World',
  Character = 'Character',
  Checkpoint = 'Checkpoint',
}

export type SlotKind = SaveKind.World | SaveKind.Character;

export interface CheckpointSave {
  kind: SlotKind;
  slot: string;
  name: string;
  source_modified?: string;
}

export interface Save {
  id: string;
  name: string;
  note: string;
  kind: SaveKind;
  slot: string;
  path: string;
  created: string;
  checkpoint_scope?: string;
  checkpoint_saves?: CheckpointSave[];
  captured?: string;
  source_modified?: string;
  world_created?: string;
  pinned: boolean;
  status: string;
  restore_target: string;
  matches_active: boolean;
}
export interface Command {
  op: string;
  id: string;
  value?: string;
  dangerous_mode?: boolean;
}
export function when(r: Save) {
  const d = new Date(r.created.replace(' ', 'T'));
  if (!Number.isFinite(+d)) return r.created;
  const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  const [unit, size] =
    seconds < 60
      ? ['second', 1]
      : seconds < 3600
        ? ['minute', 60]
        : seconds < 86400
          ? ['hour', 3600]
          : ['day', 86400];
  const ago = new Intl.RelativeTimeFormat(undefined, {
    numeric: 'always',
  }).format(
    -Math.floor(seconds / Number(size)),
    unit as Intl.RelativeTimeFormatUnit,
  );
  return ago + ' · ' + d.toLocaleString();
}
export function source(r: Save) {
  return (
    {
      Copy: 'Manual checkpoint',
      Backup: 'Before restore',
      'Game backup': 'Game backup',
    }[r.status] || r.status
  );
}
export function saveLabel(r: Pick<Save, 'kind' | 'name' | 'slot'>) {
  return r.kind === SaveKind.Checkpoint ? r.name : `${r.name} (${r.slot})`;
}
export function slot(r: Save) {
  return r.kind + '-' + r.slot;
}
