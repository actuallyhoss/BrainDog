import Observation
import SwiftUI

/// Tell, natively (plan 3.9): one composer with two modes. **Tell** reads every line on the device with the web's own
/// reader (`TellCore`, JavaScriptCore) and draws "That becomes" as the person types; Add sends the ready entries of
/// every line as one `capture`, and the receipt names what went with one Undo for all of it. **Ask** hands the words to
/// Slash in the web app (`/slash?q=`).
///
/// NOTHING IS ADDED UNTIL THE PRESS, and the sheet says so beside the button. A line the reader cannot place says why,
/// in its words, and offers the lists it could go into, each a press. An entry that needs something stays behind
/// saying what, and the receipt says it was not added.
///
/// OFFLINE IS A DRAFT, NOT A QUEUE (plan 3.8): the words are kept on this device and nothing is sent until Add is
/// pressed again online. Nothing ever goes out on its own.
@Observable
public final class TellModel {
    public enum Mode: Hashable { case tell, ask }

    public struct Line: Identifiable, Equatable {
        public let id: Int
        public let sentence: String
        /// What the reader answered, as JSON, handed back whole for the batch.
        let raw: String
        public let told: Told
    }

    public struct Receipt: Equatable {
        public let said: String
        public let batch: String?
        /// Lines that went nowhere, left in the field.
        public var kept = 0
    }

    public var mode: Mode = .tell
    public var text = "" {
        didSet {
            if keepsDraft { UserDefaults.standard.set(text, forKey: Self.draftKey) }
            if text != oldValue { reread() }
        }
    }
    /// A file that came with the words (the share sheet's photo or PDF): sent with the first entry whose list keeps a file.
    public var attachment: Attachment?
    public private(set) var lines: [Line] = []
    /// A line whose words fit nowhere, placed by a press on one of its offers.
    public private(set) var chosen: [Int: Told.Row] = [:]
    public private(set) var sending = false
    public private(set) var receipt: Receipt?
    /// The one sentence about the last press, and whether it is a refusal.
    public private(set) var said: String?
    public private(set) var saidIsRefusal = false

    /// Hand the words to Ask in the web app.
    @ObservationIgnored public var onAsk: ((String) -> Void)?
    /// Something was added or taken back: the screens read again.
    @ObservationIgnored public var onChanged: (() -> Void)?

    @ObservationIgnored private var options: String?
    @ObservationIgnored private var names: [String: String] = [:]
    /// Each list's first file field, where an attachment goes (`shared.svelte.ts` `photoField`).
    @ObservationIgnored private var fileFields: [String: String] = [:]
    /// Whether the words are kept as the app's draft. The share sheet and Siri start from their own words and keep none.
    @ObservationIgnored private let keepsDraft: Bool

    /// A list's name as the person named it.
    public func listName(_ register: String) -> String { names[register] ?? register }
    @ObservationIgnored private let core = TellCore.shared
    private static let draftKey = "tell.draft"

    public init(keepsDraft: Bool = true) {
        self.keepsDraft = keepsDraft
        text = keepsDraft ? (UserDefaults.standard.string(forKey: Self.draftKey) ?? "") : ""
    }

    /// What lines are read against, from `boot` and the lists' declarations, as Today assembles them (`native.ts`).
    public func learn(boot: JSONValue, schemas: JSONValue) {
        let currency = boot["currency"]?.string ?? boot["record"]?["currency"]?.string
        let native: JSONValue = [
            "registers": boot["registers"] ?? .array([]),
            "index": ["currency": currency.map(JSONValue.string) ?? .null],
            "me": ["name": boot["me"]?["name"] ?? .null],
        ]
        options = core.options(boot: native.text, schemas: schemas.text, today: Said.iso(Date()))
        for list in boot["registers"]?.array ?? [] {
            if let id = list["id"]?.string, let name = list["name"]?.string { names[id] = name }
        }
        if case .object(let lists) = schemas {
            for (id, decl) in lists {
                if let field = decl["fields"]?.array?.first(where: { $0["type"]?.string == "file" })?["id"]?.string { fileFields[id] = field }
            }
        }
        reread()
    }

    public var ready: Bool { options != nil && core.loaded }

    /// Learn from what the app kept last (`boot` and the declarations, in the App Group), so the share sheet and Siri can
    /// read lines at once; then from the record, which keeps the copy fresh. Signed out or offline, the kept copy stands.
    public func learnKeptThenFresh() async {
        if let boot = Kept.load("tell.boot", as: JSONValue.self), let schemas = Kept.load("tell.schemas", as: JSONValue.self) {
            learn(boot: boot, schemas: schemas)
        }
        guard Session.shared.signedIn, let (_, raw) = try? await Calls.boot(), let schemas = try? await Calls.schemas() else { return }
        Self.keep(boot: raw, schemas: schemas)
        learn(boot: raw, schemas: schemas)
    }

    /// Keep what lines are read against, for the extensions and the next cold start.
    public static func keep(boot: JSONValue, schemas: JSONValue) {
        Kept.save(boot, as: "tell.boot")
        Kept.save(schemas, as: "tell.schemas")
    }

    private func reread() {
        guard mode == .tell, let options else { lines = []; return }
        let sentences = text.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        var out: [Line] = []
        for (i, sentence) in sentences.prefix(12).enumerated() {
            guard let raw = core.read(sentence, options: options),
                  let told = try? JSONDecoder().decode(Told.self, from: Data(raw.utf8)) else { continue }
            out.append(Line(id: i, sentence: sentence, raw: raw, told: told))
        }
        if out.map(\.sentence) != lines.map(\.sentence) { chosen = [:] }
        lines = out
        if let receipt, receipt.kept == 0, !text.isEmpty { self.receipt = nil }
    }

    /// One of a line's offers, taken as what the line becomes.
    public func choose(_ row: Told.Row, for line: Line) {
        Haptic.select.play()
        chosen[line.id] = row
    }

    private func say(_ text: String?, refusal: Bool = true) {
        said = text
        saidIsRefusal = refusal
        if text != nil && refusal { Haptic.warning.play() }
    }

    /// The one primary: Add in Tell, Ask in Ask. Says what is missing rather than being disabled.
    public func press() async {
        switch mode {
        case .ask:
            let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !q.isEmpty else { return say(Words.askMissing) }
            say(nil)
            onAsk?(q)
        case .tell:
            await add()
        }
    }

    private func add() async {
        guard !sending else { return }
        guard let options, core.loaded else { return say(Words.tellUnavailable) }
        guard !lines.isEmpty else { return say(Words.tellMissing) }
        /* A CHOSEN OFFER STANDS FOR ITS LINE: the line is sent as that one entry, as the card's offer button sends it. */
        let tolds = lines.map { line -> String in
            guard let row = chosen[line.id], let data = try? JSONEncoder().encode(ChosenTold(rows: [row])) else { return line.raw }
            return String(decoding: data, as: UTF8.self)
        }
        guard let batch = core.batch(tolds, options: options) else { return say(Words.tellUnavailable) }
        guard batch.count > 0 else { return say(batch.held.isEmpty ? Words.nothingReady : batch.held) }
        sending = true
        say(nil)
        defer { sending = false }
        do {
            let (rows, fileSaid) = try await withAttachment(batch.rows)
            let made = try await Calls.capture(rows)
            let madeJSON = (try? JSONEncoder().encode(made.made.map { ["register": $0.register] })).map { String(decoding: $0, as: UTF8.self) } ?? "[]"
            let first = core.added(made: madeJSON, sent: batch.rows.text, options: options) ?? Words.add
            let sentence = [first, batch.held, fileSaid ?? ""].filter { !$0.isEmpty }.map { $0.hasSuffix(".") ? String($0.dropLast()) : $0 }.joined(separator: ". ")
            Haptic.success.play()
            /* A LINE THAT WENT NOWHERE STAYS IN THE FIELD, never dropped quietly: it is still what was typed, waiting for a
               list or for words that place it. */
            let left = lines.filter { $0.told.rows.isEmpty && chosen[$0.id] == nil }.map(\.sentence)
            receipt = Receipt(said: sentence.hasSuffix(".") ? sentence : sentence + ".", batch: made.batch, kept: left.count)
            chosen = [:]
            attachment = nil
            text = left.joined(separator: "\n")
            if left.isEmpty { lines = [] }
            onChanged?()
        } catch .offline {
            say(Words.notSentOffline)
        } catch {
            say(Words.failure(error))
        }
    }

    /// The rows with the attachment sent and set in the first one whose list keeps a file, and what to say when none
    /// does or it could not be sent: the entries are added all the same, as the web's share does.
    private func withAttachment(_ rows: JSONValue) async throws(CallFailure) -> (JSONValue, String?) {
        guard let attachment, var list = rows.array else { return (rows, nil) }
        guard let at = list.firstIndex(where: { fileFields[$0["register"]?.string ?? ""] != nil }),
              let register = list[at]["register"]?.string, let field = fileFields[register],
              case .object(var row) = list[at], case .object(var fields)? = row["fields"] else {
            return (rows, Words.fileNotKept(attachment.kind))
        }
        guard let data = attachment.fitted() else { return (rows, Words.fileTooBig(attachment.kind)) }
        let sent: SentFile
        do {
            sent = try await Client.shared.put(file: data.bytes, type: data.type)
        } catch .offline {
            throw .offline
        } catch {
            return (rows, Words.fileNotSent(attachment.kind))
        }
        fields[field] = ["sha256": .string(sent.sha256), "mime": .string(sent.mime), "bytes": .number(Double(sent.bytes)), "name": .string(data.name)]
        row["fields"] = .object(fields)
        list[at] = .object(row)
        return (.array(list), nil)
    }

    /// The receipt's Undo: the whole batch taken back.
    public func undo() async {
        guard let batch = receipt?.batch else { return }
        do {
            try await Calls.undo(batch: batch)
            Haptic.success.play()
            receipt = Receipt(said: Words.tellUndone, batch: nil)
            onChanged?()
        } catch {
            say(Words.failure(error))
        }
    }

    /// Opened again: a fresh start unless there are words kept from before.
    public func opened(prefill: String = "", mode: Mode = .tell) {
        self.mode = mode
        receipt = nil
        say(nil)
        if !prefill.isEmpty { text = prefill }
        reread()
    }
}

/// A `Told` holding one chosen offer, sent through the same batch as any line.
nonisolated private struct ChosenTold: Encodable {
    let rows: [Told.Row]
}

nonisolated extension Told.Row: Encodable {
    enum Keys: String, CodingKey { case register, fields, said, detail, icon, missing }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(register, forKey: .register)
        try c.encode(fields, forKey: .fields)
        try c.encode(said, forKey: .said)
        try c.encode(detail, forKey: .detail)
        try c.encode(icon, forKey: .icon)
        try c.encode(missing, forKey: .missing)
    }
}

/// The sheet: Tell or Ask, the words, "That becomes", and the one primary.
public struct TellSheet: View {
    @Bindable var model: TellModel
    @FocusState private var typing: Bool
    @Environment(\.dismiss) private var dismiss
    /// Whether Ask is offered beside Tell: not in the share sheet, whose words only ever become entries.
    let asks: Bool
    /// What Done does where there is no sheet to dismiss (the share extension, a Mac window).
    let done: (() -> Void)?

    public init(model: TellModel, asks: Bool = true, done: (() -> Void)? = nil) {
        self.model = model
        self.asks = asks
        self.done = done
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s4) {
                HStack(spacing: Space.s3) {
                    if asks {
                        Segmented([(TellModel.Mode.tell, Words.tell), (.ask, Words.ask)], chosen: $model.mode)
                            .frame(maxWidth: 220)
                    } else {
                        Text(Words.tellTitle).font(Typeface.heading).foregroundStyle(Palette.ink)
                    }
                    Spacer(minLength: 0)
                    Button(Words.done) { if let done { done() } else { dismiss() } }.buttonStyle(.bare)
                }

                field

                if let attachment = model.attachment {
                    attachmentView(attachment)
                }

                if let receipt = model.receipt {
                    receiptView(receipt)
                }
                if model.mode == .tell, !model.lines.isEmpty {
                    becomes
                }

                if let said = model.said {
                    Text(said)
                        .font(Typeface.meta)
                        .foregroundStyle(model.saidIsRefusal ? Palette.red : Palette.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.updatesFrequently)
                }

                VStack(alignment: .leading, spacing: Space.s2) {
                    Button {
                        Haptic.press.play()
                        Task { await model.press() }
                    } label: {
                        Text(model.mode == .ask ? Words.askIt : (model.sending ? Words.adding : Words.add))
                    }
                    .buttonStyle(.primary)
                    if model.mode == .tell {
                        Text(Words.addNothingYet).font(Typeface.meta).foregroundStyle(Palette.ink3)
                    }
                }
            }
            .padding(Space.gutter)
            .padding(.top, Space.s2)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Palette.tile)
        .onChange(of: model.mode) { _, _ in model.opened(mode: model.mode) }
        /* THE KEYBOARD COMES UP FOR AN EMPTY FIELD; words that arrived with it (a share, Siri) are read first. */
        .onAppear { typing = model.receipt == nil && model.text.isEmpty }
        .animation(.easeOut(duration: 0.18), value: model.lines)
        .animation(.easeOut(duration: 0.18), value: model.receipt)
    }

    private var field: some View {
        TextField("", text: $model.text, prompt: Text(model.mode == .ask ? Words.askLike : Words.tellLike).foregroundStyle(Palette.ink3), axis: .vertical)
            .font(Typeface.body)
            .foregroundStyle(Palette.ink)
            .lineLimit(3...8)
            .textFieldStyle(.plain)
            .focused($typing)
            .padding(Space.s3)
            .frame(minHeight: 96, alignment: .topLeading)
            .background(Palette.tile2, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .accessibilityLabel(model.mode == .ask ? Words.ask : Words.tell)
    }

    private func attachmentView(_ attachment: Attachment) -> some View {
        HStack(spacing: Space.s3) {
            if let picture = attachment.picture {
                picture.resizable().scaledToFill().frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                    .accessibilityHidden(true)
            } else {
                IconWell(.doc, size: .card)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.name).font(Typeface.bodyMedium).foregroundStyle(Palette.ink).lineLimit(1).truncationMode(.middle)
                Text(Words.attachmentGoes(attachment.kind)).font(Typeface.meta).foregroundStyle(Palette.ink3).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Button {
                Haptic.select.play()
                model.attachment = nil
            } label: {
                Glyph.close.image.resizable().scaledToFit().frame(width: 16, height: 16).foregroundStyle(Palette.ink3)
                    .frame(width: Space.tap, height: Space.tap)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Words.takeOff(attachment.kind))
        }
        .accessibilityElement(children: .contain)
    }

    private var becomes: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text(Words.becomes).font(Typeface.caption).foregroundStyle(Palette.ink3).accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) {
                ForEach(Array(model.lines.enumerated()), id: \.element.id) { index, line in
                    lineView(line)
                    if index < model.lines.count - 1 { Hairline() }
                }
            }
        }
    }

    @ViewBuilder private func lineView(_ line: TellModel.Line) -> some View {
        if let row = model.chosen[line.id] {
            rowView(row)
        } else if line.told.rows.isEmpty {
            VStack(alignment: .leading, spacing: Space.s2) {
                Text(line.sentence).font(Typeface.bodyMedium).foregroundStyle(Palette.ink).lineLimit(2)
                if let why = line.told.why {
                    Text(why).font(Typeface.meta).foregroundStyle(Palette.ink2).fixedSize(horizontal: false, vertical: true)
                }
                if let offers = line.told.offers, !offers.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Space.s2) {
                            ForEach(Array(offers.enumerated()), id: \.offset) { _, offer in
                                Button(Words.addTo(model.listName(offer.register))) { model.choose(offer, for: line) }
                                    .buttonStyle(BDButtonStyle(.quiet, onTile: true, full: false))
                            }
                        }
                    }
                }
            }
            .padding(.vertical, Space.s2)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(line.told.rows.enumerated()), id: \.offset) { _, row in rowView(row) }
            }
        }
    }

    private func rowView(_ row: Told.Row) -> some View {
        HStack(alignment: .top, spacing: Space.s3) {
            IconWell(Glyph.named(row.icon), size: .l, tone: row.missing.isEmpty ? .neutral : .warn)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.said).font(Typeface.bodyMedium).foregroundStyle(Palette.ink).lineLimit(2)
                if !row.detail.isEmpty {
                    Text(row.detail).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(2)
                }
                if !row.missing.isEmpty {
                    Text(Words.needs(row.missing)).font(Typeface.meta).foregroundStyle(Palette.warn)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, Space.s2)
        .accessibilityElement(children: .combine)
    }

    private func receiptView(_ receipt: TellModel.Receipt) -> some View {
        HStack(alignment: .top, spacing: Space.s3) {
            IconWell(.check, size: .l, tone: .good)
            VStack(alignment: .leading, spacing: Space.s2) {
                Text(receipt.said).font(Typeface.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                if receipt.kept > 0 {
                    Text(Words.keptInField(receipt.kept)).font(Typeface.meta).foregroundStyle(Palette.ink3).fixedSize(horizontal: false, vertical: true)
                }
                if receipt.batch != nil {
                    Button(Words.undo) { Task { await model.undo() } }
                        .buttonStyle(BDButtonStyle(.quiet, onTile: true, full: false))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, Space.s2)
    }
}
