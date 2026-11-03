import BrainDogKit
import SwiftUI

/// The menu bar's mark: the Needs you glyph, and the count beside it when something waits (plan M6, Native extras).
struct MenuBarLabel: View {
    let count: Int

    var body: some View {
        HStack(spacing: 3) {
            if let image = Glyph.decide.templateImage(side: 16) { Image(nsImage: image) }
            if count > 0 { Text(count.formatted()).monospacedDigit() }
        }
        .accessibilityLabel(count > 0 ? Words.waitCount(count) : Words.nothingWaits)
    }
}

/// What the menu bar opens: the first questions waiting (each a press to its card), Tell, and the window.
struct MenuBarPanel: View {
    @State private var model = MacModel.shared
    @State private var session = Session.shared

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack(spacing: Space.s2) {
                Text(Words.needsYou).font(Typeface.tileHeading).foregroundStyle(Palette.ink)
                if model.count > 0 {
                    Text(model.count.formatted()).font(Typeface.tileHeading).foregroundStyle(Palette.red).monospacedDigit()
                }
                Spacer(minLength: 0)
                if let glance = model.glance, glance.readAt > .distantPast {
                    Text(Words.readAt(Said.time(glance.readAt))).font(Typeface.caption).foregroundStyle(Palette.ink3)
                }
            }

            if !session.signedIn {
                Text(Words.signInToSee).font(Typeface.meta).foregroundStyle(Palette.ink3)
            } else if let questions = model.glance?.questions, !questions.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(questions.prefix(3).enumerated()), id: \.element.id) { i, q in
                        Button { model.go(q.path) } label: {
                            Text(q.question).font(Typeface.body).foregroundStyle(Palette.ink).lineLimit(2).leading(.body)
                                .multilineTextAlignment(.leading)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, Space.s2)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if i < min(3, questions.count) - 1 { Hairline() }
                    }
                }
            } else {
                Text(Words.nothingWaits).font(Typeface.meta).foregroundStyle(Palette.ink3)
            }

            Hairline()

            HStack(spacing: Space.s2) {
                if session.signedIn, model.boot?.level.adds ?? true {
                    Button { model.openTell() } label: { Text(Words.tellLine) }
                        .buttonStyle(BDButtonStyle(.quiet, full: false))
                        .fixedSize()
                }
                Spacer(minLength: 0)
                Button(Words.openBrainDog) { model.go(model.count > 0 ? "/decide" : "/") }
                    .buttonStyle(BDButtonStyle(.ink, full: false))
                    .fixedSize()
            }
        }
        .padding(Space.s4)
        .frame(width: 340)
        /* THE MENU BAR'S OWN GLASS is the ground here: floating chrome, as the ops menus are. */
        .task { await model.read() }
    }
}

/// Tell in its own small window (⌘T, the menu bar, Siri): the same composer as on the iPhone, Ask handing the words to
/// the desk's own Ask.
struct TellWindow: View {
    @State private var model = MacModel.shared
    @Environment(\.dismiss) private var dismiss
    /// Files dropped on the window, on their way to a project or a task in a sheet over it.
    @State private var attaching: AttachModel?
    @State private var over = false

    var body: some View {
        TellSheet(model: model.tell, done: { dismiss() })
            .frame(width: 520)
            .frame(minHeight: 320)
            .background(Palette.tile)
            /* A FILE DROPPED ON TELL IS ATTACHED, not read as words: "Attach to…" in a sheet, a project or a task picked there. */
            .overlay { if over { DropRing() } }
            .onDrop(of: [.fileURL], isTargeted: $over) { providers in
                Task {
                    let files = await AttachModel.files(from: providers)
                    guard !files.isEmpty else { return }
                    if let attaching, attaching.receipt == nil {
                        files.forEach(attaching.add)
                    } else {
                        let next = AttachModel(files: files)
                        next.onChanged = { model.desk.emit("refresh") }
                        attaching = next
                    }
                }
                return true
            }
            .sheet(item: $attaching) { attach in
                AttachView(model: attach, opens: { target in attaching = nil; model.go(target.path) }, done: { attaching = nil })
                    .frame(width: 480, height: 560)
                    .background(Palette.tile)
            }
            .onAppear {
                model.tell.onAsk = { q in
                    dismiss()
                    model.go("/")
                    model.desk.emit("slash", q)
                }
                model.tell.onChanged = { model.desk.emit("refresh"); Task { await model.read() } }
            }
    }
}

/// Where a drop will land: the window's edge drawn in ink, with what letting go does.
struct DropRing: View {
    var body: some View {
        ZStack {
            Palette.tile.opacity(0.92)
            VStack(spacing: Space.s3) {
                IconWell(.download, size: .xl)
                Text(Words.attachDrop).font(Typeface.bodyMedium).foregroundStyle(Palette.ink).multilineTextAlignment(.center)
            }
            .padding(Space.s5)
        }
        .overlay(RoundedRectangle(cornerRadius: Radius.tile, style: .continuous).strokeBorder(Palette.ink, style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])).padding(Space.s2))
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
