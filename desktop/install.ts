import { accessSync, constants, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function desktopArg(path: string) {
  if (/[\r\n]/.test(path)) throw Error('Launcher paths must fit on one line.');
  return (
    '"' +
    resolve(path)
      .replace(/[\`"$\\]/g, (c) => '\\' + c)
      .replaceAll('\\', '\\\\')
      .replaceAll('%', '%%') +
    '"'
  );
}
const binary = fileURLToPath(new URL('../keeper-vault', import.meta.url));
accessSync(binary, constants.X_OK);
const args = process.argv.slice(2);
if (args.length > 1) throw Error('Usage: node desktop/install.ts [profile]');
const apps = join(
  process.env.XDG_DATA_HOME || join(homedir(), '.local/share'),
  'applications',
);
mkdirSync(apps, { recursive: true });
const target = join(apps, 'keeper-vault.desktop');
writeFileSync(
  target,
  `[Desktop Entry]
Type=Application
Name=Keeper Vault
Comment=Manage Core Keeper saves and checkpoints
Exec=${[binary, ...args].map(desktopArg).join(' ')}
Icon=applications-games
Terminal=false
Categories=Utility;
StartupWMClass=KeeperVault
`,
);
console.log(target);
