import BrainDogKit
import UserNotifications

/// The notification service extension (plan 3.7, M4). Apple carries one fixed line for a push's kind and nothing of
/// what it is about; here, on the phone, the question is read with the app session (the shared Keychain group) over TLS
/// and the notification says its real words, the suggested answer, Accept where one press is safe, and the badge as the
/// Needs you count (`Push.enrich`). If the read fails or time runs out, the fixed line is shown as it came.
nonisolated final class NotificationService: UNNotificationServiceExtension {
    private var deliver: ((UNNotificationContent) -> Void)?
    private var best: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler handler: @escaping (UNNotificationContent) -> Void) {
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            handler(request.content)
            return
        }
        deliver = handler
        best = content
        nonisolated(unsafe) let unsafeContent = content
        nonisolated(unsafe) let unsafeSelf = self
        Task { @MainActor in
            await Push.enrich(unsafeContent)
            unsafeSelf.finish()
        }
    }

    override func serviceExtensionTimeWillExpire() {
        finish()
    }

    /// Hand the notification over once: whichever comes first, the read or the end of the time Apple gives.
    private func finish() {
        guard let deliver, let best else { return }
        self.deliver = nil
        deliver(best)
    }
}
