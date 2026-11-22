module main

import os
import layout

fn (s Store) checkpoint_members() ![]Row {
	mut members := s.library_rows(map[string]Label{})!
	members.sort(a.kind > b.kind)
	if members.len == 0 || members.len > 2 || members.any(it.kind !in ['World', 'Character']) || (members.len == 2 && members[0].kind == members[1].kind) {
		return error('Invalid checkpoint members')
	}
	return members
}

struct CaptureResult {
	id     string
	reused bool
}

fn (s Store) capture_checkpoint(rows []Row, world_id string, character_id string) !CaptureResult {
	selected := rows.filter(it.status == 'Live' && ((it.kind == 'World' && it.id == world_id) || (it.kind == 'Character' && it.id == character_id)))
	if selected.len == 0 || (world_id != '' && !selected.any(it.kind == 'World')) || (character_id != '' && !selected.any(it.kind == 'Character')) {
		return error('Choose an available world, character, or both')
	}
	mut live := map[string]map[string]string{}
	for row in selected { live[row.id] = slot_hashes(s.profile, row.kind, row.slot)! }
	mut candidates := rows.filter(it.status == 'Checkpoint')
	candidates.sort(a.created > b.created)
	for candidate in candidates {
		bundle := Store{ profile: s.profile, library: os.join_path(s.library, candidate.id) }
		members := bundle.checkpoint_members()!
		if members.len != selected.len { continue }
		mut matches := true
		for member in members {
			key := member.kind + '-' + member.slot
			if key !in live {
				matches = false
				break
			}
			manifest := read_manifest(os.join_path(bundle.library, member.id))!
			if manifest.hashes != live[key] {
				matches = false
				break
			}
		}
		if matches {
			for member in members { verify(os.join_path(bundle.library, member.id), member)! }
			return CaptureResult{ id: candidate.id, reused: true }
		}
	}

	tmp := layout.staging(s.library)
	os.mkdir(tmp)!
	defer { if os.is_dir(tmp) { os.rmdir_all(tmp) or {} } }
	bundle := Store{ profile: s.profile, library: tmp }
	for row in selected { bundle.snapshot(s.profile, row.kind, row.slot, 'Copy')! }
	id := layout.checkpoint_id()
	os.rename(tmp, os.join_path(s.library, id))!
	return CaptureResult{ id: id }
}

fn (s Store) move_checkpoint(id string, destination string) ! {
	root := os.join_path(s.library, id)
	target := os.join_path(s.library, destination)
	if os.is_link(root) || os.is_link(target) || os.exists(target) {
		return error('Checkpoint cannot be moved to that location')
	}
	os.rename(root, target)!
}

fn (s Store) purge_checkpoint(id string) ! {
	root := os.join_path(s.library, id)
	if os.is_link(root) { return error('Cannot delete a linked checkpoint') }
	// Unpublish the complete bundle before removing either member.
	tmp := layout.staging(s.library)
	os.rename(root, tmp)!
	os.rmdir_all(tmp)!
}
