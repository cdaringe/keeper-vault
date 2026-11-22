module layout

import os

pub const game_backup_suffix = '.pugbackup'

pub fn numeric(s string) bool {
	return s != '' && s.bytes().all(it >= `0` && it <= `9`)
}

pub fn primary_save(kind string, slot string) string {
	if kind == 'Character' { return os.join_path('saves', slot + '.json') }
	return os.join_path('worlds', slot + '.world.gzip')
}

pub fn metadata_save(kind string, slot string) string {
	if kind == 'Character' { return primary_save(kind, slot) }
	return os.join_path('worldinfos', slot + '.worldinfo')
}

fn save_parts(kind string, slot string) []string {
	primary := primary_save(kind, slot)
	if kind == 'Character' { return [primary] }
	return [primary, metadata_save(kind, slot), os.join_path('worldgenparams', slot + '.json')]
}

pub fn save_files(root string, kind string, slot string) ![]string {
	mut result := []string{}
	for p in save_parts(kind, slot) {
		result << p
		result << p + game_backup_suffix
	}
	if kind == 'Character' {
		dir := 'maps/' + slot
		if os.is_link(os.join_path(root, 'maps')) || os.is_link(os.join_path(root, dir)) {
			return error('Linked map directories are unsupported')
		}
		if os.is_dir(os.join_path(root, dir)) {
			for name in os.ls(os.join_path(root, dir))! {
				base := name.all_before('.')
				if numeric(base) && name in [base + '.mapparts.gzip',
					base + '.mapparts.gzip' + game_backup_suffix] {
					result << os.join_path(dir, name)
				}
			}
		}
	}
	return result
}

pub fn profile_path(args []string) !string {
	if args.len == 1 { return os.real_path(args[0]) }
	if args.len != 0 { return error('Usage: keeper-vault [--serve] [profile-directory]') }
	home := os.home_dir()
	mut matches := []string{}
	for config in [os.config_dir()!, os.join_path(home, 'snap/steam/common/.config'),
		os.join_path(home, '.var/app/com.valvesoftware.Steam/config')] {
		base := os.join_path(config, 'unity3d/Pugstorm/Core Keeper/Steam')
		for account in os.ls(base) or { continue } {
			path := os.real_path(os.join_path(base, account))
			if numeric(account) && path !in matches && (is_profile(path)) {
				matches << path
			}
		}
	}
	if matches.len == 1 { return matches[0] }
	return error('Pass a Core Keeper profile directory. Detected: ' + matches.join(', '))
}

pub fn is_profile(path string) bool {
	return os.is_dir(os.join_path(path, 'worlds')) || os.is_dir(os.join_path(path, 'saves'))
}
