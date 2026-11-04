import BrainDogKit
import SwiftUI
import UniformTypeIdentifiers
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// The share extension (plan 3.9, M5; attachments 3 Nov): what another app shares offers two things. **Attach** puts the
/// files, or the web page, on a project or a task as they are, through the same file door and `attachFile` the web's
/// Attachments section uses. **Tell** reads the words (and a photo or PDF) into entries, read on the device by the web's
/// own reader as in the app. Nothing is added until the press; each receipt says what was, with Undo.
///
/// THE SESSION IS THE APP'S, read from the shared Keychain group; signed out, the sheet says to open BrainDog and sign in.
/// What lines are read against, and the lists a file can go on, is what the app kept in the App Group, then the record's
/// own, read again here.
@MainActor
enum Shared {
    /// What was shared: the words (a link after the page's title when the sender gave one), the first photo or file for
    /// Tell, every file for Attach, and a web page shared as a page (its address, and its HTML when Safari handed it over).
    struct Read {
        var text: String
        var attachment: Attachment?
        var files: [AttachModel.File] = []
        var page: URL?
        var pageFile: AttachModel.File?
    }

    static func read(_ items: [NSExtensionItem]) async -> Read {
        var words: [String] = []
        var attachment: Attachment?
        var files: [AttachModel.File] = []
        var page: URL?
        var pageFile: AttachModel.File?
        var title: String?
        for item in items {
            if let said = item.attributedContentText?.string.trimmingCharacters(in: .whitespacesAndNewlines), !said.isEmpty, !words.contains(said) {
                words.append(said)
                title = title ?? said
            }
            for provider in item.attachments ?? [] {
                /* SAFARI'S PAGE AS IT IS DRAWN (`Page.js`, iOS): its HTML, title and address, kept as `<title>.html`. */
                if provider.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier),
                   let list = try? await provider.loadItem(forTypeIdentifier: UTType.propertyList.identifier) as? NSDictionary,
                   let got = list[NSExtensionJavaScriptPreprocessingResultsKey] as? NSDictionary {
                    let url = (got["url"] as? String).flatMap(URL.init(string:))
                    if let url, page == nil { page = url }
                    if let html = got["html"] as? String, !html.isEmpty {
                        pageFile = AttachModel.File(data: Data(html.utf8), name: pageName(title: got["title"] as? String, url: url))
                    }
                    if let url, !words.contains(url.absoluteString) { words.append(url.absoluteString) }
                    continue
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier), !provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
                   let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                    if !words.contains(url.absoluteString) { words.append(url.absoluteString) }
                    if page == nil, url.scheme == "https" || url.scheme == "http" { page = url }
                    continue
                }
                if let file = await file(from: provider) {
                    if attachment == nil { attachment = file }
                    files.append(AttachModel.File(data: file.data, name: file.name))
                    continue
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                   let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                    let line = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !line.isEmpty, !words.contains(line) { words.append(line) }
                }
            }
        }
        /* A PAGE'S TITLE AND ITS ADDRESS ARE ONE THING SHARED, not two lines, each read as an entry of its own. */
        var lines: [String] = []
        for word in words {
            if word.hasPrefix("http://") || word.hasPrefix("https://"), let last = lines.last, !last.contains("://") {
                lines[lines.count - 1] = "\(last) \(word)"
            } else {
                lines.append(word)
            }
        }
        return Read(text: lines.joined(separator: "\n"), attachment: attachment, files: files, page: page, pageFile: pageFile)
    }

    /// A page's file name: its title, or its host, made safe, as `.html`.
    static func pageName(title: String?, url: URL?) -> String {
        let said = (title?.isEmpty == false ? title : nil) ?? url?.host ?? "Page"
        let safe = said.components(separatedBy: CharacterSet(charactersIn: "/\\:*?\"<>|\n\r\t")).joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
        return String((safe.isEmpty ? "Page" : safe).prefix(80)) + ".html"
    }

    /// A web page shared by its address alone (any app's share, the Mac's Safari): read as it is served, to keep as a page.
    /// The page is read with no cookies, so what is kept is what anyone would be served, never a signed-in copy.
    static func fetchPage(_ url: URL, title: String?) async -> AttachModel.File? {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieAcceptPolicy = .never
        config.httpShouldSetCookies = false
        config.timeoutIntervalForRequest = 15
        guard let (data, response) = try? await URLSession(configuration: config).data(from: url),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              http.mimeType == "text/html" || http.mimeType == "application/xhtml+xml",
              data.count <= AttachModel.most else { return nil }
        let html = String(decoding: data, as: UTF8.self)
        let named = title ?? html.range(of: "<title[^>]*>([^<]{1,200})</title>", options: [.regularExpression, .caseInsensitive]).map {
            String(html[$0]).replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        }
        return AttachModel.File(data: data, name: pageName(title: named?.trimmingCharacters(in: .whitespacesAndNewlines), url: url))
    }

    /// A photo or a file, from wherever the sender put it: a file on disk, the bytes themselves, or an image object.
    private static func file(from provider: NSItemProvider) async -> Attachment? {
        for type in [UTType.image, UTType.pdf, UTType.html, UTType.data] where provider.hasItemConformingToTypeIdentifier(type.identifier) {
            guard let item = try? await provider.loadItem(forTypeIdentifier: type.identifier) else { continue }
            let name = provider.suggestedName ?? (type == .image ? "Photo" : (type == .html ? "Page" : "File"))
            if let url = item as? URL, url.isFileURL {
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                return Attachment(file: url)
            }
            if let data = item as? Data {
                let mime = UTType(provider.registeredTypeIdentifiers.first ?? type.identifier)?.preferredMIMEType ?? (type == .pdf ? "application/pdf" : "image/jpeg")
                let ext = UTType(mimeType: mime)?.preferredFilenameExtension
                let named = (name as NSString).pathExtension.isEmpty && ext != nil ? "\(name).\(ext!)" : name
                return Attachment(data: data, name: named, type: mime)
            }
            if let text = item as? String, type == .html {
                return Attachment(data: Data(text.utf8), name: name.hasSuffix(".html") ? name : name + ".html", type: "text/html")
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

    /// Hand what was read to the two models: Tell's words and first file, and Attach's files or page.
    static func fill(_ read: Read, tell: TellModel, attach: AttachModel) async {
        tell.opened(prefill: read.text)
        tell.attachment = read.attachment
        for file in read.files { attach.add(file) }
        if read.files.isEmpty {
            if let page = read.pageFile {
                attach.add(page)
            } else if let url = read.page, let fetched = await fetchPage(url, title: nil) {
                attach.add(fetched)
            }
        }
    }

    /// Whether Attach is the first choice: a file or a page came, not only words.
    static func startsAttaching(_ items: [NSExtensionItem]) -> Bool {
        items.contains { item in
            (item.attachments ?? []).contains { p in
                p.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) || p.hasItemConformingToTypeIdentifier(UTType.image.identifier)
                    || p.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) || p.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier)
                    || p.hasItemConformingToTypeIdentifier(UTType.html.identifier)
                    || (p.hasItemConformingToTypeIdentifier(UTType.data.identifier) && !p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) && !p.hasItemConformingToTypeIdentifier(UTType.url.identifier))
            }
        }
    }
}

#if os(iOS)
final class ShareController: UIViewController {
    private let model = TellModel(keepsDraft: false)
    private let attach = AttachModel()

    override func viewDidLoad() {
        super.viewDidLoad()
        Typeface.register()
        let close: () -> Void = { [weak self] in self?.extensionContext?.completeRequest(returningItems: nil) }
        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        let host = UIHostingController(rootView: ShareView(model: model, attach: attach, startsAttaching: Shared.startsAttaching(items), signedIn: Session.shared.signedIn, close: close))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
        Task {
            await Shared.fill(await Shared.read(items), tell: model, attach: attach)
            await model.learnKeptThenFresh()
        }
    }
}
#else
final class ShareController: NSViewController {
    private let model = TellModel(keepsDraft: false)
    private let attach = AttachModel()

    override func loadView() {
        Typeface.register()
        let close: () -> Void = { [weak self] in self?.extensionContext?.completeRequest(returningItems: nil) }
        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        let host = NSHostingView(rootView: ShareView(model: model, attach: attach, startsAttaching: Shared.startsAttaching(items), signedIn: Session.shared.signedIn, close: close))
        host.frame = NSRect(x: 0, y: 0, width: 460, height: 520)
        view = host
        preferredContentSize = host.frame.size
        Task {
            await Shared.fill(await Shared.read(items), tell: model, attach: attach)
            await model.learnKeptThenFresh()
        }
    }
}
#endif
