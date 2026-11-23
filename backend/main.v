module main

import os
import net
import net.http
import rand
import layout

#include <sys/file.h>

fn C.flock(int, int) int

fn main() {
	serve := os.args.len > 1 && os.args[1] == '--serve'
	args := if serve { os.args[2..] } else { os.args[1..] }
	profile := layout.profile_path(args) or {
		eprintln(err)
		exit(1)
	}
	if !layout.is_profile(profile) {
		eprintln('Expected a profile containing worlds or saves')
		exit(1)
	}
	library := layout.library(profile)
	if os.real_path(library).starts_with(profile + '/') {
		eprintln('Library must be outside the profile')
		exit(1)
	}
	os.mkdir_all(library, mode: 0o700) or { panic(err) }
	// A sibling lock survives atomic replacement of the profile directory.
	mut guard := os.open_append(layout.profile_lock(profile)) or { panic(err) }
	defer { guard.close() }
	if C.flock(guard.fd, 6) != 0 {
		eprintln('This profile is already open in Keeper Vault')
		exit(1)
	}
	port := if serve { os.getenv_opt('KEEPER_PORT') or { '8741' } } else { '0' }
	if !layout.numeric(port) || (serve && port.int() < 1) || port.int() > 65535 {
		eprintln('Invalid KEEPER_PORT')
		exit(1)
	}
	listener := net.listen_tcp(.ip, '127.0.0.1:' + port) or { panic(err) }
	addr := listener.addr() or { panic(err) }.str()
	store := Store{ profile: profile, library: library }
	for row in store.rows() or { panic(err) } {
		if row.status == .live {
			store.snapshot(profile, row.kind, row.slot, .game_backup) or { eprintln('Previous save unavailable for ' + row.name + ': ' + err.msg()) }
		}
	}
	mut server := &http.Server{ listener: listener, addr: addr, worker_num: 4, max_keep_alive_requests: 1, max_http1_request_body_size: 8192, handler: App{ store: store, addr: addr, token: rand.uuid_v4() } }
	if serve {
		println('Keeper Vault · ' + profile + '\nOpen http://' + addr)
		server.listen_and_serve()
		return
	}
	spawn server.listen_and_serve()
	server.wait_till_running() or { panic(err) }
	result := os.exec(['gjs', '-c', $embed_file('../dist/window.js').to_string(), 'http://' + addr])
	server.close()
	if result.exit_code != 0 {
		eprintln('Could not open Keeper Vault. Check GJS, GTK 3 and WebKitGTK 4.1. ' + result.output)
		exit(1)
	}
}
