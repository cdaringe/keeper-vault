# Contributing to Keeper Vault

## Build from source

To build Keeper Vault, install Node.js 22.18 or newer, pnpm (or Corepack), GNU Make, Git, and a C compiler. For the desktop window, you'll also need GJS, GTK 3, and WebKitGTK 4.1 with their GObject introspection bindings.

Run this from the project directory to build and open the app.

```sh
make run
```

Make fetches V if needed. To open a specific save profile, run `make run PROFILE="/path/to/profile"`.

## Preview and test changes

The V backend lives in `backend/` and the Solid frontend lives in `frontend/`. Run `make fmt` to format your changes and `make check` to build and run the tests.

The browser tests look for Chromium, Chrome, or Brave on your PATH, then fall back to Playwright’s installed browser. Set `BROWSER=/path/to/chromium` to pick the browser yourself.

Tests and previews require Bubblewrap (`bwrap`). It gives each run a temporary workspace, separate application data, and its own process namespace. The host filesystem stays read-only, and each run checks that it can't write outside the workspace.

Use `make preview FIXTURE="/path/to/fixture/local"` when you want to try a change by hand. The preview opens a copy of the fixture and deletes its saves, library, and browser data when it closes. Save `make run` for everyday use, since it opens your normal library. Keep test profiles out of your desktop launchers.

Run `make test FIXTURE="/path/to/fixture/local"` to test the save lifecycle with a disposable copy of a profile.

To see whether an existing checkpoint can be restored, run `make test-recovery CHECKPOINT="/path/to/checkpoint-directory"`. The test copies the checkpoint into the sandbox, changes the temporary saves, then restores through the app's HTTP API. It checks each restored file against the checkpoint's recorded hash. The original checkpoint stays read-only throughout.

## Version tags

Commit the changes you want to release, then choose the version bump.

```sh
make version -- patch
make version -- minor
make version -- major
```

The command starts from the highest stable `X.Y.Z` tag in your local repository, or from `0.0.0` if there aren't any. A minor bump resets the patch number to zero, and a major bump resets both the minor and patch numbers.

The command adds an annotated tag to your current commit and leaves your project files alone. Push the new tag separately to start the release workflow. You can try the command in a temporary repository with `make test-version`.
