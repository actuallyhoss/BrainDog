use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::Duration;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    utils::config::BackgroundThrottlingPolicy,
    webview::DownloadEvent,
    AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

const HOME: &str = "https://app.brain.dog/";
/// Where Help > BrainDog Help goes, in the default browser.
const HELP: &str = "https://brain.dog/docs";
/// Set once Cmd+Q (or any exit) starts, so a close that arrives during quitting is not turned into a hide.
static QUITTING: AtomicBool = AtomicBool::new(false);

/// The key from anywhere that brings the window forward with Ask open. On unless the menu's switch turned it off.
const ASK_KEY: &str = "Alt+Space";
/// The file whose presence says the person turned that key off (in the app's config folder).
const ASK_KEY_OFF: &str = "ask-key-off";

/// Set once the window has started showing a page of ours; a launch that has not within `OFFLINE_AFTER` shows the
/// bundled "could not reach" page (ui/index.html) instead of a blank window.
static LOADED: AtomicBool = AtomicBool::new(false);
const OFFLINE_AFTER: Duration = Duration::from_secs(15);

/// A running app is rarely quit (closing hides it), so the update feed is asked again this often, not only at launch.
const UPDATE_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
/// Set once an update is downloaded and installed; it applies at the next start, so the feed is not asked again.
static UPDATED: AtomicBool = AtomicBool::new(false);

/// The page's zoom (View menu), one step of `ZOOMS` at a time.
struct Zoom(Mutex<f64>);
const ZOOMS: [f64; 9] = [0.5, 0.67, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0];

/// Where each download is being saved, by its address, until it finishes and the page is told.
struct Downloads(Mutex<HashMap<String, PathBuf>>);

/// Embedded frames the app shows from another origin, let through as frames (`on_navigation` is called for every
/// frame, not only the window): Cloudflare's check on sign-up and sign-in. The window itself never goes there.
const FRAMES: [&str; 1] = ["challenges.cloudflare.com"];

const BRIDGE: &str = include_str!("bridge.js");

/// The Go menu: menu id, label, shortcut and the path in the app the web is sent. Only the two places every BrainDog
/// has; the rest of the nav is the page's own (`g` then 1 to 9), since add-on pages differ from one BrainDog to the next.
const GO: [(&str, &str, &str, &str); 2] = [
    ("go-today", "Today", "CmdOrCtrl+1", "/"),
    ("go-needs", "Needs you", "CmdOrCtrl+2", "/decide"),
];

/// Where the window opens. A debug build may point at a local web app with BRAINDOG_URL; a release never does.
fn home() -> Url {
    if cfg!(debug_assertions) {
        if let Some(u) = std::env::var("BRAINDOG_URL").ok().and_then(|s| Url::parse(&s).ok()) {
            return u;
        }
    }
    Url::parse(HOME).expect("home url")
}

fn origin_of(u: &Url) -> String {
    u.origin().ascii_serialization()
}

/// The bundled page that says BrainDog could not be reached, with a way back to `home`.
fn offline_page() -> Url {
    let mut u = Url::parse("tauri://localhost/index.html").expect("offline url");
    u.query_pairs_mut().append_pair("to", home().as_str());
    u
}

/// Hand an event to the page's `on('slash' | 'search' | 'goto' | 'saved' | 'unsaved', fn)` listeners (the bridge's `emit`).
fn emit(app: &AppHandle, event: &str, arg: Option<&str>) {
    if let Some(w) = app.get_webview_window("main") {
        let arg = arg.map(|s| serde_json::to_string(s).unwrap_or_default()).unwrap_or_else(|| "undefined".into());
        let _ = w.eval(format!("window.__BRAINDOG_SHELL__&&window.__BRAINDOG_SHELL__.emit('{event}',{arg})"));
    }
}

fn focus(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Watch the load under way: if no page of ours has started showing within `OFFLINE_AFTER`, show the bundled one.
/// `LOADED` is cleared by the caller before the load starts, so a page that answers at once is never missed.
fn watch_load(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(OFFLINE_AFTER);
        if !LOADED.load(Ordering::SeqCst) {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.navigate(offline_page());
            }
        }
    });
}

/// View > Reload: the page again where the window is on BrainDog, and BrainDog's start from the offline page.
fn reload(app: &AppHandle) {
    let Some(w) = app.get_webview_window("main") else { return };
    let ours = w.url().map(|u| origin_of(&u) == origin_of(&home())).unwrap_or(false);
    if ours {
        let _ = w.eval("location.reload()");
    } else {
        LOADED.store(false, Ordering::SeqCst);
        let _ = w.navigate(home());
        watch_load(app);
    }
}

/// View > Zoom In, Zoom Out (one step) and Actual Size (`step` 0).
fn zoom(app: &AppHandle, step: i32) {
    let state = app.state::<Zoom>();
    let mut now = state.0.lock().unwrap();
    let next = match step {
        0 => 1.0,
        s if s > 0 => ZOOMS.iter().copied().find(|z| *z > *now + 0.001).unwrap_or(*now),
        _ => ZOOMS.iter().rev().copied().find(|z| *z < *now - 0.001).unwrap_or(*now),
    };
    *now = next;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_zoom(next);
    }
}

/// The app's own settings file, in its config folder.
fn setting(app: &AppHandle, name: &str) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(name))
}

/// Whether ⌥Space should open Ask: yes until the person turns it off in the app menu.
fn ask_key_wanted(app: &AppHandle) -> bool {
    !setting(app, ASK_KEY_OFF).map(|p| p.exists()).unwrap_or(false)
}

/// Take or give back ⌥Space, keep the choice, and say whether the key is really ours now (another app may own it).
fn set_ask_key(app: &AppHandle, on: bool, keep: bool) -> bool {
    let keys = app.global_shortcut();
    let now = if on {
        keys.is_registered(ASK_KEY) || keys.register(ASK_KEY).is_ok()
    } else {
        let _ = keys.unregister(ASK_KEY);
        false
    };
    if keep {
        if let Some(p) = setting(app, ASK_KEY_OFF) {
            if on {
                let _ = std::fs::remove_file(&p);
            } else if let Some(dir) = p.parent() {
                let _ = std::fs::create_dir_all(dir);
                let _ = std::fs::write(&p, b"");
            }
        }
    }
    now
}

/// Tick a check item to what is true, not to what the click assumed.
fn tick(app: &AppHandle, id: &str, on: bool) {
    if let Some(item) = app.menu().and_then(|m| m.get(id)) {
        if let Some(c) = item.as_check_menuitem() {
            let _ = c.set_checked(on);
        }
    }
}

#[tauri::command]
fn open_outside(app: AppHandle, url: String) {
    // Only web and mail links; never a file: or custom scheme a page could use to launch something.
    if let Ok(u) = Url::parse(&url) {
        if matches!(u.scheme(), "http" | "https" | "mailto") {
            let _ = app.opener().open_url(u.as_str(), None::<&str>);
        }
    }
}

/// A notification. `goto` rides inside it, so a click on that notification (and nothing else) takes the window there.
#[tauri::command]
fn notify(app: AppHandle, title: String, body: String, goto: Option<String>) {
    let mut n = app.notification().builder().title(title).body(body);
    if let Some(to) = goto {
        n = n.extra("goto", to);
    }
    let _ = n.show();
}

#[tauri::command]
fn set_badge(window: WebviewWindow, count: i64) {
    let _ = window.set_badge_count(if count > 0 { Some(count) } else { None });
}

#[tauri::command]
fn start_drag(window: WebviewWindow) {
    let _ = window.start_dragging();
}

/// A double click on the title strip does what System Settings says a title bar's does: zoom (the default), minimise,
/// or nothing.
#[tauri::command]
async fn title_double_click(window: WebviewWindow) {
    let said = std::process::Command::new("defaults")
        .args(["read", "-g", "AppleActionOnDoubleClick"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
    match said.as_str() {
        "Minimize" => {
            let _ = window.minimize();
        }
        "None" => {}
        _ => {
            let _ = if window.is_maximized().unwrap_or(false) { window.unmaximize() } else { window.maximize() };
        }
    }
}

/// A braindog:// link: `auth?code=...` finishes a sign-in begun in this window (Google, or an emailed link opened in the
/// browser), `goto/<path>` moves the app.
fn handle_link(app: &AppHandle, raw: &str) {
    let Ok(u) = Url::parse(raw) else { return };
    if u.scheme() != "braindog" {
        return;
    }
    match u.host_str() {
        Some("auth") => {
            if let Some((_, code)) = u.query_pairs().find(|(k, _)| k == "code") {
                // The browser hands the sign-in back here; this page swaps the code for the cookie in the window.
                let mut to = home();
                to.set_path("/signin/desktop");
                to.query_pairs_mut().append_pair("code", &code);
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.navigate(to);
                }
            }
        }
        Some("goto") => emit(app, "goto", Some(u.path())),
        _ => {}
    }
    focus(app);
}

/// Ask the update feed (tauri.conf.json, plugins.updater) and install what is signed. Any failure is silent: no feed
/// yet, offline and a bad signature all mean "no update", and the app keeps running.
async fn check_update(app: AppHandle) {
    let Ok(updater) = app.updater() else { return };
    if let Ok(Some(update)) = updater.check().await {
        if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
            UPDATED.store(true, Ordering::SeqCst);
            let _ = app.notification().builder().title("BrainDog").body("An update is ready. Quit and reopen to use it.").show();
        }
    }
}

/// At launch and then every `UPDATE_EVERY`, until one update is installed.
fn watch_updates(app: AppHandle) {
    let _ = std::thread::Builder::new().name("updates".into()).spawn(move || {
        while !UPDATED.load(Ordering::SeqCst) {
            tauri::async_runtime::block_on(check_update(app.clone()));
            std::thread::sleep(UPDATE_EVERY);
        }
    });
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    let login = CheckMenuItem::with_id(
        app,
        "autostart",
        "Open at login",
        true,
        app.autolaunch().is_enabled().unwrap_or(false),
        None::<&str>,
    )?;
    // Ticked once setup has really taken the key (`set_ask_key`); unticked until then.
    let ask_key = CheckMenuItem::with_id(app, "ask-key", "Open Ask with ⌥Space", true, false, None::<&str>)?;
    let about = PredefinedMenuItem::about(app, Some("About BrainDog"), None)?;
    let hide = PredefinedMenuItem::hide(app, None)?;
    let hide_others = PredefinedMenuItem::hide_others(app, None)?;
    let quit = PredefinedMenuItem::quit(app, None)?;
    let sep = || PredefinedMenuItem::separator(app);
    let app_menu = Submenu::with_items(
        app,
        "BrainDog",
        true,
        &[&about, &sep()?, &settings, &login, &ask_key, &sep()?, &hide, &hide_others, &sep()?, &quit],
    )?;

    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let all = PredefinedMenuItem::select_all(app, None)?;
    let edit = Submenu::with_items(app, "Edit", true, &[&undo, &redo, &sep()?, &cut, &copy, &paste, &all])?;

    // The page hears these keys first and opens the same surfaces; the menu names them and catches them when it does not.
    let reload = MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?;
    let actual = MenuItem::with_id(app, "zoom-reset", "Actual Size", true, Some("CmdOrCtrl+0"))?;
    let zoom_in = MenuItem::with_id(app, "zoom-in", "Zoom In", true, Some("CmdOrCtrl+="))?;
    let zoom_out = MenuItem::with_id(app, "zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
    let full = PredefinedMenuItem::fullscreen(app, None)?;
    let view = Submenu::with_items(app, "View", true, &[&reload, &sep()?, &actual, &zoom_in, &zoom_out, &sep()?, &full])?;

    let mut go_items: Vec<MenuItem<tauri::Wry>> = Vec::new();
    for (id, label, key, _) in GO {
        go_items.push(MenuItem::with_id(app, id, label, true, Some(key))?);
    }
    // Settings keeps Cmd+, in the app menu; the Go copy has no shortcut so the two never clash.
    let go_settings = MenuItem::with_id(app, "go-settings", "Settings", true, None::<&str>)?;
    let search = MenuItem::with_id(app, "search", "Search", true, Some("CmdOrCtrl+K"))?;
    let slash = MenuItem::with_id(app, "slash", "Ask Slash", true, Some("CmdOrCtrl+J"))?;
    let go_sep = sep()?;
    let mut go_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = go_items.iter().map(|i| i as _).collect();
    go_refs.push(&go_settings);
    go_refs.push(&go_sep);
    go_refs.push(&search);
    go_refs.push(&slash);
    let go = Submenu::with_items(app, "Go", true, &go_refs)?;

    let minimize = PredefinedMenuItem::minimize(app, None)?;
    let maximize = PredefinedMenuItem::maximize(app, None)?;
    let close = PredefinedMenuItem::close_window(app, None)?;
    let window = Submenu::with_items(app, "Window", true, &[&minimize, &maximize, &close])?;

    let help_item = MenuItem::with_id(app, "help", "BrainDog Help", true, None::<&str>)?;
    let help = Submenu::with_items(app, "Help", true, &[&help_item])?;

    Menu::with_items(app, &[&app_menu, &edit, &view, &go, &window, &help])
}

pub fn run() {
    tauri::Builder::default()
        // A second launch (or a braindog:// click while running) brings the first window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| focus(app)))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        // Off until the menu's "Open at login" is ticked; nothing registers a login item before that.
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // ⌥Space from anywhere: window forward, Ask open.
                    if event.state() == ShortcutState::Pressed {
                        focus(app);
                        emit(app, "slash", None);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![open_outside, notify, set_badge, start_drag, title_double_click])
        .menu(|app| build_menu(app))
        .on_menu_event(|app, event| match event.id().as_ref() {
            // The web decides what "goto" means; /settings is the path it is sent.
            "settings" | "go-settings" => {
                focus(app);
                emit(app, "goto", Some("/settings"));
            }
            "search" => {
                focus(app);
                emit(app, "search", None);
            }
            "slash" => {
                focus(app);
                emit(app, "slash", None);
            }
            "reload" => reload(app),
            "zoom-in" => zoom(app, 1),
            "zoom-out" => zoom(app, -1),
            "zoom-reset" => zoom(app, 0),
            "help" => {
                let _ = app.opener().open_url(HELP, None::<&str>);
            }
            "autostart" => {
                let login = app.autolaunch();
                let on = login.is_enabled().unwrap_or(false);
                let _ = if on { login.disable() } else { login.enable() };
                tick(app, "autostart", login.is_enabled().unwrap_or(on));
            }
            "ask-key" => {
                let now = set_ask_key(app, !app.global_shortcut().is_registered(ASK_KEY), true);
                tick(app, "ask-key", now);
            }
            id => {
                if let Some((_, _, _, path)) = GO.iter().find(|g| g.0 == id) {
                    focus(app);
                    emit(app, "goto", Some(path));
                }
            }
        })
        // Closing (the red button, Cmd+W) hides the window and the app keeps running, as Discord does.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if !QUITTING.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            app.manage(Zoom(Mutex::new(1.0)));
            app.manage(Downloads(Mutex::new(HashMap::new())));
            let handle = app.handle().clone();
            let start = home();
            let origin = origin_of(&start);
            let script = BRIDGE.replace("__ORIGIN__", &origin);

            let nav_app = handle.clone();
            let nav_origin = origin.clone();
            let load_origin = origin.clone();
            let saving = handle.clone();
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(start))
                .title("BrainDog")
                .inner_size(1280.0, 840.0)
                .min_inner_size(420.0, 560.0)
                .initialization_script(&script)
                // Closing only hides the window, and the Dock badge and alerts are fed by the page's own polling, so
                // the page keeps running at full speed while hidden (macOS 14 and later; earlier ones throttle it).
                .background_throttling(BackgroundThrottlingPolicy::Disabled)
                // Our own origin stays in the window. Everything else (Google sign-in included, which refuses to
                // run in an app window) goes to the default browser instead, except the frames the app embeds.
                .on_navigation(move |url| {
                    if matches!(url.scheme(), "about" | "tauri") || origin_of(url) == nav_origin {
                        return true;
                    }
                    if url.scheme() == "https" && url.host_str().is_some_and(|h| FRAMES.contains(&h)) {
                        return true;
                    }
                    if matches!(url.scheme(), "http" | "https" | "mailto") {
                        let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .on_page_load(move |_window, payload| {
                    if origin_of(payload.url()) == load_origin {
                        LOADED.store(true, Ordering::SeqCst);
                    }
                })
                // An export or a backup the page hands over: saved in Downloads (a number added if the name is taken,
                // as a browser does), and the page says where once it is there.
                .on_download(move |_webview, event| {
                    let state = saving.state::<Downloads>();
                    match event {
                        DownloadEvent::Requested { url, destination } => {
                            state.0.lock().unwrap().insert(url.to_string(), destination.clone());
                        }
                        DownloadEvent::Finished { url, success, .. } => {
                            let to = state.0.lock().unwrap().remove(url.as_str());
                            let name = to
                                .as_ref()
                                .and_then(|p| p.file_name())
                                .map(|n| n.to_string_lossy().into_owned())
                                .unwrap_or_else(|| "The file".into());
                            emit(&saving, if success { "saved" } else { "unsaved" }, Some(&name));
                        }
                        _ => {}
                    }
                    true
                });

            // The overlay title bar keeps the traffic lights over the app's own top bar (the web adds --shell-inset).
            #[cfg(target_os = "macos")]
            let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);

            builder.build()?;
            watch_load(&handle);

            // macOS asks for notification permission the first time one is shown, which the page does only once
            // somebody is signed in and the Settings switch is on; nothing is asked at launch.
            let clicks = handle.clone();
            let _ = handle.notification().on_action(move |done| {
                if done.action_id() != "tap" {
                    return;
                }
                focus(&clicks);
                let to = done.notification().and_then(|n| n.extra().get("goto")).and_then(|v| v.as_str());
                if let Some(to) = to {
                    emit(&clicks, "goto", Some(to));
                }
            });

            if ask_key_wanted(&handle) {
                let now = set_ask_key(&handle, true, false);
                tick(&handle, "ask-key", now);
            }

            // Look for a signed update at launch and every few hours; it installs, says so, and applies at the next start.
            watch_updates(handle.clone());

            let links = handle.clone();
            handle.deep_link().on_open_url(move |event| {
                for u in event.urls() {
                    handle_link(&links, u.as_str());
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("BrainDog failed to start")
        .run(|app, event| match event {
            // Cmd+Q: let the close through from here on.
            RunEvent::ExitRequested { .. } => QUITTING.store(true, Ordering::SeqCst),
            // A Dock click with the window hidden brings it back.
            RunEvent::Reopen { .. } => focus(app),
            _ => {}
        });
}
