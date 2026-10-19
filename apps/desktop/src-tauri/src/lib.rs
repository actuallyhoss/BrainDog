use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

const HOME: &str = "https://brain.dog/app";
const BRIDGE: &str = include_str!("bridge.js");

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
fn notify(app: AppHandle, title: String, body: String) {
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
                // TODO(server): this route does not exist yet. The worker must (1) start Google sign-in when the
                // browser asks for the desktop flavour, (2) end it by redirecting to braindog://auth?code=<one-time>,
                // and (3) serve this page, which swaps the code for the usual session cookie in this window.
                let mut to = home();
                to.set_path("/app/signin/desktop");
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

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let settings = MenuItem::with_id(app, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?;
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
        Submenu::with_items(app, "BrainDog", true, &[&about, &s1, &settings, &s2, &hide, &hide_others, &s3, &quit])?;

    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let all = PredefinedMenuItem::select_all(app, None)?;
    let edit = Submenu::with_items(app, "Edit", true, &[&undo, &redo, &s4, &cut, &copy, &paste, &all])?;

    let go = Submenu::with_items(app, "Go", true, &[&slash])?;

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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
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
            // The web decides what "goto" means; /app/settings is the path it is sent.
            "settings" => {
                focus(app);
                emit(app, "goto", Some("/app/settings"));
            }
            "slash" => {
                focus(app);
                emit(app, "slash", None);
            }
            _ => {}
        })
        .setup(|app| {
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

            let links = handle.clone();
            handle.deep_link().on_open_url(move |event| {
                for u in event.urls() {
                    handle_link(&links, u.as_str());
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("BrainDog failed to start");
}
