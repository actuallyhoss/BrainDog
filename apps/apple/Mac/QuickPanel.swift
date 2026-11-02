import AppKit
import BrainDogKit
import Observation
import SwiftUI

/// The ⌥Space panel (plan 3.9 and M6, Native extras): a floating panel over whatever app is in front, 640 wide in the top
/// third of the screen the pointer is on, with two modes. **Tell** reads each line with the same `tell-core.js` as the
/// Tell sheet and Enter adds them in one `capture`, with Undo on the receipt. **Search** finds a place or an entry and
/// Enter opens it in the BrainDog window. Escape closes it, and so does a press anywhere else.
///
/// IT DOES NOT TAKE THE MAC FROM THE APP IN FRONT. The panel is non-activating: it takes the keys while it shows, and the
/// app the person was in stays the active one, as Spotlight does. Only opening something in the window brings BrainDog
/// forward.
@MainActor
final class QuickPanel: NSObject, NSWindowDelegate {
    static let shared = QuickPanel()

    let model = QuickModel()
    private var panel: Panel?
    /// Where the panel's top edge sits, kept while its height follows what it shows.
    private var top: NSPoint?

    var isShown: Bool { panel?.isVisible == true }

    /// The shortcut's press: open, or close when it is already open.
    func toggle() {
        if isShown { close() } else { show() }
    }

    func show(mode: QuickModel.Mode? = nil, text: String? = nil) {
        guard Session.shared.signedIn else {
            /* SIGNED OUT, THERE IS NOTHING TO TELL OR SEARCH: the window, at Sign in. */
            MacModel.shared.front()
            return
        }
        let panel = self.panel ?? make()
        model.opened(mode: mode, text: text)
        let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main ?? NSScreen.screens[0]
        let area = screen.visibleFrame
        let size = panel.frame.size
        let at = NSPoint(x: (area.midX - size.width / 2).rounded(), y: (area.maxY - area.height * 0.22).rounded())
        top = at
        panel.setFrameTopLeftPoint(at)
        /* A QUIET DEBUG WALK only shows it: taking the keys would take them from the person at this Mac. */
        if MacModel.quiet {
            panel.alphaValue = 0
            panel.ignoresMouseEvents = true
            panel.orderFrontRegardless()
        } else {
            panel.makeKeyAndOrderFront(nil)
        }
    }

    func close() {
        panel?.orderOut(nil)
        model.closed()
    }

    private func make() -> Panel {
        let panel = Panel(contentRect: NSRect(x: 0, y: 0, width: QuickModel.width, height: 120),
                          styleMask: [.nonactivatingPanel, .titled, .fullSizeContentView], backing: .buffered, defer: true)
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] { panel.standardWindowButton(kind)?.isHidden = true }
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient, .ignoresCycle]
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.becomesKeyOnlyIfNeeded = false
        panel.backgroundColor = PlatformPalette.tile
        panel.animationBehavior = .utilityWindow
        panel.title = "Quick panel"
        panel.delegate = self
        let host = NSHostingController(rootView: QuickPanelView(model: model))
        host.sizingOptions = [.preferredContentSize]
        /* NO ROOM FOR A TITLE BAR: the panel has none to show, so its content starts at its top edge. */
        host.safeAreaRegions = []
        panel.contentViewController = host
        panel.onEscape = { [weak self] in self?.close() }
        self.panel = panel
        return panel
    }

    /* THE TOP STAYS PUT AS THE PANEL GROWS with lines or results: AppKit keeps the bottom-left corner, so it is moved back. */
    func windowDidResize(_ notification: Notification) {
        guard let panel, let top, panel.frame.maxY != top.y else { return }
        panel.setFrameTopLeftPoint(NSPoint(x: panel.frame.minX, y: top.y))
    }

    func windowDidMove(_ notification: Notification) {
        guard let panel, panel.isVisible else { return }
        top = NSPoint(x: panel.frame.minX, y: panel.frame.maxY)
    }

    /* A PRESS ANYWHERE ELSE CLOSES IT, as Spotlight's does. */
    func windowDidResignKey(_ notification: Notification) {
        #if DEBUG
        /* The screenshot walk leaves it open behind the window it draws from. */
        if UserDefaults.standard.string(forKey: "braindogPress") != nil { return }
        #endif
        close()
    }

    /// The panel itself: it takes the keys without making BrainDog the active app, and Escape closes it.
    final class Panel: NSPanel {
        var onEscape: (() -> Void)?
        override var canBecomeKey: Bool { true }
        override var canBecomeMain: Bool { false }
        override func cancelOperation(_ sender: Any?) { onEscape?() }
    }
}

/// What the panel holds: its mode, the words, and in Search the places and entries that match.
@Observable
@MainActor
final class QuickModel {
    enum Mode: Hashable { case tell, search }

    static let width: CGFloat = 640

    var mode: Mode = .tell {
        didSet { if mode != oldValue { switched() } }
    }
    /// Search's words (Tell's are the Tell model's own, so the Tell window and the panel share one draft).
    var query = "" {
        didSet { if query != oldValue { find() } }
    }
    private(set) var hits: [Hit] = []
    private(set) var searching = false
    /// The result Enter opens, moved by the arrow keys.
    var selected = 0
    /// Bumped each time the panel opens, so the field takes the keys again.
    private(set) var opens = 0

    var tell: TellModel { MacModel.shared.tell }

    @ObservationIgnored private var finding: Task<Void, Never>?

    /// Places first (the web's own, then the record's pages), then the entries the search found.
    var results: [Result] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let places = MacModel.shared.places.filter { q.isEmpty || $0.label.lowercased().contains(q) }
            .map { Result(id: "p" + $0.href, title: $0.label, detail: Words.places, glyph: Glyph.named($0.icon), path: $0.href) }
        let entries = hits.map { hit in
            Result(id: "h" + hit.id, title: hit.title, detail: MacModel.shared.listName(hit.register), glyph: MacModel.shared.listGlyph(hit.register), path: hit.path)
        }
        return Array((places + entries).prefix(9))
    }

    struct Result: Identifiable, Equatable {
        let id: String
        let title: String
        let detail: String
        let glyph: Glyph
        let path: String
    }

    func opened(mode: Mode?, text: String?) {
        if let mode { self.mode = mode }
        if let text {
            if self.mode == .tell { tell.text = text } else { query = text }
        }
        tell.opened(mode: .tell)
        selected = 0
        opens += 1
    }

    func closed() {
        finding?.cancel()
        /* A RECEIPT IS FOR THE PRESS IT ANSWERED: the next open starts clean, with any words not yet added still there. */
        tell.opened(mode: .tell)
        query = ""
        hits = []
    }

    private func switched() {
        selected = 0
        if mode == .tell { tell.opened(mode: .tell) }
    }

    /// Enter: Tell adds the lines; Search opens what is chosen in the window.
    func enter() async {
        switch mode {
        case .tell:
            await tell.press()
            if tell.receipt != nil { MacModel.shared.desk.emit("refresh"); Task { await MacModel.shared.read() } }
        case .search:
            let list = results
            guard list.indices.contains(selected) else { return }
            QuickPanel.shared.close()
            MacModel.shared.go(list[selected].path)
        }
    }

    /// ⌘Enter: the words carried on to the window, Tell to Ask about them, Search to the page's own search.
    func carry() {
        let words = mode == .tell ? tell.text.trimmingCharacters(in: .whitespacesAndNewlines) : query
        QuickPanel.shared.close()
        let model = MacModel.shared
        model.front()
        if mode == .tell {
            model.desk.emit("slash", words.isEmpty ? nil : words)
        } else {
            model.desk.emit("search", words.isEmpty ? nil : words)
        }
    }

    func move(_ by: Int) {
        let n = results.count
        guard n > 0 else { return }
        selected = (selected + by + n) % n
    }

    /* THE SEARCH WAITS FOR A PAUSE IN THE TYPING (180 ms), and an older answer never lands over a newer one. */
    private func find() {
        finding?.cancel()
        selected = 0
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { hits = []; searching = false; return }
        searching = true
        finding = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(180))
            guard !Task.isCancelled else { return }
            let found = (try? await Calls.search(q)) ?? []
            guard !Task.isCancelled, let self else { return }
            self.hits = found
            self.searching = false
        }
    }
}

/// The panel's face: the two modes, one field, and under it what the words become or what was found.
struct QuickPanelView: View {
    @Bindable var model: QuickModel
    @State private var hotKey = HotKey.shared
    @FocusState private var typing: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: Space.s3) {
                IconWell(model.mode == .tell ? .slash : .search, size: .l)
                field
                Segmented([(QuickModel.Mode.tell, Words.tell), (.search, Words.searchTab)], chosen: $model.mode)
                    .frame(width: 160)
            }
            .padding(Space.s4)

            if model.mode == .tell {
                tellBody
            } else {
                searchBody
            }

            Hairline()
            footer
                .padding(.horizontal, Space.s4)
                .padding(.vertical, Space.s2)
        }
        .frame(width: QuickModel.width)
        .background(Palette.tile)
        .environment(\.font, Typeface.body)
        .onAppear { typing = true }
        .onChange(of: model.opens) { _, _ in typing = true }
        .onChange(of: model.mode) { _, _ in typing = true }
        .onKeyPress(.tab) {
            model.mode = model.mode == .tell ? .search : .tell
            return .handled
        }
        .animation(.easeOut(duration: 0.15), value: model.tell.lines)
        .animation(.easeOut(duration: 0.15), value: model.results)
    }

    @ViewBuilder private var field: some View {
        if model.mode == .tell {
            @Bindable var tell = model.tell
            TextField("", text: $tell.text, prompt: Text(Words.tellLike).foregroundStyle(Palette.ink3), axis: .vertical)
                .lineLimit(1...6)
                .modifier(FieldLook(typing: $typing))
                .onKeyPress(keys: [.return]) { press in
                    /* ⇧↩ or ⌥↩ is a new line; ⌘↩ hands the words to Ask in the window; ↩ adds. */
                    if press.modifiers.contains(.shift) || press.modifiers.contains(.option) { return .ignored }
                    if press.modifiers.contains(.command) { model.carry(); return .handled }
                    Task { await model.enter() }
                    return .handled
                }
                .accessibilityLabel(Words.tell)
        } else {
            TextField("", text: $model.query, prompt: Text(Words.searchPrompt).foregroundStyle(Palette.ink3))
                .modifier(FieldLook(typing: $typing))
                .onKeyPress(keys: [.return]) { press in
                    if press.modifiers.contains(.command) { model.carry(); return .handled }
                    Task { await model.enter() }
                    return .handled
                }
                .onKeyPress(.downArrow) { model.move(1); return .handled }
                .onKeyPress(.upArrow) { model.move(-1); return .handled }
                .accessibilityLabel(Words.searchPrompt)
        }
    }

    private struct FieldLook: ViewModifier {
        var typing: FocusState<Bool>.Binding
        func body(content: Content) -> some View {
            content
                .font(Typeface.heading)
                .foregroundStyle(Palette.ink)
                .textFieldStyle(.plain)
                .focused(typing)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: Tell

    @ViewBuilder private var tellBody: some View {
        let tell = model.tell
        if tell.receipt != nil || !tell.lines.isEmpty || tell.said != nil {
            VStack(alignment: .leading, spacing: Space.s2) {
                if let receipt = tell.receipt {
                    HStack(alignment: .top, spacing: Space.s3) {
                        IconWell(.check, size: .m, tone: .good)
                        Text(receipt.said).font(Typeface.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        if receipt.batch != nil {
                            Button(Words.undo) { Task { await tell.undo() } }
                                .buttonStyle(BDButtonStyle(.quiet, onTile: true, full: false))
                                .fixedSize()
                        }
                    }
                }
                if !tell.lines.isEmpty {
                    Text(Words.becomes).font(Typeface.caption).foregroundStyle(Palette.ink3).accessibilityAddTraits(.isHeader)
                    VStack(spacing: 0) {
                        ForEach(Array(tell.lines.enumerated()), id: \.element.id) { i, line in
                            lineRow(line)
                            if i < tell.lines.count - 1 { Hairline() }
                        }
                    }
                }
                if let said = tell.said {
                    Text(said).font(Typeface.meta).foregroundStyle(tell.saidIsRefusal ? Palette.red : Palette.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, Space.s4)
            .padding(.bottom, Space.s3)
        }
    }

    @ViewBuilder private func lineRow(_ line: TellModel.Line) -> some View {
        if let row = model.tell.chosen[line.id] ?? line.told.rows.first, line.told.rows.count <= 1 || model.tell.chosen[line.id] != nil {
            entryRow(row)
        } else if !line.told.rows.isEmpty {
            VStack(spacing: 0) { ForEach(Array(line.told.rows.enumerated()), id: \.offset) { _, row in entryRow(row) } }
        } else {
            HStack(alignment: .top, spacing: Space.s3) {
                IconWell(.alert, size: .m, tone: .warn)
                VStack(alignment: .leading, spacing: 2) {
                    Text(line.sentence).font(Typeface.bodyMedium).foregroundStyle(Palette.ink).lineLimit(1)
                    Text(line.told.why ?? Words.quickNotPlaced).font(Typeface.meta).foregroundStyle(Palette.ink2).lineLimit(2)
                }
                Spacer(minLength: 0)
                if let offer = line.told.offers?.first {
                    Button(Words.addTo(model.tell.listName(offer.register))) { model.tell.choose(offer, for: line) }
                        .buttonStyle(BDButtonStyle(.quiet, onTile: true, full: false))
                        .fixedSize()
                }
            }
            .padding(.vertical, Space.s2)
        }
    }

    private func entryRow(_ row: Told.Row) -> some View {
        HStack(alignment: .top, spacing: Space.s3) {
            IconWell(Glyph.named(row.icon), size: .m, tone: row.missing.isEmpty ? .neutral : .warn)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.said).font(Typeface.bodyMedium).foregroundStyle(Palette.ink).lineLimit(1)
                if !row.missing.isEmpty {
                    Text(Words.needs(row.missing)).font(Typeface.meta).foregroundStyle(Palette.warn).lineLimit(1)
                } else if !row.detail.isEmpty {
                    Text(row.detail).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, Space.s2)
        .accessibilityElement(children: .combine)
    }

    // MARK: Search

    @ViewBuilder private var searchBody: some View {
        let results = model.results
        if !results.isEmpty {
            VStack(spacing: 2) {
                ForEach(Array(results.enumerated()), id: \.element.id) { i, result in
                    Button {
                        model.selected = i
                        Task { await model.enter() }
                    } label: {
                        HStack(spacing: Space.s3) {
                            IconWell(result.glyph, size: .m)
                            Text(result.title).font(Typeface.bodyMedium).foregroundStyle(Palette.ink).lineLimit(1)
                            Spacer(minLength: Space.s2)
                            Text(result.detail).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(1)
                        }
                        .padding(.horizontal, Space.s2)
                        .padding(.vertical, 6)
                        .background(i == model.selected ? Palette.hover : Color.clear, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, Space.s2)
            .padding(.bottom, Space.s3)
        } else if model.query.trimmingCharacters(in: .whitespaces).count >= 2, !model.searching {
            VStack(alignment: .leading, spacing: 2) {
                Text(Words.nothingFound(model.query)).font(Typeface.body).foregroundStyle(Palette.ink)
                Text(Words.nothingFoundNext).font(Typeface.meta).foregroundStyle(Palette.ink3)
            }
            .padding(.horizontal, Space.s4)
            .padding(.bottom, Space.s3)
        }
    }

    // MARK: footer

    private var footer: some View {
        HStack(spacing: Space.s4) {
            Text(model.mode == .tell ? Words.quickTellKeys : Words.quickSearchKeys)
                .font(Typeface.caption).foregroundStyle(Palette.ink3)
            Spacer(minLength: 0)
            if let shortcut = hotKey.shortcut, hotKey.state == .on {
                Text(Words.quickOpensWith(shortcut.said)).font(Typeface.caption).foregroundStyle(Palette.ink3)
            }
        }
    }
}

extension Words {
    static let quickTellKeys = "↩ Add   ⇧↩ New line   ⌘↩ Ask   Tab Search   Esc Close"
    static let quickSearchKeys = "↩ Open   ↑↓ Choose   ⌘↩ Search in the window   Tab Tell   Esc Close"
    static let quickNotPlaced = "Not sure where this goes."
    static func quickOpensWith(_ keys: String) -> String { "\(keys) opens this anywhere" }
}
