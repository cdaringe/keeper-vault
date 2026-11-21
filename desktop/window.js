// GTK owns the window; the embedded WebKit view renders the save manager.
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.WebKit2 = '4.1';
const {GLib, Gtk, WebKit2} = imports.gi;
GLib.set_prgname('keeper-vault');
GLib.set_application_name('Keeper Vault');
Gtk.init(null);

const window = new Gtk.Window({
    title: 'Keeper Vault',
    default_width: 1024,
    default_height: 760,
    icon_name: 'applications-games',
});
window.set_wmclass('keeper-vault', 'KeeperVault');
const view = new WebKit2.WebView();
window.add(view);
window.connect('destroy', () => Gtk.main_quit());
view.load_uri(ARGV[0]);
window.show_all();
Gtk.main();
