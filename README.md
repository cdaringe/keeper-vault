# Keeper Vault

<!-- WARNING: put tasks, contributing, project internals in CONTRIBUTING.md, not here -->

A Linux desktop save manager for Core Keeper. Checkpoint a world, a character, or both. Restoring automatically backs up your current progress.

![Keeper Vault showing world and character checkpoints with notes and restore actions](assets/demo.png)

## Download a precompiled binary

Download `keeper-vault-linux-x86_64.tar.gz` and its matching `.sha256` file from the [latest release](https://github.com/cdaringe/keeper-vault/releases/latest). Older versions are available on the [releases page](https://github.com/cdaringe/keeper-vault/releases).

For the desktop window, install GJS, GTK 3, and WebKitGTK 4.1, including their GObject introspection bindings, through your Linux distribution's package manager. Then, from the download directory:

```sh
sha256sum -c keeper-vault-linux-x86_64.tar.gz.sha256
tar -xzf keeper-vault-linux-x86_64.tar.gz
./keeper-vault
```

To select a save profile, run `./keeper-vault "/path/to/profile"`.

Precompiled releases currently target Linux x86_64. Windows builds are not available yet.

For building from source or contributing, see [CONTRIBUTING.md](CONTRIBUTING.md).
