module main

import os
import layout

#include <stdio.h>
#include <sys/file.h>

fn C.renameat2(int, &char, int, &char, u32) int

fn (s Store) activate(library string, members []Row) ! {
	for row in members { verify(os.join_path(library, row.id), row)! }
	// Stage beside the profile so Linux can exchange both directories atomically.
	tmp := layout.profile_stage(s.profile)
	defer { if os.is_dir(tmp) { os.rmdir_all(tmp) or {} } }
	result := os.exec(['cp', '-a', '--reflink=auto', '--', s.profile, tmp])
	if result.exit_code != 0 { return error(result.output) }
	for row in members {
		root := os.join_path(library, row.id)
		current := layout.save_files(tmp, row.kind, row.slot)!
		mut occupied := false
		for rel in current { if file_ok(tmp, rel)! { occupied = true } }
		if occupied {
			target := if library == s.library { row.id } else { os.file_name(library) }
			s.snapshot_for_restore(tmp, row.kind, row.slot, .restore_backup, target)!
		}
		for rel in current {
			if file_ok(tmp, rel)! { os.rm(os.join_path(tmp, rel))! }
		}
		for rel in layout.save_files(root, row.kind, row.slot)! {
			if file_ok(root, rel)! {
				os.mkdir_all(os.dir(os.join_path(tmp, rel)))!
				copy_with_save_time(os.join_path(root, rel), os.join_path(tmp, rel))!
			}
		}
	}
	if C.renameat2(-100, tmp.str, -100, s.profile.str, 2) != 0 {
		return error('Linux could not exchange the staged profile. Check filesystem support and permissions.')
	}
}
