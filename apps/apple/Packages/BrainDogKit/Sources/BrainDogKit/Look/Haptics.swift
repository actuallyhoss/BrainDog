import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// The four haptics (plan 3.5): `press` on a primary, `success` on Add or an answer, `warning` on a refusal, `select` on a
/// segmented change. The web asks for the same four through the bridge (`haptic(kind)`). The Mac has none.
nonisolated public enum Haptic: String, Sendable, CaseIterable {
    case press, success, warning, select

    public func play() {
        #if os(iOS)
        switch self {
        case .press: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .success: UINotificationFeedbackGenerator().notificationOccurred(.success)
        case .warning: UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case .select: UISelectionFeedbackGenerator().selectionChanged()
        }
        #endif
    }
}
