module main

import os
import json2
import net
import net.http
import rand
import crypto.sha256

struct App {
	store Store
	addr  string
	token string
}

fn reply(body string, mime string, status http.Status) http.Response {
	mut header := http.new_header_from_map({
		http.CommonHeader.content_type:  mime
		http.CommonHeader.cache_control: 'no-store'
	})
	header.add_custom('X-Frame-Options', 'DENY') or {}
	return http.new_response(body: body, header: header, status: status)
}

fn (mut a App) handle(req http.Request) http.Response {
	if (req.header.get(.host) or { '' }) != a.addr {
		return reply('Invalid host', 'text/plain', .forbidden)
	}
	if req.method == .get && req.url == '/' {
		return reply($embed_file('vault.html').to_string().replace('__TOKEN__', a.token), 'text/html; charset=utf-8', .ok)
	}
	token := req.header.get_custom('X-Vault-Key') or { '' }
	if token != a.token { return reply('Invalid session', 'text/plain', .forbidden) }
	if req.url == '/action' && req.method == .post {
		c := json2.decode[Command](req.data) or { return reply('Invalid command', 'text/plain', .bad_request) }
		a.store.apply(c) or { return reply(err.msg(), 'text/plain', .conflict) }
	} else if req.url != '/saves' || req.method != .get {
		return reply('Unknown route', 'text/plain', .not_found)
	}
	rows := a.store.visible_rows() or { return reply(err.msg(), 'text/plain', .internal_server_error) }
	return reply(json2.encode(rows), 'application/json', .ok)
}

fn profile_path(args []string) !string {
	if args.len == 1 { return os.real_path(args[0]) }
	if args.len != 0 { return error('Usage: keeper-vault [--serve] [profile-directory]') }
	home := os.home_dir()
	mut matches := []string{}
	for config in [os.config_dir()!, home + '/snap/steam/common/.config',
		home + '/.var/app/com.valvesoftware.Steam/config'] {
		base := os.join_path(config, 'unity3d/Pugstorm/Core Keeper/Steam')
		for account in os.ls(base) or { continue } {
			path := os.real_path(base + '/' + account)
			if numeric(account) && path !in matches && (os.is_dir(path + '/worlds') || os.is_dir(path + '/saves')) {
				matches << path
			}
		}
	}
	if matches.len == 1 { return matches[0] }
	return error('Pass a Core Keeper profile directory. Detected: ' + matches.join(', '))
}

fn main() {
	serve := os.args.len > 1 && os.args[1] == '--serve'
	args := if serve { os.args[2..] } else { os.args[1..] }
	profile := profile_path(args) or {
		eprintln(err)
		exit(1)
	}
	if !os.is_dir(profile + '/worlds') && !os.is_dir(profile + '/saves') {
		eprintln('Expected a profile containing worlds or saves')
		exit(1)
	}
	data := os.getenv_opt('XDG_DATA_HOME') or { os.home_dir() + '/.local/share' }
	library := os.join_path(data, 'keeper-vault', sha256.hexhash(profile))
	if os.real_path(library).starts_with(profile + '/') {
		eprintln('Library must be outside the profile')
		exit(1)
	}
	os.mkdir_all(library, mode: 0o700) or { panic(err) }
	// A sibling lock survives atomic replacement of the profile directory.
	mut guard := os.open_append(os.join_path(os.dir(profile), '.keeper-vault-' + sha256.hexhash(profile) + '.lock')) or { panic(err) }
	defer { guard.close() }
	if C.flock(guard.fd, 6) != 0 {
		eprintln('This profile is already open in Keeper Vault')
		exit(1)
	}
	port := if serve { os.getenv_opt('KEEPER_PORT') or { '8741' } } else { '0' }
	if !numeric(port) || (serve && port.int() < 1) || port.int() > 65535 {
		eprintln('Invalid KEEPER_PORT')
		exit(1)
	}
	listener := net.listen_tcp(.ip, '127.0.0.1:' + port) or { panic(err) }
	addr := listener.addr() or { panic(err) }.str()
	store := Store{ profile: profile, library: library }
	for row in store.rows() or { panic(err) } {
		if row.status == 'Live' {
			store.snapshot(profile, row.kind, row.slot, 'Game backup') or { eprintln('Previous save unavailable for ' + row.name + ': ' + err.msg()) }
		}
	}
	mut server := &http.Server{ listener: listener, addr: addr, worker_num: 1, max_http1_request_body_size: 8192, handler: App{ store: store, addr: addr, token: rand.uuid_v4() } }
	if serve {
		println('Keeper Vault · ' + profile + '\nOpen http://' + addr)
		server.listen_and_serve()
		return
	}
	spawn server.listen_and_serve()
	server.wait_till_running() or { panic(err) }
	result := os.exec(['gjs', '-c', $embed_file('desktop/window.js').to_string(), 'http://' + addr])
	server.close()
	if result.exit_code != 0 {
		eprintln('Could not open Keeper Vault. Check GJS, GTK 3 and WebKitGTK 4.1. ' + result.output)
		exit(1)
	}
}
