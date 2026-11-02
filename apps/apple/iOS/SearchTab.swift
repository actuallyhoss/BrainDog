import BrainDogKit
import SwiftUI

/// Search or go to (plan 3.3): the search tab. With nothing typed it lists every place the tab bar does not hold, from
/// `boot` (the pages he navigates by, then his lists); typing asks the record's `search`, and each result opens its
/// entry's page in the web, pushed here.
struct SearchTab: View {
    @State private var app = AppModel.shared

    var body: some View {
        @Bindable var search = app.search
        NavigationStack(path: $search.path) {
            SearchView()
                .navigationTitle(Words.searchPrompt)
                .modifier(ScreenBar(root: true, title: Words.searchPrompt))
                .navigationDestination(for: Screen.self) { screen in
                    switch screen {
                    case .web(let pushed): WebPage(screen: pushed.screen, root: false, stack: app.search)
                    case .settings: SettingsRoot(stack: app.search)
                    }
                }
        }
    }
}

struct SearchView: View {
    @State private var app = AppModel.shared
    @State private var hits: [Hit] = []
    @State private var asked = ""
    @State private var reading = false
    @State private var failed: String?

    private var typed: String { app.searchText.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        @Bindable var app = app
        List {
            if typed.isEmpty {
                placesList
            } else if let failed {
                plain(failed)
            } else if hits.isEmpty && asked == typed && !reading {
                EmptyState(.search, title: Words.nothingFound(typed), line: Words.nothingFoundNext)
                    .padding(Space.s4)
                    .background(Palette.tile, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: Space.s3, leading: Space.gutter, bottom: 0, trailing: Space.gutter))
            } else {
                ForEach(groups, id: \.name) { group in
                    Section {
                        tiled(group.hits) { hit in
                            Row(hit.title, glyph: Glyph.named(group.icon))
                        } open: { hit in app.push(hit.path, on: app.search) }
                    } header: {
                        heading(group.name, count: group.hits.count)
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Palette.board)
        .scrollDismissesKeyboard(.immediately)
        .searchable(text: $app.searchText, prompt: Text(Words.searchPrompt))
        .task(id: typed) { await find(typed) }
    }

    // MARK: with nothing typed: places

    private struct Spot: Identifiable {
        let id: String
        let label: String
        let icon: String?
        let detail: String?
    }

    /// The pages he navigates by, under the section each sits in, then Activity, Agents and Add-ons; none a tab holds.
    private var sections: [(name: String, spots: [Spot])] {
        let tabs = Set(app.places.map(\.href))
        var order: [String] = []
        var by: [String: [(Double, Spot)]] = [:]
        for page in app.boot?.pages ?? [] {
            guard let nav = page.nav, !tabs.contains("/p/\(page.slug)") else { continue }
            if by[nav.section] == nil { order.append(nav.section) }
            by[nav.section, default: []].append((nav.order ?? 0, Spot(id: "/p/\(page.slug)", label: page.title, icon: page.icon, detail: nil)))
        }
        var out = order.sorted().map { name in (name: name, spots: (by[name] ?? []).sorted { $0.0 < $1.0 }.map(\.1)) }
        let more = [
            Spot(id: "/audit", label: Words.activity, icon: "activity", detail: nil),
            Spot(id: "/agents", label: "Agents", icon: "session", detail: nil),
            Spot(id: "/addons", label: "Add-ons", icon: "packs", detail: nil),
        ]
        out.append((name: Words.more, spots: more))
        return out
    }

    private var lists: [Spot] {
        (app.boot?.registers ?? []).filter { $0.kernel != true }
            .sorted { ($0.count ?? 0, $1.name) > ($1.count ?? 0, $0.name) }
            .map { Spot(id: "/r/\($0.id)", label: $0.name, icon: $0.icon, detail: Words.entries($0.count ?? 0)) }
    }

    @ViewBuilder private var placesList: some View {
        ForEach(sections, id: \.name) { section in
            Section {
                tiled(section.spots) { spot in Row(spot.label, glyph: Glyph.named(spot.icon)) } open: { app.push($0.id, on: app.search) }
            } header: { heading(section.name, count: nil) }
        }
        if !lists.isEmpty {
            Section {
                tiled(lists) { spot in Row(spot.label, when: spot.detail, glyph: Glyph.named(spot.icon)) } open: { app.push($0.id, on: app.search) }
            } header: { heading(Words.lists, count: lists.count) }
        }
        Section {
            tiled([Spot(id: "settings", label: Words.settings, icon: "settings", detail: nil)]) { spot in
                Row(spot.label, glyph: .settings)
            } open: { _ in app.search.path.append(.settings) }
        }
        Color.clear.frame(height: Space.s6).listRowBackground(Color.clear).listRowSeparator(.hidden)
    }

    // MARK: with something typed: the record's search

    private struct Group { let name: String; let icon: String?; let hits: [Hit] }

    private var groups: [Group] {
        var order: [String] = []
        var by: [String: [Hit]] = [:]
        for hit in hits {
            if by[hit.register] == nil { order.append(hit.register) }
            by[hit.register, default: []].append(hit)
        }
        return order.map { id in
            let list = app.boot?.registers.first { $0.id == id }
            return Group(name: list?.name ?? Words.lists, icon: list?.icon, hits: by[id] ?? [])
        }
    }

    private func find(_ q: String) async {
        failed = nil
        guard !q.isEmpty else { hits = []; asked = ""; return }
        /* A PAUSE BETWEEN KEYS, so a word typed is one ask and not five. */
        try? await Task.sleep(for: .milliseconds(220))
        guard !Task.isCancelled else { return }
        reading = true
        defer { reading = false }
        do {
            let found = try await Calls.search(q)
            guard !Task.isCancelled else { return }
            hits = found
            asked = q
        } catch {
            guard !Task.isCancelled else { return }
            failed = Words.failure(error)
        }
    }

    // MARK: parts

    private func heading(_ title: String, count: Int?) -> some View {
        HStack(spacing: Space.s2) {
            Text(title).font(Typeface.tileHeading).foregroundStyle(Palette.ink)
            if let count { Text(count, format: .number).font(Typeface.meta).monospacedDigit().foregroundStyle(Palette.ink3) }
            Spacer(minLength: 0)
        }
        .padding(.top, Space.s3)
        .padding(.bottom, Space.s1)
        .listRowInsets(EdgeInsets(top: 0, leading: Space.gutter, bottom: 0, trailing: Space.gutter))
        .accessibilityAddTraits(.isHeader)
    }

    private func plain(_ text: String) -> some View {
        Text(text).font(Typeface.meta).foregroundStyle(Palette.ink2)
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: Space.s3, leading: Space.gutter, bottom: 0, trailing: Space.gutter))
    }

    /// Rows of one list on one tile: hairlines between, none under the last, the tile's corners on the first and last.
    private func tiled<Item: Identifiable, Content: View>(_ items: [Item], @ViewBuilder row: @escaping (Item) -> Content, open: @escaping (Item) -> Void) -> some View {
        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
            let first = index == 0
            let last = index == items.count - 1
            Button {
                Haptic.press.play()
                open(item)
            } label: {
                VStack(spacing: 0) {
                    row(item)
                    if !last { Hairline() }
                }
            }
            .buttonStyle(.plain)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 0, leading: Space.gutter + Space.s4, bottom: 0, trailing: Space.gutter + Space.s4))
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

