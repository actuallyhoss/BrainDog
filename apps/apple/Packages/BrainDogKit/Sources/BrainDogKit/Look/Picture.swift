import SwiftUI

/// A picture the record keeps, by its hash: a person's photo or a project's logo (its list's `identity.picture`), read
/// once and kept while the app runs.
///
/// THE BYTES BEHIND A HASH NEVER CHANGE: `/api/files/<sha256>` is served `immutable`, so a picture read once is that
/// picture for good, and the decoded image is kept here by its hash, let go by the system when memory is short.
///
/// READ THROUGH `Client`, so the session goes with it as it does with every call. `AsyncImage` reads with
/// `URLSession.shared`, which never holds the session (the app keeps it out of every cookie jar), and was answered 401.
public final class Pictures {
    public static let shared = Pictures()

    private let kept = NSCache<NSString, PlatformImage>()
    private var reading: [String: Task<Data?, Never>] = [:]

    /// The picture kept under `sha256`, read from the record the first time it is asked for; nil when it cannot be.
    public func image(_ sha256: String) async -> Image? {
        guard Self.isHash(sha256) else { return nil }
        if let image = kept.object(forKey: sha256 as NSString) { return Self.drawn(image) }
        /* ONE READ A HASH: a second face asking while the first read is out waits on it. */
        let task = reading[sha256] ?? Task<Data?, Never> { try? await Client.shared.bytes("/api/files/\(sha256)") }
        reading[sha256] = task
        let data = await task.value
        reading[sha256] = nil
        guard let data, let image = PlatformImage(data: data) else { return nil }
        kept.setObject(image, forKey: sha256 as NSString)
        return Self.drawn(image)
    }

    /// Sixty-four lower-case hex characters, the only name a file is kept under.
    static func isHash(_ said: String) -> Bool {
        said.utf8.count == 64 && said.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }

    private static func drawn(_ image: PlatformImage) -> Image {
        #if os(iOS)
        Image(uiImage: image)
        #else
        Image(nsImage: image)
        #endif
    }
}
