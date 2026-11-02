import UserNotifications

/// The notification service extension (plan 3.7, M4). Empty in M0: the push is shown as it came, the fixed line. M4
/// reads the question with the app session and rewrites it with its real line and its answers.
nonisolated final class NotificationService: UNNotificationServiceExtension {
    override func didReceive(_ request: UNNotificationRequest, withContentHandler handler: @escaping (UNNotificationContent) -> Void) {
        handler(request.content)
    }
}
