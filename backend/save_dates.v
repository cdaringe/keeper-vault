module main

import json2
import layout
import os
import time

struct WorldCalendarDate {
	year  int
	month int
	day   int
}

struct WorldDates {
	creation_date WorldCalendarDate @[json: 'creationDate']
}

fn world_creation_date(root string, kind layout.SaveKind, slot string) string {
	if kind != .world { return '' }
	raw := os.read_file(os.join_path(root, layout.metadata_save(kind, slot))) or { return '' }
	metadata := json2.decode[WorldDates](raw, json5: true) or { return '' }
	date := metadata.creation_date
	if date.year < 1 || date.month < 1 || date.month > 12 { return '' }
	days := time.days_in_month(date.month, date.year) or { return '' }
	if date.day < 1 || date.day > days { return '' }
	return '${date.year:04}-${date.month:02}-${date.day:02}'
}

fn modified_at(path string) string {
	seconds := os.file_last_mod_unix(path)
	if seconds <= 0 { return '' }
	return time.unix(seconds).local().format_ss()
}

fn copy_with_save_time(src string, dest string) ! {
	mtime := os.file_last_mod_unix(src)
	os.cp(src, dest)!
	if mtime > 0 { os.utime(dest, mtime, mtime)! }
}
