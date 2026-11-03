import SwiftUI

/// "Attach to…", drawn natively: the files, a field that finds a project or a task (the newest first until something is
/// typed), the one primary, and the receipt with Undo. The share sheet, the Mac's quick panel and its Tell window draw it.
///
/// THE OPS LOOK IN BRAINDOG'S COLOURS, as Tell is drawn: the tile ground, ink and its two quieter inks, circles for a
/// what, hairlines between rows, one primary that says what it will do ("Attach to Northbound").
public struct AttachView: View {
    @Bindable var model: AttachModel
    @FocusState private var finding: Bool
    /// What sits at the head in place of the title: the share sheet's Attach | Tell.
    let lead: AnyView?
    let done: () -> Void
    /// Open the thing the files went on, where there is an app to open it in.
    let opens: ((AttachModel.Target) -> Void)?

    public init(model: AttachModel, lead: AnyView? = nil, opens: ((AttachModel.Target) -> Void)? = nil, done: @escaping () -> Void) {
        self.model = model
        self.lead = lead
        self.opens = opens
        self.done = done
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s4) {
                HStack(spacing: Space.s3) {
                    if let lead {
                        lead
                    } else {
                        Text(Words.attachTo).font(Typeface.heading).foregroundStyle(Palette.ink).accessibilityAddTraits(.isHeader)
                    }
                    Spacer(minLength: 0)
                    Button(Words.done, action: done).buttonStyle(.bare)
                }

                if model.files.isEmpty {
                    Text(Words.attachDrop).font(Typeface.meta).foregroundStyle(Palette.ink3)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(model.files.enumerated()), id: \.element.id) { i, file in
                            fileRow(file)
                            if i < model.files.count - 1 { Hairline(leading: 40 + Space.s3) }
                        }
                    }
                }

                if let receipt = model.receipt {
                    receiptView(receipt)
                } else {
                    picker
                }

                if let said = model.said {
                    Text(said)
                        .font(Typeface.meta)
                        .foregroundStyle(model.saidIsRefusal ? Palette.red : Palette.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.updatesFrequently)
                }

                if model.receipt == nil {
                    VStack(alignment: .leading, spacing: Space.s2) {
                        Button {
                            Haptic.press.play()
                            finding = false
                            Task { await model.send() }
                        } label: {
                            Text(model.sending ? Words.attaching : (model.chosen.map { Words.attachPress($0.title) } ?? Words.attachTab))
                                .lineLimit(1)
                        }
                        .buttonStyle(.primary)
                        Text(Words.attachHint).font(Typeface.meta).foregroundStyle(Palette.ink3).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(Space.gutter)
            .padding(.top, Space.s2)
        }
        .scrollDismissesKeyboard(.interactively)
        .task { await model.start() }
        .animation(.easeOut(duration: 0.18), value: model.shown)
        .animation(.easeOut(duration: 0.18), value: model.receipt)
        .animation(.easeOut(duration: 0.18), value: model.files)
    }

    // MARK: the files

    private func fileRow(_ file: AttachModel.File) -> some View {
        HStack(spacing: Space.s3) {
            IconWell(file.glyph, size: .card, tone: tone(file.state))
            VStack(alignment: .leading, spacing: 2) {
                Text(file.name).font(Typeface.bodyMedium).foregroundStyle(Palette.ink).lineLimit(1).truncationMode(.middle)
                switch file.state {
                case .refused(let why):
                    Text(why).font(Typeface.meta).foregroundStyle(Palette.red).fixedSize(horizontal: false, vertical: true)
                case .sending:
                    Text(Words.attaching).font(Typeface.meta).foregroundStyle(Palette.ink3)
                case .sent:
                    Text("\(file.detail) · \(Words.attachSent)").font(Typeface.meta).foregroundStyle(Palette.good)
                case .waiting:
                    Text(file.detail).font(Typeface.meta).foregroundStyle(Palette.ink3)
                }
            }
            Spacer(minLength: 0)
            if file.state == .sending {
                ProgressView().controlSize(.small)
            } else if model.receipt == nil, !model.sending {
                Button {
                    Haptic.select.play()
                    model.remove(file)
                } label: {
                    Glyph.close.image.resizable().scaledToFit().frame(width: 16, height: 16).foregroundStyle(Palette.ink3)
                        .frame(width: Space.tap, height: Space.tap)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Words.takeOffFile(file.name))
            }
        }
        .padding(.vertical, Space.s1)
        .accessibilityElement(children: .contain)
    }

    private func tone(_ state: AttachModel.File.State) -> IconWell.Tone {
        switch state {
        case .sent: .good
        case .refused: .late
        default: .neutral
        }
    }

    // MARK: where it goes

    private var picker: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            HStack(spacing: Space.s2) {
                Glyph.search.image.resizable().scaledToFit().frame(width: 16, height: 16).foregroundStyle(Palette.ink3).accessibilityHidden(true)
                TextField("", text: $model.query, prompt: Text(Words.attachFind).foregroundStyle(Palette.ink3))
                    .font(Typeface.body)
                    .foregroundStyle(Palette.ink)
                    .textFieldStyle(.plain)
                    .focused($finding)
                    .autocorrectionDisabled()
                    .accessibilityLabel(Words.attachFind)
                if model.searching { ProgressView().controlSize(.small) }
            }
            .padding(.horizontal, Space.s3)
            .frame(minHeight: Space.control)
            .fieldWell()

            Text(model.query.trimmingCharacters(in: .whitespaces).count >= 2 ? Words.attachFound : Words.attachRecent)
                .font(Typeface.caption).foregroundStyle(Palette.ink3).accessibilityAddTraits(.isHeader)
                .padding(.top, Space.s2)

            let shown = model.shown
            if shown.isEmpty {
                Text(emptyLine).font(Typeface.meta).foregroundStyle(Palette.ink2).fixedSize(horizontal: false, vertical: true)
                    .padding(.vertical, Space.s2)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(shown.prefix(12).enumerated()), id: \.element.id) { i, target in
                        targetRow(target)
                        if i < min(shown.count, 12) - 1 { Hairline(leading: 32 + Space.s3) }
                    }
                }
            }
        }
    }

    private var emptyLine: String {
        let q = model.query.trimmingCharacters(in: .whitespaces)
        if q.count >= 2 { return model.searching ? Words.attachLoading : Words.attachNoMatch(q) }
        return model.loading ? Words.attachLoading : Words.attachNoLists
    }

    private func targetRow(_ target: AttachModel.Target) -> some View {
        let on = model.chosen == target
        return Button {
            model.choose(target)
        } label: {
            HStack(spacing: Space.s3) {
                IconWell(Glyph.named(target.icon), size: .l, tone: on ? .info : .neutral)
                VStack(alignment: .leading, spacing: 2) {
                    Text(target.title).font(Typeface.bodyMedium).foregroundStyle(Palette.ink).lineLimit(1)
                    Text(target.list).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(1)
                }
                Spacer(minLength: 0)
                if on {
                    Glyph.check.image.resizable().scaledToFit().frame(width: 18, height: 18).foregroundStyle(Palette.ink)
                        .accessibilityHidden(true)
                }
            }
            .padding(.vertical, Space.s2)
            .padding(.horizontal, Space.s1)
            .background(on ? Wash.row : Color.clear, in: RoundedRectangle(cornerRadius: Radius.row, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }

    // MARK: the receipt

    private func receiptView(_ receipt: AttachModel.Receipt) -> some View {
        HStack(alignment: .top, spacing: Space.s3) {
            IconWell(.check, size: .l, tone: .good)
            VStack(alignment: .leading, spacing: Space.s2) {
                Text(receipt.said).font(Typeface.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: Space.s2) {
                    if !receipt.ids.isEmpty {
                        Button(Words.undo) { Task { await model.undo() } }
                            .buttonStyle(BDButtonStyle(.quiet, onTile: true, full: false))
                    }
                    if let opens, !receipt.ids.isEmpty {
                        Button(Words.attachOpen) { opens(receipt.target) }
                            .buttonStyle(BDButtonStyle(.quiet, onTile: true, full: false))
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, Space.s2)
    }
}
