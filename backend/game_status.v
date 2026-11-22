module main

import os
import layout

// Linux exposes the task name in comm, including the .exe name for many
// Proton games. Match the game itself, not Steam or a launcher command line.
fn game_running() !bool {
	for pid in os.ls('/proc')! {
		if !layout.numeric(pid) { continue }
		dir := os.join_path('/proc', pid)
		name := os.read_file(os.join_path(dir, 'comm')) or { continue }
		if name.trim_space().to_lower() !in ['corekeeper', 'corekeeper.exe'] { continue }
		stat := os.read_file(os.join_path(dir, 'stat')) or { continue }
		if !stat.all_after_last(') ').starts_with('Z ') { return true }
	}
	return false
}
