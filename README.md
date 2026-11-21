# Keeper Vault

A Linux save manager for Core Keeper, written in V with a GTK desktop window and an embedded WebKitGTK interface. Each live character and world gets its own row. Pin favorites, give saves an alias, or use the row menu (also available by right-click) to copy the save path.

## Run

Build with V 0.5.2 (tested with commit `9621aa0`). Linux, GNU coreutils and a filesystem supporting atomic directory exchange are required.

```sh
v -o keeper-vault .
./keeper-vault "/path/to/profile"
```

The default command opens a standalone Keeper Vault window. Desktop mode requires GJS, GTK 3 and the WebKitGTK 4.1 introspection bindings. Closing the window exits the app and releases the profile lock.

To add **Keeper Vault** to your Linux application menu, run `python3 desktop/install.py "/path/to/profile"` after building. The launcher references the executable in this checkout. Omit the profile argument to use autodetection. The profile is the account directory containing `worlds/` or `saves/`. With no profile argument, Keeper Vault looks for a single Linux Steam profile under native, Snap and Flatpak installations.

For browser or headless operation, use `./keeper-vault --serve "/path/to/profile"`, then open http://127.0.0.1:8741. Set `KEEPER_PORT` to change the port in this mode.

## Retry a boss fight

1. Get ready at the arena, save and quit Core Keeper, and let Steam finish syncing.
2. In **Boss practice**, select the local world and character you will play. Choose **Set pre-fight checkpoint**.
3. Play the fight. To retry, quit the game, wait for sync, then choose **Retry fight → Restore both**. Reopen the same world with the same character.
4. Reuse the same checkpoint for each attempt. Each retry backs up both current slots and restores the pair in one profile exchange. A remote host’s world must be managed on the host.

## Copies and activation

Select **Go back** on a live save to see that slot’s restore points, newest first. Each point shows its age, exact local time, and source. At startup and whenever you open a slot’s history, Keeper Vault imports the previous save from the game’s matching `.pugbackup` files when a complete set exists. The date shown for a game backup comes from its primary file. Opening history again preserves existing points and picks up a new game backup if available.

The **Active slots** view shows the version currently installed in each game slot. Choose **Back up now** on a world or character, then **View backups** to see its timestamped manual backup. Choose **Restore** beside a point to return to that version. To undo a rewind, restore the **Before restore** entry created by that action. Close the game and wait for Steam Cloud to finish syncing before copying or activating live data. The app manages the local profile. Steam handles cloud synchronization.

World copies include world data, world info and generation parameters. Character copies include the character JSON and that character's explored map files. Both include matching game-created `.pugbackup` files. Aliases and pins persist separately from game files. Labels on a live row apply to that slot.

Activation checks snapshot hashes and stages a duplicate of the profile beside the original, so allow free space for one profile. It saves the occupied destination slot as a library backup before exchanging the directories atomically. An empty destination can be restored directly. To undo an activation, open **Backups** and activate the previous version.

The library lives under `$XDG_DATA_HOME/keeper-vault` (default `~/.local/share/keeper-vault`), keyed by the absolute profile path. Keep the library when moving or reinstalling the app.

## Integration tests

Supply a fixture **copy** containing a world and a character. The Python standard-library test launches the compiled V server against a fresh temporary duplicate. It compares the full profile before and after activation, restores automatic backups, checks pin and alias persistence across restarts, and rejects a damaged snapshot.

```sh
python3 tests/integration.py ./keeper-vault "/path/to/fixture/local"
```
