module main

import os
import layout
import json2

struct Store {
	profile string
	library string
}

struct Label {
	alias  string // Legacy display name.
	note   string
	pinned bool
}

struct Row {
	checkpoint_saves []CheckpointSave
	checkpoint_scope string
	world_created    string
	source_modified  string
	captured         string
	record_modified  string
	restore_target   string
	id               string
	kind             string
	slot             string
	name             string
	status           string
	created          string
	path             string
	note             string
	pinned           bool
mut:
	matches_active bool
}

struct CheckpointSave {
	kind            string
	slot            string
	name            string
	source_modified string
}

struct Snapshot {
	source_modified string
	captured        string
	restore_target  string
	kind            string
	slot            string
	status          string
	created         string
	hashes          map[string]string
}

struct Command {
	dangerous_mode bool
	op             string
	id             string
	value          string
}

fn (s Store) labels() !map[string]Label {
	p := layout.labels(s.library)
	if !os.exists(p) { return map[string]Label{} }
	mut labels := json2.decode[map[string]Label](os.read_file(p)!)!
	for key, label in labels.clone() {
		if label.alias != '' && label.note == '' {
			labels[key] = Label{ note: label.alias, pinned: label.pinned }
		}
	}
	return labels
}

fn (s Store) rows() ![]Row {
	labels := s.labels()!
	mut rows := []Row{}
	for kind in ['World', 'Character'] {
		path := layout.primary_save(kind, '0')
		dir := os.join_path(s.profile, os.dir(path))
		if !os.is_dir(dir) { continue }
		for file in os.ls(dir)! {
			slot := file.all_before('.')
			if !layout.numeric(slot) || file != os.file_name(layout.primary_save(kind, slot)) {
				continue
			}
			id := '${kind}-${slot}'
			label := labels[id]
			rows << Row{ id: id, kind: kind, slot: slot, name: display_name(s.profile, kind, slot), status: 'Live', world_created: world_creation_date(s.profile, kind, slot), source_modified: modified_at(os.join_path(dir, file)), path: os.join_path(dir, file), note: label.note, pinned: label.pinned }
		}
	}
	rows << s.library_rows(labels)!
	return rows
}

fn (s Store) library_rows(labels map[string]Label) ![]Row {
	mut rows := []Row{}
	for id in os.ls(s.library)! {
		if layout.is_checkpoint(id) || layout.is_trashed_checkpoint(id) {
			bundle := Store{ profile: s.profile, library: os.join_path(s.library, id) }
			members := bundle.checkpoint_members()!
			status := if layout.is_trashed_checkpoint(id) { 'Trashed' } else { 'Checkpoint' }
			bundle_labels := bundle.labels()!
			rows << Row{ note: bundle_labels['checkpoint'].note, id: id, kind: 'Checkpoint', status: status, name: members.map(it.name + ' (' + it.slot + ')').join(' + '), checkpoint_scope: members.map(it.kind + ': ' + it.name + ' (' + it.slot + ')').join(' · '), checkpoint_saves: members.map(CheckpointSave{ kind: it.kind, slot: it.slot, name: it.name, source_modified: it.source_modified }), created: members[0].created }
			continue
		}
		if !layout.is_snapshot(id) { continue }
		root := os.join_path(s.library, id)
		m := read_manifest(root)!
		if !layout.numeric(m.slot) || m.kind !in ['World', 'Character'] {
			return error('Invalid snapshot: ' + id)
		}
		label := labels[id]
		// Older imports recorded the game file date in created. Their manifest
		// modification time is only an estimate of when Vault imported them.
		old_import := m.status == 'Game backup' && m.captured == ''
		capture := if m.captured != '' {
			m.captured
		} else if old_import {
			''
		} else {
			m.created
		}
		source_time := if old_import { m.created } else { m.source_modified }
		rows << Row{
			world_created:   world_creation_date(root, m.kind, m.slot)
			source_modified: source_time
			captured:        capture
			record_modified: if old_import {
				modified_at(layout.manifest(root))
			} else {
				''
			}
			id:              id
			kind:            m.kind
			slot:            m.slot
			name:            display_name(root, m.kind, m.slot)
			status:          m.status
			restore_target:  m.restore_target
			created:         m.created
			path:            os.join_path(root, layout.primary_save(m.kind, m.slot))
			note:            label.note
			pinned:          label.pinned
		}
	}
	return rows
}

// Compare each slot once per listing. Several restore points can contain the
// same version, and the game can change the slot between Vault sessions.
fn (s Store) visible_rows() ![]Row {
	mut rows := s.rows()!
	mut current := map[string]map[string]string{}
	for mut row in rows {
		if row.status == 'Live' || row.kind == 'Checkpoint' { continue }
		key := row.kind + '-' + row.slot
		if key !in current {
			current[key] = slot_hashes(s.profile, row.kind, row.slot)!
		}
		m := read_manifest(os.join_path(s.library, row.id))!
		row.matches_active = m.hashes == current[key]
	}
	return rows
}

fn (s Store) apply(c Command) !CaptureResult {
	rows := s.rows()!
	if c.op in ['checkpoint', 'boss'] {
		return s.capture_checkpoint(rows, c.id, c.value)!
	}
	for row in rows {
		if row.id != c.id { continue }
		root := if row.status == 'Live' { s.profile } else { os.join_path(s.library, row.id) }
		if c.op == 'note' && row.status != 'Trashed' {
			if c.value.runes().len > 1000 {
				return error('Notes can contain up to 1000 characters')
			}
			label := Label{ note: c.value.trim_space(), pinned: row.pinned }
			if row.kind == 'Checkpoint' {
				bundle := Store{ profile: s.profile, library: root }
				bundle.save_label('checkpoint', label)!
			} else {
				s.save_label(row.id, label)!
			}
			return CaptureResult{}
		}
		if row.kind == 'Checkpoint' {
			if row.status == 'Trashed' {
				match c.op {
					'recover_checkpoint' {
						s.move_checkpoint(row.id, layout.original_checkpoint_id(row.id))!
					}
					'purge_checkpoint' {
						if c.value != row.id {
							return error('Confirm permanent deletion of this checkpoint')
						}
						s.purge_checkpoint(row.id)!
					}
					else { return error('Recover the checkpoint from Trash first') }
				}
				return CaptureResult{}
			}
			if c.op in ['delete_checkpoint', 'trash_checkpoint'] {
				s.move_checkpoint(row.id, layout.trashed_id(row.id))!
				return CaptureResult{}
			}
			if c.op !in ['restore_checkpoint', 'retry'] {
				return error('Choose Restore checkpoint')
			}
			bundle := Store{ profile: s.profile, library: root }
			s.activate(root, bundle.checkpoint_members()!)!
			return CaptureResult{}
		}
		match c.op {
			'pin' { s.save_label(row.id, Label{ note: row.note, pinned: !row.pinned })! }
			'history' {
				if row.status != 'Live' { return error('Select a live slot') }
				s.snapshot(root, row.kind, row.slot, 'Game backup')!
			}
			'backup' {
				if row.status != 'Live' { return error('Select a live slot to back up') }
				s.snapshot(root, row.kind, row.slot, 'Manual backup')!
			}
			'copy' {
				if row.status != 'Live' {
					verify(root, row)!
					s.snapshot_for_restore(root, row.kind, row.slot, 'Copy', '',
						original_modified: row.source_modified
					)!
				} else {
					s.snapshot(root, row.kind, row.slot, 'Copy')!
				}
			}
			'activate' {
				if row.status == 'Live' { return error('This save is already live') }
				s.activate(s.library, [row])!
			}
			else { return error('Unknown action') }
		}
		return CaptureResult{}
	}
	return error('Save no longer exists')
}

fn (s Store) save_label(id string, label Label) ! {
	mut labels := s.labels()!
	labels[id] = label
	tmp := layout.pending_labels(s.library)
	os.write_file(tmp, json2.encode(labels))!
	os.rename(tmp, layout.labels(s.library))!
}
