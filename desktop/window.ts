interface GtkWindow {
  set_wmclass(instance: string, name: string): void;
  add(view: WebView): void;
  connect(signal: string, callback: () => void): void;
  show_all(): void;
}
interface WebView {
  load_uri(uri: string): void;
}
declare const ARGV: string[];
declare const imports: {
  gi: {
    versions: Record<string, string>;
    GLib: {
      getenv(name: string): string | null;
      set_prgname(value: string): void;
      set_application_name(value: string): void;
    };
    Gtk: {
      init(args: null): void;
      Window: new (options: Record<string, string | number>) => GtkWindow;
      main_quit(): void;
      main(): void;
    };
    WebKit2: { WebView: new () => WebView };
  };
};
// GTK owns the window; the embedded WebKit view renders the save manager.
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.WebKit2 = '4.1';
const { GLib, Gtk, WebKit2 } = imports.gi;
GLib.set_prgname('keeper-vault');
GLib.set_application_name('Keeper Vault');
Gtk.init(null);

const appWindow = new Gtk.Window({
  title: GLib.getenv('KEEPER_PREVIEW')
    ? 'Keeper Vault · Disposable preview'
    : 'Keeper Vault',
  default_width: 1024,
  default_height: 760,
  icon_name: 'applications-games',
});
appWindow.set_wmclass('keeper-vault', 'KeeperVault');
const view = new WebKit2.WebView();
appWindow.add(view);
appWindow.connect('destroy', () => Gtk.main_quit());
view.load_uri(ARGV[0]);
appWindow.show_all();
Gtk.main();
