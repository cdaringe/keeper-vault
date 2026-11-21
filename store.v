module main

import os
import json2
import rand
import time
import crypto.sha256

#include <stdio.h>
#include <sys/file.h>

fn C.renameat2(int, &char, int, &char, u32) int
fn C.flock(int, int) int

struct Store {
	profile string
	library string
}

struct Label {
	alias  string
	pinned bool
}

struct Row {
	id      string
	kind    string
	slot    string
	name    string
	status  string
	created string
	path    string
	alias   string
	pinned  bool
mut:
	matches_active bool
}

struct Snapshot {
	kind    string
	slot    string
	status  string
	created string
	hashes  map[string]string
}

struct Command {
	op    string
	id    string
	value string
}

fn numeric(s string) bool {
	return s != '' && s.bytes().all(it >= `0` && it <= `9`)
}

fn parts(kind string, slot string) []string {
	if kind == 'Character' { return ['saves/${slot}.json'] }
	return ['worlds/${slot}.world.gzip', 'worldinfos/${slot}.worldinfo', 'worldgenparams/${slot}.json']
}

fn endpoints(root string, kind string, slot string) ![]string {
	mut result := []string{}
	for p in parts(kind, slot) {
		result << p
		result << p + '.pugbackup'
	}
	if kind == 'Character' {
		dir := 'maps/' + slot
		if os.is_link(root + '/maps') || os.is_link(root + '/' + dir) {
			return error('Linked map directories are unsupported')
		}
		if os.is_dir(root + '/' + dir) {
			for name in os.ls(root + '/' + dir)! {
				base := name.all_before('.')
				if numeric(base) && name in [base + '.mapparts.gzip',
					base + '.mapparts.gzip.pugbackup'] {
					result << dir + '/' + name
				}
			}
		}
	}
	return result
}

fn display_name(root string, kind string, slot string) string {
	files := parts(kind, slot)
	path := if kind == 'World' { files[1] } else { files[0] }
	raw := os.read_file(os.join_path(root, path)) or { return '${kind} ${slot}' }
	doc := json2.decode[json2.Any](raw) or { return '${kind} ${slot}' }
	if kind == 'World' { return doc.as_map()['name'] or { return 'World ${slot}' }.str() }
	for field in ['characterCustomizationNew', 'characterCustomization'] {
		custom := doc.as_map()[field] or { continue }
		name := custom.as_map()['name'] or { continue }
		if name is string { return name }
		data := name.as_map()['bytes'] or { continue }
		first := data.as_map()['offset0000'] or { continue }
		mut bytes := []u8{}
		for i in 0 .. 30 {
			block := if i < 16 { first } else { data }
			b := block.as_map()['byte${i:04}'] or { break }
			if b.int() == 0 { break }
			bytes << u8(b.int())
		}
		if bytes.len > 0 { return bytes.bytestr() }
	}
	return '${kind} ${slot}'
}

fn (s Store) labels() !map[string]Label {
	p := s.library + '/labels.json'
	if !os.exists(p) { return map[string]Label{} }
	return json2.decode[map[string]Label](os.read_file(p)!)!
}

fn (s Store) rows() ![]Row {
	labels := s.labels()!
	mut rows := []Row{}
	for kind in ['World', 'Character'] {
		path := parts(kind, '0')[0]
		dir := os.join_path(s.profile, os.dir(path))
		if !os.is_dir(dir) { continue }
		for file in os.ls(dir)! {
			slot := file.all_before('.')
			if !numeric(slot) || file != os.file_name(parts(kind, slot)[0]) { continue }
			id := '${kind}-${slot}'
			label := labels[id]
			rows << Row{ id: id, kind: kind, slot: slot, name: display_name(s.profile, kind, slot), status: 'Live', path: dir + '/' + file, alias: label.alias, pinned: label.pinned }
		}
	}
	rows << s.library_rows(labels)!
	return rows
}

fn (s Store) library_rows(labels map[string]Label) ![]Row {
	mut rows := []Row{}
	for id in os.ls(s.library)! {
		if id.starts_with('boss-') {
			bundle := Store{ profile: s.profile, library: s.library + '/' + id }
			pair := bundle.boss_pair()!
			world := pair[0]
			character := pair[1]
			rows << Row{ id: id, kind: 'Boss', status: 'Boss checkpoint', name: world.name + ' (world ' + world.slot + ') + ' + character.name + ' (character ' + character.slot + ')', created: world.created }
			continue
		}
		if !id.starts_with('save-') { continue }
		root := s.library + '/' + id
		m := json2.decode[Snapshot](os.read_file(root + '/snapshot.json')!)!
		if !numeric(m.slot) || m.kind !in ['World', 'Character'] {
			return error('Invalid snapshot: ' + id)
		}
		label := labels[id]
		rows << Row{ id: id, kind: m.kind, slot: m.slot, name: display_name(root, m.kind, m.slot), status: m.status, created: m.created, path: root + '/' + parts(m.kind, m.slot)[0], alias: label.alias, pinned: label.pinned }
	}
	return rows
}

// Compare each slot once per listing. Several restore points can contain the
// same version, and the game can change the slot between Vault sessions.
fn (s Store) visible_rows() ![]Row {
	mut rows := s.rows()!
	mut current := map[string]map[string]string{}
	for mut row in rows {
		if row.status == 'Live' || row.kind == 'Boss' { continue }
		key := row.kind + '-' + row.slot
		if key !in current {
			mut hashes := map[string]string{}
			for rel in endpoints(s.profile, row.kind, row.slot)! {
				if file_ok(s.profile, rel)! {
					hashes[rel] = sha256.hexhash(os.read_file(s.profile + '/' + rel)!)
				}
			}
			current[key] = hashes
		}
		m := json2.decode[Snapshot](os.read_file(s.library + '/' + row.id + '/snapshot.json')!)!
		row.matches_active = m.hashes == current[key]
	}
	return rows
}

fn file_ok(root string, rel string) !bool {
	path := root + '/' + rel
	if os.is_link(os.dir(path)) || os.is_link(path) {
		return error('Linked save files are unsupported: ' + path)
	}
	if !os.exists(path) { return false }
	if !os.is_file(path) { return error('Expected a file: ' + path) }
	return true
}

fn (s Store) snapshot(root string, kind string, slot string, status string) ! {
	id := rand.uuid_v4()
	tmp := s.library + '/.stage-' + id
	os.mkdir(tmp)!
	defer { if os.is_dir(tmp) { os.rmdir_all(tmp) or {} } }
	mut hashes := map[string]string{}
	previous := status == 'Game backup'
	mut created := time.now().format_ss()
	mut target := 'save-' + id
	if previous {
		primary := root + '/' + parts(kind, slot)[0] + '.pugbackup'
		if !os.is_file(primary) { return }
		created = time.unix(os.file_last_mod_unix(primary)).local().format_ss()
	}
	for rel in endpoints(root, kind, slot)! {
		source := if previous { rel.trim_string_right('.pugbackup') + '.pugbackup' } else { rel }
		if !file_ok(root, source)! {
			// An incomplete previous write cannot represent this slot safely.
			if previous && file_ok(root, rel)! { return }
			continue
		}
		out := tmp + '/' + rel
		os.mkdir_all(os.dir(out))!
		os.cp(root + '/' + source, out)!
		hashes[rel] = sha256.hexhash(os.read_file(out)!)
	}
	if parts(kind, slot)[0] !in hashes { return error('Missing primary save file') }
	manifest := Snapshot{ kind: kind, slot: slot, status: status, created: created, hashes: hashes }
	os.write_file(tmp + '/snapshot.json', json2.encode(manifest))!
	if previous {
		mut keys := hashes.keys()
		keys.sort()
		mut identity := [kind, slot, created]
		for key in keys {
			identity << key
			identity << hashes[key]
		}
		target = 'save-game-' + sha256.hexhash(identity.join('|'))
		if os.is_dir(s.library + '/' + target) { return }
	}
	os.rename(tmp, s.library + '/' + target)!
}

fn verify(root string, row Row) ! {
	m := json2.decode[Snapshot](os.read_file(root + '/snapshot.json')!)!
	files := endpoints(root, row.kind, row.slot)!
	for rel in m.hashes.keys() {
		if rel !in files { return error('Snapshot integrity check failed: ' + rel) }
	}
	for rel in files {
		exists := file_ok(root, rel)!
		if exists != (rel in m.hashes) || (exists && sha256.hexhash(os.read_file(root + '/' + rel)!) != m.hashes[rel]) {
			return error('Snapshot integrity check failed: ' + rel)
		}
	}
	if parts(row.kind, row.slot)[0] !in m.hashes { return error('Incomplete snapshot') }
}

fn (s Store) boss_pair() ![]Row {
	mut members := s.library_rows(map[string]Label{})!
	if members.len != 2 { return error('Incomplete boss checkpoint') }
	members.sort(a.kind > b.kind)
	if members[0].kind != 'World' || members[1].kind != 'Character' {
		return error('Invalid boss checkpoint')
	}
	return members
}

fn (s Store) capture_boss(rows []Row, world_id string, character_id string) ! {
	tmp := s.library + '/.boss-' + rand.uuid_v4()
	os.mkdir(tmp)!
	defer { if os.is_dir(tmp) { os.rmdir_all(tmp) or {} } }
	bundle := Store{ profile: s.profile, library: tmp }
	for row in rows {
		if row.status == 'Live' && ((row.id == world_id && row.kind == 'World') || (row.id == character_id && row.kind == 'Character')) {
			bundle.snapshot(s.profile, row.kind, row.slot, 'Copy')!
		}
	}
	bundle.boss_pair()!
	os.rename(tmp, s.library + '/boss-' + rand.uuid_v4())!
}

fn (s Store) activate(library string, members []Row) ! {
	for row in members { verify(library + '/' + row.id, row)! }
	// Stage beside the profile so Linux can exchange both directories atomically.
	tmp := os.join_path(os.dir(s.profile), '.keeper-stage-' + rand.uuid_v4())
	defer { if os.is_dir(tmp) { os.rmdir_all(tmp) or {} } }
	result := os.exec(['cp', '-a', '--reflink=auto', '--', s.profile, tmp])
	if result.exit_code != 0 { return error(result.output) }
	for row in members {
		root := library + '/' + row.id
		current := endpoints(tmp, row.kind, row.slot)!
		mut occupied := false
		for rel in current { if file_ok(tmp, rel)! { occupied = true } }
		if occupied { s.snapshot(tmp, row.kind, row.slot, 'Backup')! }
		for rel in current {
			if file_ok(tmp, rel)! { os.rm(tmp + '/' + rel)! }
		}
		for rel in endpoints(root, row.kind, row.slot)! {
			if file_ok(root, rel)! {
				os.mkdir_all(os.dir(tmp + '/' + rel))!
				os.cp(root + '/' + rel, tmp + '/' + rel)!
			}
		}
	}
	if C.renameat2(-100, tmp.str, -100, s.profile.str, 2) != 0 {
		return error('Linux could not exchange the staged profile. Check filesystem support and permissions.')
	}
}

fn (s Store) apply(c Command) ! {
	rows := s.rows()!
	if c.op == 'boss' {
		s.capture_boss(rows, c.id, c.value)!
		return
	}
	for row in rows {
		if row.id != c.id { continue }
		root := if row.status == 'Live' { s.profile } else { s.library + '/' + row.id }
		if row.kind == 'Boss' {
			if c.op != 'retry' { return error('Select Retry for a boss checkpoint') }
			bundle := Store{ profile: s.profile, library: root }
			s.activate(root, bundle.boss_pair()!)!
			return
		}
		match c.op {
			'pin', 'alias' {
				mut labels := s.labels()!
				if c.value.len > 240 { return error('Alias is too long') }
				labels[row.id] = if c.op == 'pin' {
					Label{ alias: row.alias, pinned: !row.pinned }
				} else {
					Label{ alias: c.value.trim_space(), pinned: row.pinned }
				}
				tmp := s.library + '/.labels.tmp'
				os.write_file(tmp, json2.encode(labels))!
				os.rename(tmp, s.library + '/labels.json')!
			}
			'history' {
				if row.status != 'Live' { return error('Select a live slot') }
				s.snapshot(root, row.kind, row.slot, 'Game backup')!
			}
			'backup' {
				if row.status != 'Live' { return error('Select a live slot to back up') }
				s.snapshot(root, row.kind, row.slot, 'Manual backup')!
			}
			'copy' {
				if row.status != 'Live' { verify(root, row)! }
				s.snapshot(root, row.kind, row.slot, 'Copy')!
			}
			'activate' {
				if row.status == 'Live' { return error('This save is already live') }
				s.activate(s.library, [row])!
			}
			else { return error('Unknown action') }
		}
		return
	}
	return error('Save no longer exists')
}
