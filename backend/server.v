module main

import net.http
import net.urllib
import sync
import json2

enum Operation {
	unknown
	checkpoint
	note
	recover_checkpoint
	purge_checkpoint
	trash_checkpoint
	restore_checkpoint
	pin
	history
	backup
	copy
	activate
}

struct Command {
	dangerous_mode bool
	op             string
	id             string
	value          string
}

struct App {
	store_lock &sync.Mutex = sync.new_mutex()
	store      Store
	addr       string
	token      string
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
		return reply($embed_file('../dist/vault.html').to_string().replace('__TOKEN__', a.token), 'text/html; charset=utf-8', .ok)
	}
	token := req.header.get_custom('X-Vault-Key') or { '' }
	if token != a.token { return reply('Invalid session', 'text/plain', .forbidden) }
	if req.url == '/game-status' && req.method == .get {
		running := game_running() or { return reply('Process list unavailable', 'text/plain', .service_unavailable) }
		return reply(json2.encode(running), 'application/json', .ok)
	}
	// Idle webview sockets must not monopolize the server. Only store access is serialized.
	a.store_lock.lock()
	defer { a.store_lock.unlock() }
	mut capture := CaptureResult{}
	if req.url == '/action' && req.method == .post {
		c := json2.decode[Command](req.data) or { return reply('Invalid command', 'text/plain', .bad_request) }
		op := Operation.from(c.op) or { Operation.unknown }
		if op in [.activate, .restore_checkpoint] && !c.dangerous_mode {
			running := game_running() or { return reply('Unable to check if Core Keeper is running. Try again.', 'text/plain', .service_unavailable) }
			if running {
				return reply('Restore blocked. Quit Core Keeper or turn on Dangerous mode.', 'text/plain', .locked)
			}
		}
		capture = a.store.apply(op, c.id, c.value) or { return reply(err.msg(), 'text/plain', .conflict) }
	} else if req.url != '/saves' || req.method != .get {
		return reply('Unknown route', 'text/plain', .not_found)
	}
	rows := a.store.visible_rows() or { return reply(err.msg(), 'text/plain', .internal_server_error) }
	mut response := reply(json2.encode(rows), 'application/json', .ok)
	response.header.add_custom('X-Profile-Path', urllib.path_escape(a.store.profile)) or {}
	if capture.id != '' {
		response.header.add_custom('X-Checkpoint-Id', capture.id) or {}
		response.header.add_custom('X-Checkpoint-Reused', capture.reused.str()) or {}
	}
	return response
}
