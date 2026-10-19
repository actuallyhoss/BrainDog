// Declaring the commands makes Tauri generate an allow-<name> permission for each, so the remote
// capability can name exactly these four and nothing else.
fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["open_outside", "notify", "set_badge", "start_drag"]),
        ),
    )
    .expect("tauri build failed");
}
