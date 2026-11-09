import BrainDogKit
import SwiftUI

/// The face's sheet (plan 3.4, 3.6): who is signed in here, every BrainDog they can reach with the plain word for what
/// they hold there, a press on another to open it on this session, Settings, and Sign out.
struct AccountSheet: View {
    @State private var app = AppModel.shared
    @State private var reach: [Reach] = []
    @State private var opening: String?
    @State private var said: String?
    @State private var tall: CGFloat = 0
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s5) {
                HStack(spacing: Space.s3) {
                    Face(app.boot?.me?.name ?? "B", side: 44, picture: app.boot?.me?.picture)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(app.boot?.me?.name ?? Words.account).font(Typeface.heading).foregroundStyle(Palette.ink)
                    }
                    Spacer(minLength: 0)
                    Button(Words.done) { dismiss() }.buttonStyle(.bare)
                }

                VStack(alignment: .leading, spacing: Space.sectionHeadGap) {
                    Text(Words.yourBrainDogs).font(Typeface.caps).textCase(.uppercase).tracking(0.3).foregroundStyle(Palette.ink3)
                        .padding(.leading, Space.tilePad)
                        .accessibilityAddTraits(.isHeader)
                    VStack(spacing: 0) {
                        ForEach(Array(shown.enumerated()), id: \.element.id) { index, row in
                            Button {
                                Task { await open(row) }
                            } label: {
                                HStack(spacing: Space.s3) {
                                    IconWell(.home, size: .l)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(row.name).font(Typeface.bodyMedium).foregroundStyle(Palette.ink)
                                        Text(opening == row.slug ? Words.opening : row.role).font(Typeface.meta).foregroundStyle(Palette.ink3)
                                    }
                                    Spacer(minLength: 0)
                                    if row.slug == here {
                                        Glyph.check.image.resizable().frame(width: 18, height: 18).foregroundStyle(Palette.ink)
                                            .accessibilityLabel(Words.signedInHere)
                                    }
                                }
                                .padding(.vertical, Space.rowY)
                                .frame(minHeight: Space.tap)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(row.slug == here ? .isSelected : [])
                            if index < shown.count - 1 { Hairline(leading: 32 + Space.s3) }
                        }
                    }
                    .padding(.horizontal, Space.tilePad)
                    .background(Palette.tile, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
                    if let said {
                        Text(said).font(Typeface.meta).foregroundStyle(Palette.red).leading(.meta).fixedSize(horizontal: false, vertical: true)
                    }
                }

                VStack(spacing: 0) {
                    Button {
                        Haptic.press.play()
                        dismiss()
                        app.current?.path.append(.settings)
                    } label: {
                        HStack(spacing: Space.s3) {
                            Row(Words.settings, glyph: .settings)
                            Glyph.chevron.image.resizable().frame(width: 14, height: 14).foregroundStyle(Palette.ink3).accessibilityHidden(true)
                        }
                    }
                    .buttonStyle(.plain)
                    Hairline(leading: 32 + Space.s3)
                    Button {
                        Task {
                            dismiss()
                            /* THIS PHONE STOPS BEING RUNG ON THIS BRAINDOG FIRST, while the session can still say so (M4). */
                            await Push.unregister(record: app.boot?.record?.slug)
                            await Session.shared.signOut()
                        }
                    } label: {
                        Row(Words.signOut, glyph: .external)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, Space.tilePad)
                .background(Palette.tile, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
            }
            .padding(Space.gutter)
            .padding(.top, Space.s2)
            /* THE SHEET IS AS TALL AS WHAT IT HOLDS, with no blurred half under Sign out. */
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { tall = $0 }
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(Ground())
        .presentationDetents(tall > 0 ? [.height(tall + Space.s4)] : [.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(Palette.board)
        .task { reach = (try? await Calls.reach()) ?? [] }
    }

    private var here: String? { app.boot?.record?.slug }

    /// Every BrainDog, this one first; until the list arrives, this one alone, from `boot`.
    private var shown: [Reach] {
        if reach.isEmpty, let record = app.boot?.record {
            return [Reach(slug: record.slug, name: record.name, level: app.boot?.me?.level, words: nil, held: nil)]
        }
        return reach.sorted { ($0.slug == here ? 0 : 1) < ($1.slug == here ? 0 : 1) }
    }

    private func open(_ row: Reach) async {
        guard row.slug != here, opening == nil else { return }
        Haptic.press.play()
        opening = row.slug
        said = nil
        defer { opening = nil }
        do {
            try await Calls.open(row.slug)
            Haptic.success.play()
            dismiss()
            await app.reopened()
        } catch {
            Haptic.warning.play()
            said = Words.failure(error)
        }
    }
}
