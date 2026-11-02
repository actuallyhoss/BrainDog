import BrainDogKit
import LocalAuthentication
import Observation
import SwiftUI

/// Lock with Face ID (plan 3.10, M5): off by default, turned on in the native Settings root. On, BrainDog asks when it
/// opens and after five minutes away, and while it is not in front its picture in the app switcher is the cover, not the
/// page. Face ID never leaves the phone; the passcode stands in where Face ID cannot.
@Observable
final class Lock {
    static let shared = Lock()

    var on: Bool {
        didSet { UserDefaults.standard.set(on, forKey: "lock.on") }
    }
    /// The cover is up and waits for Face ID.
    private(set) var locked: Bool
    /// The app is not in front (the switcher's picture), so the cover is up whatever else.
    var away = false
    @ObservationIgnored private var leftAt: Date?
    @ObservationIgnored private var asking = false

    private init() {
        let on = UserDefaults.standard.bool(forKey: "lock.on")
        self.on = on
        locked = on
    }

    var covered: Bool { on && (locked || away) }

    /// Whether this phone can lock at all: Face ID, Touch ID or a passcode set up.
    static var possible: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    func wentAway() {
        away = true
        if leftAt == nil { leftAt = Date() }
    }

    func cameBack() {
        away = false
        if on, let leftAt, Date().timeIntervalSince(leftAt) >= 5 * 60 { locked = true }
        self.leftAt = nil
        if locked { Task { await unlock() } }
    }

    func unlock() async {
        guard on, locked, !asking else { return }
        asking = true
        defer { asking = false }
        let context = LAContext()
        if (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: Words.unlockReason)) == true {
            withAnimation(.easeOut(duration: 0.12)) { locked = false }
            Haptic.success.play()
        }
    }

    /// Turned on only after one Face ID that works, so nobody locks themselves out of a phone that cannot ask.
    func turn(_ wanted: Bool) async -> Bool {
        guard wanted else {
            on = false
            locked = false
            return true
        }
        guard Self.possible else { return false }
        let context = LAContext()
        guard (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: Words.faceLock)) == true else { return false }
        on = true
        locked = false
        return true
    }
}

/// What stands over the app while it is locked: the board, the mark's name, and Unlock.
struct LockCover: View {
    @State private var lock = Lock.shared

    var body: some View {
        VStack(spacing: Space.s4) {
            Spacer()
            Glyph.lock.image.resizable().frame(width: 32, height: 32).foregroundStyle(Palette.ink3).accessibilityHidden(true)
            Text(Words.locked).font(Typeface.heading).foregroundStyle(Palette.ink)
            if !lock.away {
                Button(Words.unlock) {
                    Haptic.press.play()
                    Task { await lock.unlock() }
                }
                .buttonStyle(BDButtonStyle(.primary, full: false))
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.board)
    }
}
