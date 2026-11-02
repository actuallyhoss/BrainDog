import BrainDogKit
import SwiftUI
import UniformTypeIdentifiers
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// The share extension (plan 3.9, M5): what another app shares (words, a link, a photo or a PDF) opens in Tell, read on
/// the device by the web's own reader as in the app. Nothing is added until Add; the receipt says what was, with Undo.
///
/// THE SESSION IS THE APP'S, read from the shared Keychain group; signed out, the sheet says to open BrainDog and sign in.
/// What lines are read against is what the app kept in the App Group, then the record's own, read again here.
@MainActor
enum Shared {
    /// The words and the file in what was shared: the text, a link (after the page's title when the sender gave one), and
    /// the first photo or file.
    static func read(_ items: [NSExtensionItem]) async -> (text: String, attachment: Attachment?) {
        var words: [String] = []
        var attachment: Attachment?
        for item in items {
            if let title = item.attributedContentText?.string.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty, !words.contains(title) {
                words.append(title)
            }
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier), !provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
                   let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                    if !words.contains(url.absoluteString) { words.append(url.absoluteString) }
                    continue
                }
                if attachment == nil, let file = await file(from: provider) {
                    attachment = file
                    continue
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                   let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                    let line = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !line.isEmpty, !words.contains(line) { words.append(line) }
                }
            }
        }
        return (words.joined(separator: "\n"), attachment)
    }

    /// A photo or a file, from wherever the sender put it: a file on disk, the bytes themselves, or an image object.
    private static func file(from provider: NSItemProvider) async -> Attachment? {
        for type in [UTType.image, UTType.pdf, UTType.data] where provider.hasItemConformingToTypeIdentifier(type.identifier) {
            guard let item = try? await provider.loadItem(forTypeIdentifier: type.identifier) else { continue }
            let name = provider.suggestedName ?? (type == .image ? "Photo" : "File")
            if let url = item as? URL, url.isFileURL {
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                return Attachment(file: url)
            }
            if let data = item as? Data {
                let mime = UTType(provider.registeredTypeIdentifiers.first ?? type.identifier)?.preferredMIMEType ?? (type == .pdf ? "application/pdf" : "image/jpeg")
                return Attachment(data: data, name: name, type: mime)
            }
            #if os(iOS)
            if let image = item as? UIImage, let data = image.jpegData(compressionQuality: 0.9) {
                return Attachment(data: data, name: name + ".jpg", type: "image/jpeg")
            }
            #else
            if let image = item as? NSImage, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
               let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.9]) {
                return Attachment(data: data, name: name + ".jpg", type: "image/jpeg")
            }
            #endif
        }
        return nil
    }
}

#if os(iOS)
final class ShareController: UIViewController {
    private let model = TellModel(keepsDraft: false)

    override func viewDidLoad() {
        super.viewDidLoad()
        Typeface.register()
        let close: () -> Void = { [weak self] in self?.extensionContext?.completeRequest(returningItems: nil) }
        let host = UIHostingController(rootView: ShareView(model: model, signedIn: Session.shared.signedIn, close: close))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        Task {
            let (text, attachment) = await Shared.read(items)
            model.opened(prefill: text)
            model.attachment = attachment
            await model.learnKeptThenFresh()
        }
    }
}
#else
final class ShareController: NSViewController {
    private let model = TellModel(keepsDraft: false)

    override func loadView() {
        Typeface.register()
        let close: () -> Void = { [weak self] in self?.extensionContext?.completeRequest(returningItems: nil) }
        let host = NSHostingView(rootView: ShareView(model: model, signedIn: Session.shared.signedIn, close: close))
        host.frame = NSRect(x: 0, y: 0, width: 440, height: 420)
        view = host
        preferredContentSize = host.frame.size
        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        Task {
            let (text, attachment) = await Shared.read(items)
            model.opened(prefill: text)
            model.attachment = attachment
            await model.learnKeptThenFresh()
        }
    }
}
#endif
