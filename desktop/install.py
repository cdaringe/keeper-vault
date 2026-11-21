"""Install a current-user app launcher for this checkout's compiled binary."""
import argparse
import os
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('profile', type=Path, nargs='?')
args = parser.parse_args()
binary = Path(__file__).resolve().parents[1] / 'keeper-vault'
if not os.access(binary, os.X_OK):
    parser.error('Build keeper-vault before installing its launcher.')


def desktop_arg(path):
    value = str(path.resolve())
    if any(c in value for c in '\r\n'):
        parser.error('A launcher path cannot contain a newline.')
    for c in ('\\', '"', '`', '$'):
        value = value.replace(c, '\\' + c)
    return '"' + value.replace('\\', '\\\\').replace('%', '%%') + '"'


command = desktop_arg(binary)
if args.profile:
    command += ' ' + desktop_arg(args.profile)
apps = Path(os.getenv('XDG_DATA_HOME') or Path.home() / '.local/share') / 'applications'
apps.mkdir(parents=True, exist_ok=True)
target = apps / 'keeper-vault.desktop'
target.write_text(f'''[Desktop Entry]
Type=Application
Name=Keeper Vault
Comment=Manage Core Keeper saves and boss checkpoints
Exec={command}
Icon=applications-games
Terminal=false
Categories=Utility;
StartupWMClass=KeeperVault
''')
print(target)
