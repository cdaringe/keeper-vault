"""Exercise the running V app using a fresh duplicate of a supplied save fixture."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def digest_tree(root):
    return {p.relative_to(root): hashlib.sha256(p.read_bytes()).digest()
            for p in root.rglob('*') if p.is_file()}


@contextmanager
def server(binary, profile, data):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    env = dict(os.environ, KEEPER_PORT=str(port), XDG_DATA_HOME=str(data))
    proc = subprocess.Popen([binary, '--serve', profile], env=env)
    try:
        for _ in range(100):
            if proc.poll() is not None:
                raise RuntimeError('Server exited')
            try:
                page = urlopen(base, timeout=3).read().decode()
                break
            except HTTPError:
                raise
            except URLError:
                time.sleep(.05)
        else:
            raise RuntimeError('Server startup timed out')
        key = re.search(r"const key\s*=\s*'([^']+)'", page)[1]

        def call(op=None, entry=None, value=''):
            body = json.dumps(dict(op=op, id=entry, value=value)).encode() if op else None
            req = Request(base + ('/action' if op else '/saves'), data=body,
                          headers={'X-Vault-Key': key})
            return json.load(urlopen(req, timeout=20))

        yield call
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def run(binary, fixture):
    initial = digest_tree(fixture)
    with tempfile.TemporaryDirectory() as work:
        profile = Path(work) / 'profile'
        data = Path(work) / 'library'
        shutil.copytree(fixture, profile)
        with server(binary, profile, data) as call:
            live = call()
            world, character = [next(r for r in live if r['status'] == 'Live' and r['kind'] == kind)
                                for kind in ('World', 'Character')]
            manual = next(r for r in call('backup', world['id']) if r['status'] == 'Manual backup')
            assert manual['matches_active']
            assert Path(manual['path']).read_bytes() == Path(world['path']).read_bytes()
            assert digest_tree(profile) == initial
            captured = call('boss', world['id'], character['id'])
            checkpoint = next(r for r in captured if r['kind'] == 'Boss')
            for attempt in range(2):
                failed = {}
                for member in (world, character):
                    path = Path(member['path'])
                    failed[member['kind']] = path.read_bytes() + bytes([attempt])
                    path.write_bytes(failed[member['kind']])
                retried = call('retry', checkpoint['id'])
                assert digest_tree(profile) == initial
                for kind, content in failed.items():
                    assert any(r['status'] == 'Backup' and r['kind'] == kind and
                               Path(r['path']).read_bytes() == content for r in retried)
            live = call()
            previous = next(r for r in live if r['kind'] == 'World' and r['status'] == 'Game backup')
            world = next(r for r in live if r['status'] == 'Live' and r['kind'] == 'World' and r['slot'] == previous['slot'])
            refreshed = call('history', world['id'])
            assert {r['id'] for r in refreshed} == {r['id'] for r in live}
            path = Path(world['path'])
            expected = Path(str(path) + '.pugbackup').read_bytes()
            rows = call('activate', previous['id'])
            assert path.read_bytes() == expected
            undo = next(r for r in rows if r['status'] == 'Backup' and r['kind'] == 'World' and Path(r['path']).read_bytes() == (fixture / path.relative_to(profile)).read_bytes())
            call('activate', undo['id'])
            assert digest_tree(profile) == initial
            for kind in ('World', 'Character'):
                row = next(r for r in live if r['kind'] == kind)
                assert row['name']
                path = Path(row['path'])
                before = path.read_bytes()
                rows = call('copy', row['id'])
                copy = next(r for r in rows if r['kind'] == kind and r['status'] == 'Copy')
                assert Path(copy['path']).read_bytes() == before
                modified = before + b' '
                path.write_bytes(modified)
                if kind == 'Character':
                    extra = profile / 'maps' / row['slot'] / '999.mapparts.gzip'
                    extra.parent.mkdir(exist_ok=True, parents=True)
                    extra.write_bytes(b'newly explored')
                altered = digest_tree(profile)
                rows = call('activate', copy['id'])
                assert digest_tree(profile) == initial
                backup = next(r for r in rows if r['kind'] == kind and r['status'] == 'Backup' and Path(r['path']).read_bytes() == modified)
                assert Path(backup['path']).read_bytes() == modified
                call('activate', backup['id'])
                assert digest_tree(profile) == altered
                call('activate', copy['id'])
                assert digest_tree(profile) == initial
            call('alias', copy['id'], 'Before boss')
            call('pin', copy['id'])
        with server(binary, profile, data) as call:
            saved = next(r for r in call() if r['id'] == copy['id'])
            assert saved['pinned'] and saved['alias'] == 'Before boss'
            Path(saved['path']).write_bytes(b'incomplete')
            try:
                call('activate', saved['id'])
            except HTTPError as exc:
                assert exc.code == 409 and b'integrity' in exc.read()
            else:
                raise AssertionError('Damaged snapshot was accepted')
            assert digest_tree(profile) == initial
    assert digest_tree(fixture) == initial
    print('PASS: list, copy, activate, backup recovery, persistent labels and integrity checks')


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('binary', type=Path)
    cli.add_argument('fixture', type=Path)
    args = cli.parse_args()
    run(args.binary.resolve(), args.fixture.resolve())
