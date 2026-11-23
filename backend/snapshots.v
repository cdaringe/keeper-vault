module main

import os
import layout
import json2
import time
import crypto.sha256

fn slot_hashes(root string, kind layout.SaveKind, slot string) !map[string]string {
	mut hashes := map[string]string{}
	for rel in layout.save_files(root, kind, slot)! {
		if file_ok(root, rel)! {
			hashes[rel] = sha256.hexhash(os.read_file(os.join_path(root, rel))!)
		}
	}
	return hashes
}

fn file_ok(root string, rel string) !bool {
	path := os.join_path(root, rel)
	if os.is_link(os.dir(path)) || os.is_link(path) {
		return error('Linked save files are unsupported: ' + path)
	}
	if !os.exists(path) { return false }
	if !os.is_file(path) { return error('Expected a file: ' + path) }
	return true
}

fn (s Store) snapshot(root string, kind layout.SaveKind, slot string, status SaveStatus) ! {
	s.snapshot_for_restore(root, kind, slot, status, '')!
}

@[params]
struct SnapshotSource {
	original_modified ?string
}

fn (s Store) snapshot_for_restore(root string, kind layout.SaveKind, slot string, status SaveStatus, restore_target string, source_info SnapshotSource) ! {
	tmp := layout.staging(s.library)
	os.mkdir(tmp)!
	defer { if os.is_dir(tmp) { os.rmdir_all(tmp) or {} } }
	mut hashes := map[string]string{}
	previous := status == .game_backup
	captured := time.now().format_ss_milli()
	mut created := captured
	mut target := layout.snapshot_id()
	if previous {
		primary := os.join_path(root, layout.primary_save(kind, slot) + layout.game_backup_suffix)
		if !os.is_file(primary) { return }
		created = time.unix(os.file_last_mod_unix(primary)).local().format_ss()
	}
	for rel in layout.save_files(root, kind, slot)! {
		source := if previous {
			rel.trim_string_right(layout.game_backup_suffix) + layout.game_backup_suffix
		} else {
			rel
		}
		if !file_ok(root, source)! {
			// An incomplete previous write cannot represent this slot safely.
			if previous && file_ok(root, rel)! { return }
			continue
		}
		out := os.join_path(tmp, rel)
		os.mkdir_all(os.dir(out))!
		copy_with_save_time(os.join_path(root, source), out)!
		hashes[rel] = sha256.hexhash(os.read_file(out)!)
	}
	if layout.primary_save(kind, slot) !in hashes { return error('Missing primary save file') }
	source_modified := source_info.original_modified or { modified_at(os.join_path(tmp, layout.primary_save(kind, slot))) }
	manifest := Snapshot{ captured: captured, source_modified: source_modified, kind: kind, slot: slot, status: status, created: created, restore_target: restore_target, hashes: hashes }
	os.write_file(layout.manifest(tmp), json2.encode(manifest))!
	if previous {
		mut keys := hashes.keys()
		keys.sort()
		mut identity := [kind.label(), slot, created]
		for key in keys {
			identity << key
			identity << hashes[key]
		}
		target = layout.game_backup_id(sha256.hexhash(identity.join('|')))
		if os.is_dir(os.join_path(s.library, target)) { return }
	}
	os.rename(tmp, os.join_path(s.library, target))!
}

fn verify(root string, row Row) ! {
	m := json2.decode[Snapshot](os.read_file(layout.manifest(root))!)!
	files := layout.save_files(root, row.kind, row.slot)!
	for rel in m.hashes.keys() {
		if rel !in files { return error('Snapshot integrity check failed: ' + rel) }
	}
	for rel in files {
		exists := file_ok(root, rel)!
		if exists != (rel in m.hashes) || (exists && sha256.hexhash(os.read_file(os.join_path(root, rel))!) != m.hashes[rel]) {
			return error('Snapshot integrity check failed: ' + rel)
		}
	}
	if layout.primary_save(row.kind, row.slot) !in m.hashes { return error('Incomplete snapshot') }
}

fn read_manifest(root string) !Snapshot {
	return json2.decode[Snapshot](os.read_file(layout.manifest(root))!)!
}
