import Foundation
import SwiftUI
import UniformTypeIdentifiers
#if canImport(UIKit)
import UIKit
#else
import AppKit
#endif

/// A file that came into Tell with the words: a photo or a PDF from the share sheet (plan 3.9, `lib/phone/share.ts`).
///
/// SENT ONLY WHEN SOMETHING IS ADDED WITH IT, and into the first file field of the list the first entry goes to (a
/// receipt's picture, say). A list with no file field adds the line and the receipt says the file was not kept with it.
///
/// A PHOTO OVER THE RECORD'S 2 MB IS DRAWN AGAIN SMALLER as a JPEG (2048, then 1600, then 1200 on its long side), as the
/// web's `fitted` does; any other file over it is not sent and the receipt says so.
public struct Attachment: Equatable, Sendable {
    public let data: Data
    public let name: String
    /// Its type, as the record is told it (`image/jpeg`, `application/pdf`).
    public let type: String

    /// The record's ceiling on one file (`apps/worker/src/files.ts` `FILE_MOST`).
    public static let most = 2_097_152

    public init(data: Data, name: String, type: String) {
        self.data = data
        self.name = name.isEmpty ? "File" : name
        self.type = type
    }

    /// A file from a URL on this device, its type from its extension.
    public init?(file url: URL) {
        guard let data = try? Data(contentsOf: url) else { return nil }
        let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        self.init(data: data, name: url.lastPathComponent, type: type)
    }

    public var isImage: Bool { type.hasPrefix("image/") }

    /// "photo" or "file", as a sentence names it.
    public var kind: String { isImage ? "photo" : (type == "application/pdf" ? "PDF" : "file") }

    /// The photo itself, small, beside its name.
    public var picture: Image? {
        guard isImage else { return nil }
        #if canImport(UIKit)
        return UIImage(data: data).map { Image(uiImage: $0) }
        #else
        return NSImage(data: data).map { Image(nsImage: $0) }
        #endif
    }

    /// What is sent: the file as it is when it fits, a photo drawn again smaller when it does not, else nil.
    public func fitted() -> (bytes: Data, type: String, name: String)? {
        if data.count <= Self.most { return (data, type, name) }
        guard isImage else { return nil }
        let stem = (name as NSString).deletingPathExtension
        for long in [2048.0, 1600.0, 1200.0] {
            if let jpeg = Self.jpeg(data, long: long), jpeg.count <= Self.most { return (jpeg, "image/jpeg", stem + ".jpg") }
        }
        return nil
    }

    private static func jpeg(_ data: Data, long: Double) -> Data? {
        #if canImport(UIKit)
        guard let image = UIImage(data: data) else { return nil }
        let k = min(1, long / max(image.size.width, image.size.height))
        let size = CGSize(width: (image.size.width * k).rounded(), height: (image.size.height * k).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let drawn = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return drawn.jpegData(compressionQuality: 0.85)
        #else
        guard let source = NSImage(data: data), let cg = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
        let k = min(1, long / Double(max(cg.width, cg.height)))
        let w = Int((Double(cg.width) * k).rounded()), h = Int((Double(cg.height) * k).rounded())
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        guard let small = ctx.makeImage() else { return nil }
        return NSBitmapImageRep(cgImage: small).representation(using: .jpeg, properties: [.compressionFactor: 0.85])
        #endif
    }
}
