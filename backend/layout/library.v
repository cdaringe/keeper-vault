module layout

import os
import crypto.sha256
import rand

const snapshot_prefix = 'save-'
const checkpoint_prefix = 'checkpoint-'

pub fn is_checkpoint(id string) bool {
	return id.starts_with(checkpoint_prefix)
}

pub fn is_snapshot(id string) bool { return id.starts_with(snapshot_prefix) }

pub fn checkpoint_id() string { return checkpoint_prefix + rand.uuid_v4() }

pub fn snapshot_id() string { return snapshot_prefix + rand.uuid_v4() }

pub fn game_backup_id(digest string) string { return snapshot_prefix + 'game-' + digest }

pub fn staging(root string) string { return os.join_path(root, '.stage-' + rand.uuid_v4()) }

pub fn profile_stage(profile string) string {
	return os.join_path(os.dir(profile), '.keeper-stage-' + rand.uuid_v4())
}

pub fn manifest(root string) string { return os.join_path(root, 'snapshot.json') }

pub fn labels(root string) string { return os.join_path(root, 'labels.json') }

pub fn pending_labels(root string) string { return os.join_path(root, '.labels.tmp') }

pub fn library(profile string) string {
	data := os.getenv_opt('XDG_DATA_HOME') or { os.join_path(os.home_dir(), '.local', 'share') }
	return os.join_path(data, 'keeper-vault', sha256.hexhash(profile))
}

pub fn profile_lock(profile string) string {
	return os.join_path(os.dir(profile), '.keeper-vault-' + sha256.hexhash(profile) + '.lock')
}

const trash_prefix = 'trashed-'

pub fn is_trashed_checkpoint(id string) bool {
	return id.starts_with(trash_prefix) && is_checkpoint(original_checkpoint_id(id))
}

pub fn trashed_id(id string) string { return trash_prefix + id }

pub fn original_checkpoint_id(id string) string { return id.trim_string_left(trash_prefix) }
