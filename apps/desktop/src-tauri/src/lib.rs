use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

const HOME: &str = "https://app.brain.dog/";
/// Set once Cmd+Q (or any exit) starts, so a close that arrives during quitting is not turned into a hide.
static QUITTING: AtomicBool = AtomicBool::new(false);

/// Where a clicked notification should land. macOS gives no click callback here, so the next time the window comes
/// forward within this long of the notification, the app goes to its item.
const CLICK_WINDOW: Duration = Duration::from_secs(60);
struct Pending(Mutex<Option<(String, Instant)>>);

const BRIDGE: &str = include_str!("bridge.js");

/// The Go menu: menu id, label, shortcut and the path in the app the web is sent. The app is the root of app.brain.dog
/// since 29 Oct; the web still reads an `/app/...` path an older build sends as the same path without it.
const GO: [(&str, &str, &str, &str); 5] = [
    ("go-today", "Today", "CmdOrCtrl+1", "/"),
    ("go-needs", "Needs you", "CmdOrCtrl+2", "/decide"),
    ("go-projects", "Projects", "CmdOrCtrl+3", "/p/portfolio"),
    ("go-money", "Money", "CmdOrCtrl+4", "/p/money"),
    ("go-agents", "Agents", "CmdOrCtrl+5", "/p/agents"),
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

/// Hand an event to the page's `on('slash' | 'goto', fn)` listeners (the bridge's `emit`).
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

#[tauri::command]
fn open_outside(app: AppHandle, url: String) {
    // Only web and mail links; never a file: or custom scheme a page could use to launch something.
    if let Ok(u) = Url::parse(&url) {
        if matches!(u.scheme(), "http" | "https" | "mailto") {
            let _ = app.opener().open_url(u.as_str(), None::<&str>);
        }
    }
}

#[tauri::command]
fn notify(app: AppHandle, title: String, body: String, goto: Option<String>) {
    if let Some(to) = goto {
        *app.state::<Pending>().0.lock().unwrap() = Some((to, Instant::now()));
    }
    let _ = app.notification().builder().title(title).body(body).show();
}

#[tauri::command]
fn set_badge(window: WebviewWindow, count: i64) {
    let _ = window.set_badge_count(if count > 0 { Some(count) } else { None });
}

#[tauri::command]
fn start_drag(window: WebviewWindow) {
    let _ = window.start_dragging();
}

/// A braindog:// link: `auth?code=...` finishes Google sign-in, `goto/<path>` moves the app.
fn handle_link(app: &AppHandle, raw: &str) {
    let Ok(u) = Url::parse(raw) else { return };
    if u.scheme() != "braindog" {
        return;
    }
    match u.host_str() {
        Some("auth") => {
            if let Some((_, code)) = u.query_pairs().find(|(k, _)| k == "code") {
                // The worker ends the desktop flavour of Google sign-in here; this page swaps the code for the cookie.
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
            let _ = app.notification().builder().title("BrainDog").body("An update is ready. Quit and reopen to use it.").show();
        }
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let settings = MenuItem::with_id(app, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?;
    let login = CheckMenuItem::with_id(
        app,
        "autostart",
        "Open at login",
        true,
        app.autolaunch().is_enabled().unwrap_or(false),
        None::<&str>,
    )?;
    let slash = MenuItem::with_id(app, "slash", "Slash", true, Some("CmdOrCtrl+K"))?;
    let about = PredefinedMenuItem::about(app, Some("About BrainDog"), None)?;
    let hide = PredefinedMenuItem::hide(app, None)?;
    let hide_others = PredefinedMenuItem::hide_others(app, None)?;
    let quit = PredefinedMenuItem::quit(app, None)?;
    let (s1, s2, s3, s4) = (
        PredefinedMenuItem::separator(app)?,
        PredefinedMenuItem::separator(app)?,
        PredefinedMenuItem::separator(app)?,
        PredefinedMenuItem::separator(app)?,
    );
    let app_menu =
        Submenu::with_items(app, "BrainDog", true, &[&about, &s1, &settings, &login, &s2, &hide, &hide_others, &s3, &quit])?;

    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let all = PredefinedMenuItem::select_all(app, None)?;
    let edit = Submenu::with_items(app, "Edit", true, &[&undo, &redo, &s4, &cut, &copy, &paste, &all])?;

    let mut go_items: Vec<MenuItem<tauri::Wry>> = Vec::new();
    for (id, label, key, _) in GO {
        go_items.push(MenuItem::with_id(app, id, label, true, Some(key))?);
    }
    // Settings keeps Cmd+, in the app menu; the Go copy has no shortcut so the two never clash.
    let go_settings = MenuItem::with_id(app, "go-settings", "Settings", true, None::<&str>)?;
    let go_sep = PredefinedMenuItem::separator(app)?;
    let mut go_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = go_items.iter().map(|i| i as _).collect();
    go_refs.push(&go_settings);
    go_refs.push(&go_sep);
    go_refs.push(&slash);
    let go = Submenu::with_items(app, "Go", true, &go_refs)?;

    let minimize = PredefinedMenuItem::minimize(app, None)?;
    let maximize = PredefinedMenuItem::maximize(app, None)?;
    let close = PredefinedMenuItem::close_window(app, None)?;
    let window = Submenu::with_items(app, "Window", true, &[&minimize, &maximize, &close])?;

    Menu::with_items(app, &[&app_menu, &edit, &go, &window])
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
                    // Alt+Space from anywhere: window forward, Slash open.
                    if event.state() == ShortcutState::Pressed {
                        focus(app);
                        emit(app, "slash", None);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![open_outside, notify, set_badge, start_drag])
        .menu(|app| build_menu(app))
        .on_menu_event(|app, event| match event.id().as_ref() {
            // The web decides what "goto" means; /settings is the path it is sent.
            "settings" | "go-settings" => {
                focus(app);
                emit(app, "goto", Some("/settings"));
            }
            "slash" => {
                focus(app);
                emit(app, "slash", None);
            }
            "autostart" => {
                let login = app.autolaunch();
                let on = login.is_enabled().unwrap_or(false);
                let _ = if on { login.disable() } else { login.enable() };
                // Show what is true now, not what the click assumed, if the system refused.
                let now = login.is_enabled().unwrap_or(on);
                if let Some(item) = app.menu().and_then(|m| m.get("autostart")) {
                    if let Some(c) = item.as_check_menuitem() {
                        let _ = c.set_checked(now);
                    }
                }
            }
            id => {
                if let Some((_, _, _, path)) = GO.iter().find(|g| g.0 == id) {
                    focus(app);
                    emit(app, "goto", Some(path));
                }
            }
        })
        // Closing (the red button, Cmd+W) hides the window and the app keeps running, as Discord does.
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } if !QUITTING.load(Ordering::SeqCst) => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(true) => {
                let app = window.app_handle();
                let to = app.state::<Pending>().0.lock().unwrap().take();
                if let Some((to, at)) = to {
                    if at.elapsed() < CLICK_WINDOW {
                        emit(app, "goto", Some(&to));
                    }
                }
            }
            _ => {}
        })
        .setup(|app| {
            app.manage(Pending(Mutex::new(None)));
            let handle = app.handle().clone();
            let start = home();
            let origin = origin_of(&start);
            let script = BRIDGE.replace("__ORIGIN__", &origin);

            let nav_app = handle.clone();
            let nav_origin = origin.clone();
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(start))
                .title("BrainDog")
                .inner_size(1280.0, 840.0)
                .min_inner_size(420.0, 560.0)
                .initialization_script(&script)
                // Our own origin stays in the window. Everything else (Google sign-in included, which refuses to
                // run in an app window) goes to the default browser instead.
                .on_navigation(move |url| {
                    if matches!(url.scheme(), "about" | "tauri") || origin_of(url) == nav_origin {
                        return true;
                    }
                    if matches!(url.scheme(), "http" | "https" | "mailto") {
                        let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                });

            // The overlay title bar keeps the traffic lights over the app's own top bar (the web adds --shell-inset).
            #[cfg(target_os = "macos")]
            let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);

            builder.build()?;

            let _ = handle.notification().request_permission();
            let _ = handle.global_shortcut().register("Alt+Space");

            // Look for a signed update at launch; it installs and says so, and applies at the next start.
            let updating = handle.clone();
            tauri::async_runtime::spawn(async move { check_update(updating).await });

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
