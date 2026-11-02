import BrainDogKit
import SwiftUI

/// The face's sheet (plan 3.4, 3.6): who is signed in here, every BrainDog they can reach with the plain word for what
/// they hold there, a press on another to open it on this session, Settings, and Sign out.
struct AccountSheet: View {
    @State private var app = AppModel.shared
    @State private var reach: [Reach] = []
    @State private var opening: String?
    @State private var said: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s5) {
                HStack(spacing: Space.s3) {
                    Face(app.boot?.me?.name ?? "B", side: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(app.boot?.me?.name ?? Words.account).font(Typeface.heading).foregroundStyle(Palette.ink)
                        Text(Session.deviceLabel).font(Typeface.meta).foregroundStyle(Palette.ink3)
                    }
                    Spacer(minLength: 0)
                    Button(Words.done) { dismiss() }.buttonStyle(.bare)
                }

                VStack(alignment: .leading, spacing: Space.s2) {
                    Text(Words.yourBrainDogs).font(Typeface.caption).foregroundStyle(Palette.ink3).accessibilityAddTraits(.isHeader)
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
                                .frame(minHeight: Space.tap)
                                .padding(.vertical, Space.s2)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(row.slug == here ? .isSelected : [])
                            if index < shown.count - 1 { Hairline() }
                        }
                    }
                    .padding(.horizontal, Space.s4)
                    .background(Palette.tile2, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
                    if let said {
                        Text(said).font(Typeface.meta).foregroundStyle(Palette.red).fixedSize(horizontal: false, vertical: true)
                    }
                }

                VStack(spacing: Space.s2) {
                    Button {
                        dismiss()
                        app.current?.path.append(.settings)
                    } label: {
                        HStack(spacing: Space.s2) {
                            Glyph.settings.image.resizable().frame(width: 18, height: 18).accessibilityHidden(true)
                            Text(Words.settings)
                            Spacer(minLength: 0)
                        }
                    }
                    .buttonStyle(.quietOnTile)

                    Button(Words.signOut) {
                        Task {
                            dismiss()
                            await Session.shared.signOut()
                        }
                    }
                    .buttonStyle(.quietOnTile)
                }
            }
            .padding(Space.gutter)
            .padding(.top, Space.s2)
        }
        .background(Palette.tile)
        .presentationDetents([.medium, .large])
        .presentationBackground(Palette.tile)
        .presentationCornerRadius(Radius.tile)
        .presentationDragIndicator(.visible)
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
