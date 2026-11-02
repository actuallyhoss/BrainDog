import AppKit
import Carbon.HIToolbox
import Observation
import SwiftUI

/// A key combination as the system's hot keys take it: a virtual key code, Carbon's modifier bits, and how it is said
/// ("⌥Space"). Kept in the app's defaults; the default is Option+Space (plan 3.9, the ⌥Space panel).
struct Shortcut: Codable, Equatable, Sendable {
    var keyCode: UInt32
    var modifiers: UInt32
    var key: String

    static let optionSpace = Shortcut(keyCode: UInt32(kVK_Space), modifiers: UInt32(optionKey), key: "Space")

    /// "⌃⌥⇧⌘" in the order the Mac's menus write them, then the key.
    var said: String {
        var s = ""
        if modifiers & UInt32(controlKey) != 0 { s += "⌃" }
        if modifiers & UInt32(optionKey) != 0 { s += "⌥" }
        if modifiers & UInt32(shiftKey) != 0 { s += "⇧" }
        if modifiers & UInt32(cmdKey) != 0 { s += "⌘" }
        return s + key
    }

    /// The same keys for a SwiftUI menu item, so the menu shows the shortcut where it is set.
    var menuModifiers: SwiftUI.EventModifiers {
        var f: SwiftUI.EventModifiers = []
        if modifiers & UInt32(controlKey) != 0 { f.insert(.control) }
        if modifiers & UInt32(optionKey) != 0 { f.insert(.option) }
        if modifiers & UInt32(shiftKey) != 0 { f.insert(.shift) }
        if modifiers & UInt32(cmdKey) != 0 { f.insert(.command) }
        return f
    }

    /// The key as a menu item takes it, where a menu can show it (not the function keys).
    var keyEquivalent: KeyEquivalent? {
        switch key {
        case "Space": return " "
        case "Return": return .return
        case "Tab": return .tab
        case "Delete": return .delete
        case "Esc": return .escape
        case "←": return .leftArrow
        case "→": return .rightArrow
        case "↑": return .upArrow
        case "↓": return .downArrow
        default: return key.count == 1 ? KeyEquivalent(Character(key.lowercased())) : nil
        }
    }

    /// A key pressed in the Settings recorder, if it can be a shortcut: it needs ⌘, ⌥ or ⌃ (a lone letter would be taken
    /// from every app's typing), unless it is a function key.
    init?(event: NSEvent) {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        var m: UInt32 = 0
        if flags.contains(.control) { m |= UInt32(controlKey) }
        if flags.contains(.option) { m |= UInt32(optionKey) }
        if flags.contains(.shift) { m |= UInt32(shiftKey) }
        if flags.contains(.command) { m |= UInt32(cmdKey) }
        let code = Int(event.keyCode)
        let function = Self.functionKeys[code] != nil
        guard function || m & UInt32(cmdKey | optionKey | controlKey) != 0 else { return nil }
        let name = Self.named[code] ?? Self.functionKeys[code] ?? (event.charactersIgnoringModifiers ?? "").uppercased()
        guard !name.isEmpty, !Self.modifierOnly.contains(code) else { return nil }
        self.init(keyCode: UInt32(code), modifiers: m, key: name)
    }

    init(keyCode: UInt32, modifiers: UInt32, key: String) {
        self.keyCode = keyCode
        self.modifiers = modifiers
        self.key = key
    }

    private static let named: [Int: String] = [
        kVK_Space: "Space", kVK_Return: "Return", kVK_Tab: "Tab", kVK_Delete: "Delete", kVK_Escape: "Esc",
        kVK_LeftArrow: "←", kVK_RightArrow: "→", kVK_UpArrow: "↑", kVK_DownArrow: "↓",
    ]
    private static let functionKeys: [Int: String] = [
        kVK_F1: "F1", kVK_F2: "F2", kVK_F3: "F3", kVK_F4: "F4", kVK_F5: "F5", kVK_F6: "F6", kVK_F7: "F7", kVK_F8: "F8",
        kVK_F9: "F9", kVK_F10: "F10", kVK_F11: "F11", kVK_F12: "F12",
    ]
    private static let modifierOnly: Set<Int> = [kVK_Command, kVK_RightCommand, kVK_Option, kVK_RightOption, kVK_Control, kVK_RightControl, kVK_Shift, kVK_RightShift, kVK_CapsLock, kVK_Function]
}

/// The quick panel's global shortcut (plan M6, Native extras): a Carbon hot key, which a sandboxed app may hold without
/// asking for Accessibility, registered EXCLUSIVELY, so when another app already owns the keys the system refuses and
/// Settings says so instead of two apps answering one press.
@Observable
final class HotKey {
    static let shared = HotKey()

    enum State: Equatable { case off, on, taken }

    /// The keys, or nil when the person turned the shortcut off. Option+Space until they change it.
    private(set) var shortcut: Shortcut?
    private(set) var state: State = .off
    /// What a press does: the panel, set once by the app.
    @ObservationIgnored var onPress: (() -> Void)?

    @ObservationIgnored private var ref: EventHotKeyRef?
    @ObservationIgnored private var handler: EventHandlerRef?
    private static let key = "mac.quickShortcut"
    private static let offKey = "mac.quickShortcutOff"

    private init() {
        if UserDefaults.standard.bool(forKey: Self.offKey) {
            shortcut = nil
        } else if let data = UserDefaults.standard.data(forKey: Self.key), let kept = try? JSONDecoder().decode(Shortcut.self, from: data) {
            shortcut = kept
        } else {
            shortcut = .optionSpace
        }
    }

    /// Hold the keys now (at launch, and after Settings changed them).
    func start() {
        installHandler()
        register()
    }

    /// New keys, or nil to turn the shortcut off; kept for the next launch.
    func set(_ next: Shortcut?) {
        shortcut = next
        if let next, let data = try? JSONEncoder().encode(next) {
            UserDefaults.standard.set(data, forKey: Self.key)
            UserDefaults.standard.set(false, forKey: Self.offKey)
        } else {
            UserDefaults.standard.set(true, forKey: Self.offKey)
        }
        register()
    }

    /// Let go of the keys for a moment (while Settings records new ones, so the old ones can be pressed there).
    func pause() {
        unregister()
        state = .off
    }

    func resume() { register() }

    private func register() {
        unregister()
        guard let shortcut else { state = .off; return }
        let id = EventHotKeyID(signature: OSType(0x4244_4F47 /* BDOG */), id: 1)
        var made: EventHotKeyRef?
        let status = RegisterEventHotKey(shortcut.keyCode, shortcut.modifiers, id, GetApplicationEventTarget(), OptionBits(kEventHotKeyExclusive), &made)
        if status == noErr, let made {
            ref = made
            state = .on
        } else {
            state = .taken
        }
    }

    private func unregister() {
        if let ref { UnregisterEventHotKey(ref) }
        ref = nil
    }

    /* ONE HANDLER FOR THE APP'S LIFE. Carbon calls it on the main thread with no context; it hands the press to the app. */
    private func installHandler() {
        guard handler == nil else { return }
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        var made: EventHandlerRef?
        InstallEventHandler(GetApplicationEventTarget(), hotKeyPressed, 1, &spec, nil, &made)
        handler = made
    }
}

/// Carbon's callback: nonisolated and capturing nothing, as a C function pointer must be.
private nonisolated func hotKeyPressed(_ call: EventHandlerCallRef?, _ event: EventRef?, _ context: UnsafeMutableRawPointer?) -> OSStatus {
    DispatchQueue.main.async {
        MainActor.assumeIsolated { HotKey.shared.onPress?() }
    }
    return noErr
}
