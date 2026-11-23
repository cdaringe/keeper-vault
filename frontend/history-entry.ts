import { SaveKind, type Save } from './model';

export function historyEntry(row: Save) {
  switch (row.status) {
    case 'Live':
      return 'Current ' + row.kind.toLowerCase();
    case 'Game backup':
      return 'Previous game save';
    case 'Backup':
      return 'Before restore';
    case 'Copy':
      return 'Library copy';
    default:
      return row.status;
  }
}

function localTime(value: string) {
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
export function historyDates(row: Save): string[] {
  const dates: string[] = [];
  if (row.status !== 'Live')
    dates.push(
      row.captured
        ? 'Backed up ' + localTime(row.captured)
        : 'Backup time unknown',
    );
  if (row.kind === SaveKind.World && row.world_created)
    dates.push('Created ' + row.world_created);
  dates.push(
    'Modified ' +
      (row.source_modified ? localTime(row.source_modified) : 'not recorded'),
  );
  return dates;
}
