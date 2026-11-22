# Contributing to Keeper Vault

## Build from source

With Node.js 22.18+, pnpm (or Corepack), GNU Make, Git, a C compiler, GJS, GTK 3, and WebKitGTK 4.1 installed:

```sh
make run
```

Make fetches V if needed. To select a save profile, use `make run PROFILE="/path/to/profile"`.

## Develop

V backend in `backend/`, Solid frontend in `frontend/`. Run `make fmt` to format and `make check` to build and test. Browser tests detect Chromium, Chrome, or Brave on your PATH, or use Playwright’s installed browser. Set `BROWSER=/path/to/chromium` to override.

Tests and previews require Bubblewrap (`bwrap`). They run with the host filesystem read-only, a disposable writable workspace, isolated application-data directories, and a separate process namespace. There is no unsandboxed fallback. Each run verifies that writes outside its workspace are rejected.

Use `make preview FIXTURE="/path/to/fixture/local"` for development. It opens a disposable copy and removes its saves, library, and browser data when the preview closes. `make run` opens the real application and uses its normal library; do not use it for development checks or install desktop launchers pointing at test profiles.

Run `make test FIXTURE="/path/to/fixture/local"` to exercise the save lifecycle. To verify an existing checkpoint, run `make test-recovery CHECKPOINT="/path/to/checkpoint-directory"`. The recovery drill copies that checkpoint into the sandbox, changes the disposable saves, restores through the application's HTTP API, and checks every restored file against the checkpoint's recorded hashes. The original checkpoint is read-only throughout.

## Version tags

```sh
make version -- patch
make version -- minor
make version -- major
```

Each command bumps the highest local stable `X.Y.Z` tag and creates an annotated tag on the current commit. Minor and major bumps reset the lower components to zero. With no version tags, the starting version is `0.0.0`. Commit the changes you want released first; the command tags committed content and leaves project files unchanged. Push the new tag separately to trigger the release workflow. Run `make test-version` to test the command in a disposable repository.
