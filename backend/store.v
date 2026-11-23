module main

import os
import layout
import json2

struct Store {
	profile string
	library string
}

struct Label {
	alias  string @[omitempty]
	note   string
	pinned bool
}

fn (label Label) text() string {
	return if label.note != '' { label.note } else { label.alias }
}

enum SaveStatus {
	live @[json: 'Live']
	restore_backup @[json: 'Backup']
	game_backup @[json: 'Game backup']
	manual_backup @[json: 'Manual backup']
	copy @[json: 'Copy']
	checkpoint @[json: 'Checkpoint']
	trashed @[json: 'Trashed']
}

struct Row {
	checkpoint_saves []CheckpointSave
	checkpoint_scope string
	world_created    string
	source_modified  string
	captured         string
	restore_target   string
	id               string
	kind             layout.SaveKind
	slot             string
	name             string
	status           SaveStatus
	created          string
	path             string
	note             string
	pinned           bool
mut:
	matches_active bool
}

struct CheckpointSave {
	kind            layout.SaveKind
	slot            string
	name            string
	source_modified string
}

struct Snapshot {
	source_modified string
	captured        string
	restore_target  string
	kind            layout.SaveKind @[required]
	slot            string
	status          SaveStatus @[required]
	created         string
	hashes          map[string]string
}

fn (s Store) labels() !map[string]Label {
	p := layout.labels(s.library)
	if !os.exists(p) { return map[string]Label{} }
	return json2.decode[map[string]Label](os.read_file(p)!)!
}

fn (s Store) rows() ![]Row {
	labels := s.labels()!
	mut rows := []Row{}
	for kind in [layout.SaveKind.world, .character] {
		path := layout.primary_save(kind, '0')
		dir := os.join_path(s.profile, os.dir(path))
		if !os.is_dir(dir) { continue }
		for file in os.ls(dir)! {
			slot := file.all_before('.')
			if !layout.numeric(slot) || file != os.file_name(layout.primary_save(kind, slot)) {
				continue
			}
			id := '${kind.label()}-${slot}'
			label := labels[id]
			rows << Row{ id: id, kind: kind, slot: slot, name: display_name(s.profile, kind, slot), status: .live, world_created: world_creation_date(s.profile, kind, slot), source_modified: modified_at(os.join_path(dir, file)), path: os.join_path(dir, file), note: label.text(), pinned: label.pinned }
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
			status := if layout.is_trashed_checkpoint(id) { SaveStatus.trashed } else { SaveStatus.checkpoint }
			bundle_labels := bundle.labels()!
			rows << Row{ note: bundle_labels['checkpoint'].text(), id: id, kind: .checkpoint, status: status, name: members.map(it.name + ' (' + it.slot + ')').join(' + '), checkpoint_scope: members.map(it.kind.label() + ': ' + it.name + ' (' + it.slot + ')').join(' · '), checkpoint_saves: members.map(CheckpointSave{ kind: it.kind, slot: it.slot, name: it.name, source_modified: it.source_modified }), created: members[0].created }
			continue
		}
		if !layout.is_snapshot(id) { continue }
		root := os.join_path(s.library, id)
		m := read_manifest(root)!
		if !layout.numeric(m.slot) || m.kind == .checkpoint {
			return error('Invalid snapshot: ' + id)
		}
		label := labels[id]
		rows << Row{
			world_created:   world_creation_date(root, m.kind, m.slot)
			source_modified: m.source_modified
			captured:        m.captured
			id:              id
			kind:            m.kind
			slot:            m.slot
			name:            display_name(root, m.kind, m.slot)
			status:          m.status
			restore_target:  m.restore_target
			created:         m.created
			path:            os.join_path(root, layout.primary_save(m.kind, m.slot))
			note:            label.text()
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
		if row.status == .live || row.kind == .checkpoint { continue }
		key := row.kind.label() + '-' + row.slot
		if key !in current {
			current[key] = slot_hashes(s.profile, row.kind, row.slot)!
		}
		m := read_manifest(os.join_path(s.library, row.id))!
		row.matches_active = m.hashes == current[key]
	}
	return rows
}

fn (s Store) apply(op Operation, id string, value string) !CaptureResult {
	rows := s.rows()!
	if op == .checkpoint {
		return s.capture_checkpoint(rows, id, value)!
	}
	for row in rows {
		if row.id != id { continue }
		root := if row.status == .live { s.profile } else { os.join_path(s.library, row.id) }
		if op == .note && row.status != .trashed {
			if value.runes().len > 1000 {
				return error('Notes can contain up to 1000 characters')
			}
			label := Label{ note: value.trim_space(), pinned: row.pinned }
			if row.kind == .checkpoint {
				bundle := Store{ profile: s.profile, library: root }
				bundle.save_label('checkpoint', label)!
			} else {
				s.save_label(row.id, label)!
			}
			return CaptureResult{}
		}
		if row.kind == .checkpoint {
			if row.status == .trashed {
				match op {
					.recover_checkpoint {
						s.move_checkpoint(row.id, layout.original_checkpoint_id(row.id))!
					}
					.purge_checkpoint {
						if value != row.id {
							return error('Confirm permanent deletion of this checkpoint')
						}
						s.purge_checkpoint(row.id)!
					}
					else { return error('Recover the checkpoint from Trash first') }
				}
				return CaptureResult{}
			}
			if op == .trash_checkpoint {
				s.move_checkpoint(row.id, layout.trashed_id(row.id))!
				return CaptureResult{}
			}
			if op != .restore_checkpoint {
				return error('Choose Restore checkpoint')
			}
			bundle := Store{ profile: s.profile, library: root }
			s.activate(root, bundle.checkpoint_members()!)!
			return CaptureResult{}
		}
		match op {
			.pin { s.save_label(row.id, Label{ note: row.note, pinned: !row.pinned })! }
			.history {
				if row.status != .live { return error('Select a live slot') }
				s.snapshot(root, row.kind, row.slot, .game_backup)!
			}
			.backup {
				if row.status != .live { return error('Select a live slot to back up') }
				s.snapshot(root, row.kind, row.slot, .manual_backup)!
			}
			.copy {
				if row.status != .live {
					verify(root, row)!
					s.snapshot_for_restore(root, row.kind, row.slot, .copy, '',
						original_modified: row.source_modified
					)!
				} else {
					s.snapshot(root, row.kind, row.slot, .copy)!
				}
			}
			.activate {
				if row.status == .live { return error('This save is already live') }
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
