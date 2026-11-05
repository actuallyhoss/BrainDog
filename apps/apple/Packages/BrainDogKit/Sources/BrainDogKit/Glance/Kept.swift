import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// What the native screens last read, kept on the device so they draw at once and say so when offline (plan 3.8):
/// "Offline, showing what you last saw at 14:02." In the App Group's folder when the app has one, so the widgets read
/// the same copy (M5); in the app's own caches when it is signed to run locally and has none.
///
/// READ-ONLY, NOTHING WAITS TO BE SENT, as `lib/data/offline.ts` holds it. A copy is an answer and the time it was read;
/// it is never a write. Everything here goes on sign-out, on a 401 and when access ends (`Session.lost`).
public enum Kept {
    private static var folder: URL {
        let group = Server.appGroup.flatMap { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) }
        let base = group ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let folder = base.appendingPathComponent("Kept", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        /* A COPY OF THE RECORD'S WORDS AND MONEY, read again whenever it is wanted: it does not go in a backup. */
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var marked = folder
        try? marked.setResourceValues(values)
        return folder
    }

    private static func file(_ name: String, _ ext: String = "json") -> URL { folder.appendingPathComponent("\(name).\(ext)") }

    /// Keep an answer under a name.
    public static func save<T: Encodable>(_ value: T, as name: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: file(name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    /// The answer kept under a name, if there is one.
    public static func load<T: Decodable>(_ name: String, as: T.Type = T.self) -> T? {
        guard let data = try? Data(contentsOf: file(name)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    #if canImport(UIKit)
    /// The launch picture: Today as it was last drawn, put over Today until the page says it has drawn again.
    public static var launch: UIImage? {
        get { (try? Data(contentsOf: file("launch", "png"))).flatMap(UIImage.init(data:)) }
        set {
            /* A PHOTO'S ENCODING, NOT A PNG: this runs as the app goes to the background, and a full screen's PNG took long
               enough on the main thread that the system often suspended the app first and nothing was kept. */
            if let data = newValue?.jpegData(compressionQuality: 0.85) {
                /* A PICTURE OF THE WHOLE OF TODAY, read only when the app opens: shut while the phone is locked, unlike the rest,
                   which the widgets and the notification extension read on a locked phone. */
                try? data.write(to: file("launch", "png"), options: [.atomic, .completeFileProtection])
            } else {
                try? FileManager.default.removeItem(at: file("launch", "png"))
            }
        }
    }
    #endif

    /// Forget everything kept: signed out, a 401, access ended.
    public static func forget() {
        try? FileManager.default.removeItem(at: folder)
    }
}

/// "14:02" today, "Sat 14:02" this week, "29 Oct" before: when something was last read, as the product says a time.
public enum Said {
    private static func format(_ pattern: String, _ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.dateFormat = pattern
        return f.string(from: date)
    }

    public static func time(_ date: Date, now: Date = Date()) -> String {
        let calendar = Calendar.current
        if calendar.isDate(date, inSameDayAs: now) { return format("HH:mm", date) }
        if let days = calendar.dateComponents([.day], from: date, to: now).day, days < 7 { return format("EEE HH:mm", date) }
        return day(date, now: now)
    }

    /// "29 Oct", with the year only when it is not this one; "Sat 5 Sep" with `weekday`.
    public static func day(_ date: Date, now: Date = Date(), weekday: Bool = false) -> String {
        let sameYear = Calendar.current.component(.year, from: date) == Calendar.current.component(.year, from: now)
        return format((weekday ? "EEE " : "") + (sameYear ? "d MMM" : "d MMM yyyy"), date)
    }

    /// A day as the record stores one, `YYYY-MM-DD`, in the device's own calendar.
    public static func iso(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    /// A stored day or instant read back, or nil.
    public static func date(_ text: String?) -> Date? {
        guard let text else { return nil }
        if let at = try? Date(text, strategy: .iso8601) { return at }
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: String(text.prefix(10)))
    }
}
