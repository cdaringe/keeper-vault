# Keeper Vault

Keeper Vault is a save manager for Core Keeper on Linux. You can save a checkpoint for a world, a character, or both. When you restore a checkpoint, Keeper Vault backs up your current progress first.

![Keeper Vault showing world and character checkpoints with notes and restore actions](assets/demo.png)

## Download Keeper Vault

Ready-to-run downloads are available for 64-bit x86 Linux. Grab `keeper-vault-linux-x86_64.tar.gz` and its matching `.sha256` file. [Latest release](https://github.com/cdaringe/keeper-vault/releases/latest) · [Older releases](https://github.com/cdaringe/keeper-vault/releases)

Open a terminal in the download directory and check the archive before unpacking it.

```sh
sha256sum -c keeper-vault-linux-x86_64.tar.gz.sha256
tar -xzf keeper-vault-linux-x86_64.tar.gz
```

## Open Keeper Vault

For a desktop window, use your Linux distribution's package manager to install GJS, GTK 3, and WebKitGTK 4.1 with their GObject introspection bindings. Then run `./keeper-vault` from the directory where you unpacked it.

To use your browser, run `./keeper-vault --serve`. You can skip the desktop packages and open <http://127.0.0.1:8741>.

To open a specific save profile, run `./keeper-vault "/path/to/profile"` for the desktop window or `./keeper-vault --serve "/path/to/profile"` for the browser.

For help building from source, see the [contributing guide](CONTRIBUTING.md).
