export interface Save {
  id: string;
  name: string;
  note: string;
  kind: string;
  slot: string;
  path: string;
  created: string;
  checkpoint_scope?: string;
  captured?: string;
  source_modified?: string;
  world_created?: string;
  record_modified?: string;
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
export function saveLabel(r: Save) {
  return r.name;
}
export function slot(r: Save) {
  return r.kind + '-' + r.slot;
}
