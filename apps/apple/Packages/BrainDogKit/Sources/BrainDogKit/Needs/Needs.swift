import Observation
import SwiftUI

/// Needs you, natively (plan 3.4, M3): what waits on the reader, then what was put off, read from the record's own two
/// queues (`governance.open`, `governance.later`) in the order the record ranks them.
///
/// ONE PRESS WHERE ONE PRESS IS SAFE. A swipe right gives the answer the web's Enter gives (`Question.quickAnswer`):
/// the suggested one, on a question that is easy to undo and moves no money. A swipe left puts it off. A tap opens its
/// card in the web app, where every other question is answered whole. Each answer is felt and said, with Undo.
///
/// ROLE-AWARE: the swipes are there only where the reader may answer (they can decide on the record, or the question was
/// handed to them); otherwise the row is a door to its card and nothing else, and the screen says why. The record still
/// refuses anything else.
@Observable
public final class NeedsModel {
    public private(set) var needs: Needs = Kept.load("needs", as: Needs.self) ?? .empty
    /// The last read failed for want of a network, and the screen shows what was kept.
    public private(set) var offline = false
    public private(set) var reading = false
    /// Read at least once since launch (or kept from before), so an empty screen is a true empty.
    public private(set) var known = Kept.load("needs", as: Needs.self) != nil
    /// Who the reader is and what they hold, from `boot`.
    public var level: Level = .none
    public var me: String?

    public let toasts = Toasts()
    /// The question whose Later is open.
    public var putting: Question?
    /// A question's card, opened in the web app.
    @ObservationIgnored public var onOpen: ((String) -> Void)?
    /// The count changed: the tab's badge follows.
    @ObservationIgnored public var onCount: ((Int) -> Void)?

    public init() {}

    public func canAnswer(_ q: Question) -> Bool {
        level.decides || (q.decider != nil && q.decider == me)
    }

    /// Read both queues again; offline, keep showing the last read and say when it was.
    public func read() async {
        guard !reading else { return }
        reading = true
        defer { reading = false }
        do {
            let fresh = try await Calls.needs()
            withAnimation(.easeOut(duration: 0.18)) {
                needs = fresh
                offline = false
                known = true
            }
            Kept.save(fresh, as: "needs")
            onCount?(fresh.waiting)
        } catch .offline {
            offline = true
        } catch {
            /* A refusal or a lost session: the shell signs in again on a 401; anything else leaves the last read standing. */
        }
    }

    /// The suggested answer, given with one swipe.
    public func answer(_ q: Question, with option: Question.Option) async {
        let was = needs
        withAnimation(.easeOut(duration: 0.18)) { drop(q.id) }
        do {
            switch try await Calls.answer(q.id, option: option.key) {
            case .written(let decision):
                Haptic.success.play()
                toasts.say(Words.answered(option.label), undo: decision.map { id in { [weak self] in await self?.takeBack(id) } })
                await read()
            case .wantsReason:
                withAnimation { needs = was }
                toasts.say(Words.wantsReason)
                onOpen?(q.path)
            }
        } catch {
            withAnimation { needs = was }
            Haptic.warning.play()
            toasts.say(Words.failure(error))
        }
    }

    /// Put off until a day, with why.
    public func later(_ q: Question, until day: Date, why: String) async -> Bool {
        let was = needs
        withAnimation(.easeOut(duration: 0.18)) { drop(q.id) }
        do {
            try await Calls.later(q.id, until: Said.iso(day), why: why)
            Haptic.success.play()
            toasts.say(Words.putOff(Said.day(day, weekday: true)))
            await read()
            return true
        } catch {
            withAnimation { needs = was }
            Haptic.warning.play()
            toasts.say(Words.failure(error))
            return false
        }
    }

    private func takeBack(_ decision: String) async {
        do {
            try await Calls.undo(decision: decision)
            toasts.say(Words.undone)
        } catch {
            toasts.say(Words.failure(error))
        }
        await read()
    }

    private func drop(_ id: String) {
        needs.open.removeAll { $0.id == id }
        needs.waiting = max(0, needs.waiting - 1)
        onCount?(needs.waiting)
    }
}

/// The Needs you screen.
public struct NeedsView: View {
    @Bindable var model: NeedsModel
    /// Opens Tell, the empty screen's one action; nil where the reader cannot add.
    let tell: (() -> Void)?

    public init(model: NeedsModel, tell: (() -> Void)?) {
        self.model = model
        self.tell = tell
    }

    public var body: some View {
        List {
            if model.offline {
                note(Words.offlineSince(Said.time(model.needs.readAt)), glyph: .alert)
            }
            if model.level != .none, !model.level.decides, model.needs.open.contains(where: { !model.canAnswer($0) }) {
                note(Words.readOnlyNeeds, glyph: .eye)
            }
            if model.needs.open.isEmpty && model.known {
                empty
            }
            if !model.needs.open.isEmpty {
                /* THE SCREEN IS ALREADY NAMED NEEDS YOU, WITH ITS COUNT ON THE TAB: this heading only tells the two lists
                   apart, so with nothing put off it is not drawn and the rows open 12 under the bar. */
                if model.needs.later.isEmpty {
                    Color.clear.frame(height: Space.pageTop).listRowInsets(EdgeInsets()).listRowBackground(Color.clear).listRowSeparator(.hidden).accessibilityHidden(true)
                } else {
                    header(Words.waitingOnYou, count: model.needs.waiting, first: true)
                }
                rows(model.needs.open, later: false)
            }
            if !model.needs.later.isEmpty {
                header(Words.later, count: model.needs.later.count, first: model.needs.open.isEmpty && !model.known)
                rows(model.needs.later, later: true)
            }
            Color.clear.frame(height: Space.foot).listRowBackground(Color.clear).listRowSeparator(.hidden)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Ground())
                /* A HEADING IS A ROW AS TALL AS ITS WORDS AND ITS OWN PADDING, never pinned over the rows under it. */
        .environment(\.defaultMinListRowHeight, 0)
        .refreshable {
            Haptic.select.play()
            await model.read()
        }
        .overlay(alignment: .bottom) { ToastView(model.toasts).padding(.bottom, Space.s2) }
        .sheet(item: $model.putting) { q in
            LaterSheet(question: q) { day, why in await model.later(q, until: day, why: why) }
        }
        .task { await model.read() }
    }

    // MARK: parts

    /// A section's heading: 12 under the bar when it comes first, 32 under the card before it otherwise, and 12 over its
    /// own card, on the card's text edge.
    private func header(_ title: String, count: Int, first: Bool) -> some View {
        HStack(spacing: Space.s2) {
            Text(title).font(Typeface.tileHeading).foregroundStyle(Palette.ink)
            Text(count, format: .number).font(Typeface.meta).monospacedDigit().foregroundStyle(Palette.ink3)
            Spacer(minLength: 0)
        }
        .padding(.top, first ? Space.pageTop : Space.sectionGap)
        .padding(.bottom, Space.sectionHeadGap)
        .listRowInsets(EdgeInsets(top: 0, leading: Space.gutter + Space.tilePad, bottom: 0, trailing: Space.gutter))
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private func note(_ text: String, glyph: Glyph) -> some View {
        HStack(spacing: Space.s2) {
            glyph.image.resizable().frame(width: 16, height: 16).foregroundStyle(Palette.ink3).accessibilityHidden(true)
            Text(text).font(Typeface.meta).foregroundStyle(Palette.ink2).leading(.meta).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, Space.s1)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: Space.s2, leading: Space.gutter, bottom: 0, trailing: Space.gutter))
    }

    private var empty: some View {
        EmptyState(.decide, title: Words.nothingNeedsYou, line: Words.nothingNeedsYouLine) {
            if let tell {
                Button(Words.tellSomething, action: tell).buttonStyle(BDButtonStyle(.quiet, onTile: true, full: false))
            }
        }
        .padding(Space.s4)
        .card()
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: Space.pageTop, leading: Space.gutter, bottom: 0, trailing: Space.gutter))
    }

    @ViewBuilder private func rows(_ questions: [Question], later: Bool) -> some View {
        ForEach(Array(questions.enumerated()), id: \.element.id) { index, q in
            let first = index == 0
            let last = index == questions.count - 1
            NeedsRow(question: q, later: later, last: last)
                .contentShape(Rectangle())
                .onTapGesture {
                    Haptic.press.play()
                    model.onOpen?(q.path)
                }
                .accessibilityAddTraits(.isButton)
                .accessibilityAction(named: Text(Words.later)) { if model.canAnswer(q) { model.putting = q } }
                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                    if !later, model.canAnswer(q), let option = q.quickAnswer {
                        Button { Task { await model.answer(q, with: option) } } label: { Text(option.label) }
                            .tint(Palette.ink)
                    }
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    if !later, model.canAnswer(q) {
                        Button { model.putting = q } label: { Text(Words.later) }
                            .tint(Palette.ink3)
                    }
                }
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 0, leading: Space.gutter + Space.tilePad, bottom: 0, trailing: Space.gutter + Space.tilePad))
                .listRowBackground(
                    UnevenRoundedRectangle(
                        topLeadingRadius: first ? Radius.tile : 0, bottomLeadingRadius: last ? Radius.tile : 0,
                        bottomTrailingRadius: last ? Radius.tile : 0, topTrailingRadius: first ? Radius.tile : 0, style: .continuous)
                        .fill(Palette.tile)
                        .padding(.horizontal, Space.gutter)
                )
        }
    }
}

/// One question as a row: what it asks, then its suggested answer or when it comes back, then how long it has waited.
struct NeedsRow: View {
    let question: Question
    let later: Bool
    let last: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: Space.s3) {
                IconWell(glyph, size: .l, tone: question.cost == "undo" ? .warn : .neutral)
                VStack(alignment: .leading, spacing: 2) {
                    Text(question.question).font(Typeface.row).foregroundStyle(Palette.ink).lineLimit(2).leading(.row)
                    if let detail { Text(detail).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(1) }
                }
                Spacer(minLength: Space.s2)
                if let when {
                    Text(when).font(Typeface.meta).monospacedDigit().foregroundStyle(Palette.ink3)
                }
            }
            .padding(.vertical, Space.rowY)
            .frame(minHeight: Space.tap)
            if !last { Hairline(leading: 32 + Space.s3) }
        }
        .accessibilityElement(children: .combine)
    }

    private var glyph: Glyph {
        if !(question.money?.isEmpty ?? true) { return .money }
        return question.cost == "undo" ? .alert : .decide
    }

    private var detail: String? {
        if later, let back = Said.date(question.until) { return Words.comesBack(Said.day(back, weekday: true)) }
        if let suggested = question.options.first(where: { $0.recommended == true }) { return Words.suggested(suggested.label) }
        if let why = question.why, !why.isEmpty { return why }
        return nil
    }

    private var when: String? {
        guard !later, let at = Said.date(question.at) else { return nil }
        return Age.said(at)
    }
}

/// "now", "5m", "2h", "3d", then the day: how long something has waited, as a row's end says it.
enum Age {
    static func said(_ at: Date, now: Date = Date()) -> String {
        let s = max(0, now.timeIntervalSince(at))
        if s < 60 { return "now" }
        if s < 3600 { return "\(Int(s / 60))m" }
        if s < 86_400 { return "\(Int(s / 3600))h" }
        if s < 7 * 86_400 { return "\(Int(s / 86_400))d" }
        return Said.day(at, now: now)
    }
}

/// Later: until when, and why it can wait. The primary says what is missing rather than being disabled.
struct LaterSheet: View {
    enum Until: Hashable { case tomorrow, week, fortnight }

    let question: Question
    let put: (Date, String) async -> Bool
    @State private var until: Until = .week
    @State private var why = ""
    @State private var said: String?
    @State private var sending = false
    @FocusState private var typing: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            VStack(alignment: .leading, spacing: Space.s1) {
                Text(Words.laterTitle).font(Typeface.heading).foregroundStyle(Palette.ink)
                Text(question.question).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(2).leading(.meta)
            }
            Segmented([(Until.tomorrow, Words.tomorrow), (.week, Words.nextWeek), (.fortnight, Words.twoWeeks)], chosen: $until)
            Field(Words.whyItWaits) {
                TextField("", text: $why, prompt: Text(Words.whyItWaitsLike).foregroundStyle(Palette.ink3))
                    .font(Typeface.body)
                    .foregroundStyle(Palette.ink)
                    .focused($typing)
                    .submitLabel(.done)
                    .onSubmit { Task { await send() } }
            }
            if let said {
                Text(said).font(Typeface.meta).foregroundStyle(Palette.red).leading(.meta).fixedSize(horizontal: false, vertical: true)
            }
            Button {
                Haptic.press.play()
                Task { await send() }
            } label: {
                Text("\(Words.putItOff), \(Said.day(day, weekday: true))")
            }
            .buttonStyle(.primary)
            Spacer(minLength: 0)
        }
        .padding(Space.gutter)
        .padding(.top, Space.s2)
        .presentationDetents([.height(340)])
        .presentationDragIndicator(.visible)
        .onAppear { typing = true }
    }

    private var day: Date {
        let days = switch until { case .tomorrow: 1; case .week: 7; case .fortnight: 14 }
        return Calendar.current.date(byAdding: .day, value: days, to: Date()) ?? Date()
    }

    private func send() async {
        let words = why.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty else {
            Haptic.warning.play()
            said = Words.whyMissing
            return
        }
        guard !sending else { return }
        sending = true
        if await put(day, words) { dismiss() }
        sending = false
    }
}
