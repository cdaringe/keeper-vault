module main

import os
import json2
import layout

fn display_name(root string, kind string, slot string) string {
	path := layout.metadata_save(kind, slot)
	raw := os.read_file(os.join_path(root, path)) or { return 'Unnamed ${kind.to_lower()}' }
	// Unity saves may contain an unquoted Infinity in a timer field.
	doc := json2.decode[json2.Any](raw, json5: true) or { return 'Unnamed ${kind.to_lower()}' }
	if kind == 'World' { return doc.as_map()['name'] or { return 'Unnamed world' }.str() }
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
	return 'Unnamed ${kind.to_lower()}'
}
