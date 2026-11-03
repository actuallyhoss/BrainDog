import Foundation
import Observation
import UniformTypeIdentifiers

/// Files put on a project or a task from outside the web pages: the share sheet's "Attach to…", a file dropped on the Mac's
/// quick panel or Tell window (`loop/plans/attachments-2026-11-03`, section 8).
///
/// THE SAME TWO CALLS THE WEB'S ATTACHMENTS SECTION MAKES (`lib/attach/attached.ts` `attach`): the bytes to the file door
/// under their own name (`PUT /api/files?name=`), then `attachFile { on, name, sha256 }` with the hash it answered. The
/// record reads the file again, decides what it is and reads its words for agents; nothing is taken from this side's word
/// for what a file is. Nothing new on the server.
///
/// WHERE IT GOES IS PICKED FROM THE RECORD'S OWN LISTS: the projects (the list declaring `scopes`) and the tasks, the
/// newest first until something is typed, then the record's search over the same lists. `on` is `register#seq`, as the
/// task page and the project page name the thing.
///
/// NOTHING IS SENT UNTIL THE PRESS, and the receipt has Undo, which takes each file off again (`removeAttachment`).
@Observable
public final class AttachModel: Identifiable {
    public let id = UUID()

    /// One file on its way: its bytes, its name, and how it went.
    public struct File: Identifiable, Equatable {
        public enum State: Equatable { case waiting, sending, sent(String), refused(String) }
        public let id = UUID()
        public let data: Data
        public let name: String
        public var state: State = .waiting

        public init(data: Data, name: String) {
            self.data = data
            self.name = name.isEmpty ? "File" : name
        }

        /// A file on this device, by its address; nil when it cannot be read.
        public init?(url: URL) {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return nil }
            self.init(data: Data(data), name: url.lastPathComponent)
        }

        /// What it is in a word, as the web's list says it ("PDF", "Page", "Picture").
        public var kind: String {
            let ext = (name as NSString).pathExtension.lowercased()
            if ["html", "htm"].contains(ext) { return Words.attachKindPage }
            if ext == "pdf" || data.starts(with: Data("%PDF-".utf8)) { return "PDF" }
            if let type = UTType(filenameExtension: ext) {
                if type.conforms(to: .image) { return Words.attachKindPicture }
                if type.conforms(to: .spreadsheet) { return Words.attachKindSheet }
                if type.conforms(to: .presentation) { return Words.attachKindSlides }
                if type.conforms(to: .text) || type.conforms(to: .json) || type.conforms(to: .commaSeparatedText) { return Words.attachKindText }
            }
            return Words.attachKindFile
        }

        /// The glyph for its kind, as the web's `iconOf` picks it.
        public var glyph: Glyph {
            switch kind {
            case Words.attachKindPage: .code
            case Words.attachKindPicture: .eye
            case Words.attachKindText: .rows
            default: .doc
            }
        }

        /// "PDF · 1.2 MB".
        public var detail: String { "\(kind) · \(Words.size(data.count))" }
    }

    /// A project or a task a file can go on.
    public struct Target: Identifiable, Hashable {
        public let register: String
        public let seq: Int
        public let title: String
        public let list: String
        public let icon: String?
        public var id: String { on }
        /// How the record takes it: `tasks#41`, `things#3`.
        public var on: String { "\(register)#\(seq)" }
        /// Its page in the web app.
        public var path: String { "/r/\(register)/\(seq)" }
    }

    public struct Receipt: Equatable {
        public let said: String
        public let ids: [String]
        public let target: Target
    }

    /// The most one file may be (`ATTACHED_MOST`), said before it is sent.
    public static let most = 25 * 1024 * 1024

    public var files: [File]
    public var query = "" {
        didSet { if query != oldValue { find() } }
    }
    public private(set) var recent: [Target] = []
    public private(set) var found: [Target] = []
    public private(set) var searching = false
    public private(set) var loading = true
    public var chosen: Target?
    public private(set) var sending = false
    public private(set) var receipt: Receipt?
    /// The one sentence about the last press, and whether it is a refusal.
    public private(set) var said: String?
    public private(set) var saidIsRefusal = false

    /// Something was attached or taken back: whoever shows the record reads again.
    @ObservationIgnored public var onChanged: (() -> Void)?

    /// A list a file can go on: its name and glyph, the field its rows are named by, and what finished means there.
    private struct ListInfo: Sendable {
        let name: String
        let icon: String?
        let title: String?
        let done: Set<String>
        let state: String?
    }
    @ObservationIgnored private var lists: [String: ListInfo] = [:]
    @ObservationIgnored private var finding: Task<Void, Never>?

    public init(files: [File] = []) {
        self.files = files
    }

    /// What the picker shows: the newest projects and tasks, or what the search found once two letters are typed.
    public var shown: [Target] {
        query.trimmingCharacters(in: .whitespaces).count >= 2 ? found : recent
    }

    /// Whether anything is left to send.
    public var hasWaiting: Bool { files.contains { if case .sent = $0.state { false } else { true } } }

    /// The files a drop carried (Finder's, a Mail attachment's), read from their addresses; anything else is left.
    public static func files(from providers: [NSItemProvider]) async -> [File] {
        var out: [File] = []
        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            guard let item = try? await provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier) else { continue }
            let url = (item as? URL) ?? (item as? Data).flatMap { URL(dataRepresentation: $0, relativeTo: nil) }
            guard let url, url.isFileURL, !url.hasDirectoryPath, let file = File(url: url) else { continue }
            out.append(file)
        }
        return out
    }

    public func add(_ file: File) {
        guard !files.contains(where: { $0.name == file.name && $0.data == file.data }) else { return }
        files.append(file)
        receipt = nil
    }

    public func remove(_ file: File) {
        files.removeAll { $0.id == file.id }
    }

    public func choose(_ target: Target) {
        Haptic.select.play()
        chosen = chosen == target ? nil : target
        say(nil)
    }

    // MARK: where it can go

    /// Learn the project and task lists, from what the app kept (the App Group) and then the record, and read the newest
    /// of each. Signed out or offline, the kept lists stand and the search says so when pressed.
    public func start() async {
        loading = true
        defer { loading = false }
        if let boot = Kept.load("tell.boot", as: JSONValue.self), let schemas = Kept.load("tell.schemas", as: JSONValue.self) {
            learn(boot: boot, schemas: schemas)
        }
        if Session.shared.signedIn {
            if let (_, boot) = try? await Calls.boot(), let schemas = try? await Calls.schemas() {
                learn(boot: boot, schemas: schemas)
            }
        }
        await readRecent()
    }

    /// The lists a file goes on: the projects (the list declaring `scopes`) and the tasks (the list a person or an agent
    /// is handed work in), by name and glyph, with what "finished" means for each so a done task is not offered first.
    private func learn(boot: JSONValue, schemas: JSONValue) {
        guard case .object(let decls) = schemas else { return }
        var out: [String: ListInfo] = [:]
        for list in boot["registers"]?.array ?? [] {
            guard let id = list["id"]?.string, let decl = decls[id], list["kernel"] != .bool(true) else { continue }
            let projects = decl["scopes"] != nil || id == "things" || id == "projects"
            let tasks = id == "tasks" || decl["hand"] != nil
            guard projects || tasks else { continue }
            let done = Set((decl["done"]?.array ?? []).compactMap(\.string))
            out[id] = ListInfo(name: list["name"]?.string ?? id, icon: list["icon"]?.string ?? decl["icon"]?.string, title: decl["title"]?.string, done: done, state: decl["state"]?.string)
        }
        if !out.isEmpty { lists = out }
    }

    /// The newest of each list, open ones only where the list says what finished is, projects first at equal age.
    private func readRecent() async {
        var all: [(Target, String)] = []
        let known = lists
        await withTaskGroup(of: [(Target, String)].self) { group in
            for (id, list) in known {
                group.addTask {
                    let args: [String: JSONValue] = ["register": .string(id), "limit": .number(30), "short": .bool(true)]
                    guard let raw = try? await Client.shared.call("list", args, as: JSONValue.self) else { return [] }
                    var out: [(Target, String)] = []
                    for row in raw["rows"]?.array ?? [] {
                        guard let seq = row["seq"]?.number else { continue }
                        if let state = list.state, let now = row["fields"]?[state]?.string, list.done.contains(now) { continue }
                        let title = list.title.flatMap { row["fields"]?[$0]?.string } ?? row["title"]?.string ?? ""
                        guard !title.trimmingCharacters(in: .whitespaces).isEmpty else { continue }
                        let when = row["updated_at"]?.string ?? row["updatedAt"]?.string ?? row["created_at"]?.string ?? row["at"]?.string ?? ""
                        out.append((Target(register: id, seq: Int(seq), title: Self.firstLine(title), list: list.name, icon: list.icon), when))
                    }
                    return out
                }
            }
            for await some in group { all += some }
        }
        recent = Array(all.sorted { $0.1 > $1.1 }.map(\.0).prefix(24))
    }

    nonisolated private static func firstLine(_ text: String) -> String {
        String(text.split(whereSeparator: \.isNewline).first ?? Substring(text)).trimmingCharacters(in: .whitespaces)
    }

    /* THE SEARCH WAITS FOR A PAUSE IN THE TYPING (200 ms), and an older answer never lands over a newer one. */
    private func find() {
        finding?.cancel()
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { found = []; searching = false; return }
        searching = true
        let known = lists
        finding = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(200))
            guard !Task.isCancelled else { return }
            let hits = (try? await Calls.search(q)) ?? []
            guard !Task.isCancelled, let self else { return }
            self.found = hits.compactMap { hit in
                guard let list = known[hit.register] else { return nil }
                return Target(register: hit.register, seq: hit.seq, title: Self.firstLine(hit.title), list: list.name, icon: list.icon)
            }
            self.searching = false
        }
    }

    // MARK: the press

    private func say(_ text: String?, refusal: Bool = true) {
        said = text
        saidIsRefusal = refusal
        if text != nil && refusal { Haptic.warning.play() }
    }

    /// Attach: each file to the door, then on the thing. Says what is missing rather than being disabled.
    public func send() async {
        guard !sending else { return }
        guard let target = chosen else { return say(Words.attachChooseFirst) }
        guard hasWaiting else { return say(Words.attachNothing) }
        sending = true
        say(nil)
        defer { sending = false }
        var ids: [String] = []
        var lastSaid: String?
        var offline = false
        for i in files.indices {
            if case .sent = files[i].state { continue }
            let file = files[i]
            guard file.data.count <= Self.most else {
                files[i].state = .refused(Words.attachTooBig(file.name))
                continue
            }
            files[i].state = .sending
            do {
                let sent = try await Client.shared.put(attaching: file.data, name: file.name)
                let raw: JSONValue = try await Client.shared.call("attachFile", ["on": .string(target.on), "name": .string(file.name), "sha256": .string(sent.sha256)])
                let id = raw["id"]?.string ?? ""
                if !id.isEmpty, raw["unchanged"] != .bool(true) { ids.append(id) }
                files[i].state = .sent(id)
                lastSaid = raw["said"]?.string
            } catch .offline {
                files[i].state = .waiting
                offline = true
                break
            } catch {
                files[i].state = .refused(Words.failure(error))
            }
        }
        if offline { return say(Words.attachOffline) }
        let sentCount = files.filter { if case .sent = $0.state { true } else { false } }.count
        guard sentCount > 0 else { return say(Words.attachNoneWent) }
        Haptic.success.play()
        let sentence = sentCount == 1 ? (lastSaid ?? Words.attached(files.first?.name ?? "", to: target.title)) : Words.attachedMany(sentCount, to: target.title)
        receipt = Receipt(said: sentence.hasSuffix(".") ? sentence : sentence + ".", ids: ids, target: target)
        onChanged?()
    }

    /// The receipt's Undo: every file this press put on is taken off again. The record keeps the bytes and the history.
    public func undo() async {
        guard let receipt else { return }
        do {
            for id in receipt.ids {
                _ = try await Client.shared.call("removeAttachment", ["id": .string(id)], as: JSONValue.self)
            }
            Haptic.success.play()
            self.receipt = Receipt(said: Words.attachUndone(receipt.target.title), ids: [], target: receipt.target)
            for i in files.indices { files[i].state = .waiting }
            onChanged?()
        } catch {
            say(Words.failure(error))
        }
    }
}

extension Words {
    public static let attachTo = "Attach to…"
    public static let attachTab = "Attach"
    public static let attachFind = "Find a project or task"
    public static let attachRecent = "Recent"
    public static let attachFound = "Found"
    public static let attachLoading = "Reading your projects and tasks."
    public static let attachNoLists = "There are no projects or tasks here to attach to yet."
    public static func attachNoMatch(_ q: String) -> String { "No project or task called \(q)." }
    public static let attachChooseFirst = "Choose a project or task first."
    public static let attachNothing = "There is no file to attach."
    public static let attachOffline = "Not sent: you're offline. Press Attach again when you're back."
    public static let attachNoneWent = "None of the files went. Each says why."
    public static func attachPress(_ title: String) -> String { "Attach to \(title)" }
    public static let attaching = "Attaching"
    public static func attached(_ name: String, to title: String) -> String { "Attached \(name) to \(title)." }
    public static func attachedMany(_ n: Int, to title: String) -> String { "Attached \(n) files to \(title)." }
    public static func attachUndone(_ title: String) -> String { "Taken back. Nothing new is on \(title)." }
    public static func attachTooBig(_ name: String) -> String { "\(name) is bigger than 25 MB. Attach a smaller file." }
    public static let attachHint = "PDFs, pages saved from Claude, pictures, notes and documents, up to 25 MB each. Nothing is sent until you press Attach."
    public static let attachDrop = "Drop files here to attach them to a project or task."
    public static let attachOpen = "Open it"
    public static let attachSent = "Attached"
    public static let attachKindPage = "Page"
    public static let attachKindPicture = "Picture"
    public static let attachKindText = "Text"
    public static let attachKindSheet = "Spreadsheet"
    public static let attachKindSlides = "Slides"
    public static let attachKindFile = "File"
    public static func takeOffFile(_ name: String) -> String { "Take \(name) off" }
    /// A size in plain words, as the web's `sizeOf`.
    public static func size(_ bytes: Int) -> String {
        bytes < 1024 ? "Under 1 KB" : bytes < 1_048_576 ? "\(Int((Double(bytes) / 1024).rounded())) KB" : String(format: "%.1f MB", Double(bytes) / 1_048_576)
    }
}
