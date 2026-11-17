import StoreKit
import SwiftUI

/// The store app's Plan screen (App Store 3.1.1 and 3.1.2): the record's plan as it stands, the two plans at the App
/// Store's own localized prices with Subscribe, Restore Purchases, Manage Subscription, and the terms and privacy
/// policy a subscription must link. Plain rows on a tile, the Look's own type and colour, nothing more.
///
/// A PLAN PAID ANY OTHER WAY, OR GIVEN, IS SHOWN AS IT IS, with no button: the server's `may_buy` is false, so nobody
/// pays for one record twice, and nothing here says where else a plan is bought.
public struct PlanView: View {
    public enum Opened: Sendable, Equatable { case record(String), slug(String) }

    private let opened: Opened
    private let done: (() -> Void)?
    @State private var store = PlanStore.shared
    @Environment(\.openURL) private var openURL

    public init(_ opened: Opened, done: (() -> Void)? = nil) {
        self.opened = opened
        self.done = done
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s5) {
                HStack {
                    Text(Words.plan).font(Typeface.heading).foregroundStyle(Palette.ink)
                    Spacer()
                    if let done { Button("Done", action: done).keyboardShortcut(.cancelAction) }
                }
                if let status = store.status {
                    current(status)
                    plans(status)
                } else if store.line == nil {
                    ProgressView().frame(maxWidth: .infinity)
                }
                if let line = store.line {
                    Text(line).font(Typeface.meta).foregroundStyle(Palette.ink2).fixedSize(horizontal: false, vertical: true)
                }
                footer
            }
            .padding(Space.s5)
        }
        .frame(minWidth: 420, idealWidth: 480, minHeight: 460)
        .background(Palette.board)
        .task(id: opened) {
            switch opened {
            case .record(let id): await store.open(record: id)
            case .slug(let slug): await store.open(slug: slug)
            }
        }
    }

    private func current(_ status: PlanStatus) -> some View {
        Tile(Words.planCurrent) {
            VStack(alignment: .leading, spacing: Space.s1) {
                Text(status.plan == "free" ? Words.planFree : status.name).font(Typeface.body).foregroundStyle(Palette.ink)
                if let state = stateLine(status) {
                    Text(state).font(Typeface.meta).foregroundStyle(Palette.ink3).fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func stateLine(_ status: PlanStatus) -> String? {
        if status.plan == "free" || status.state == "unbilled" { return nil }
        switch status.state {
        case "past_due": return Words.planBehind
        case "lapsed": return Words.planLapsed
        default: return status.mayBuy ? Words.planActive : "\(Words.planActive). \(Words.planHeldElsewhere)"
        }
    }

    @ViewBuilder
    private func plans(_ status: PlanStatus) -> some View {
        if status.mayBuy, !store.products.isEmpty {
            Tile(rows: true) {
                VStack(spacing: 0) {
                    ForEach(Array(store.products.enumerated()), id: \.element.id) { i, product in
                        if i > 0 { Divider().overlay(Palette.rule) }
                        row(product, status)
                    }
                }
            }
        }
    }

    private func row(_ product: Product, _ status: PlanStatus) -> some View {
        let mine = store.owned == product.id && status.by == "apple" && status.state != "lapsed"
        return HStack(alignment: .center, spacing: Space.s3) {
            VStack(alignment: .leading, spacing: Space.s1) {
                Text(product.displayName).font(Typeface.body).foregroundStyle(Palette.ink)
                Text(product.description.isEmpty ? (product.id.contains(".plus.") ? Words.planPlusLine : Words.planCloudLine) : product.description)
                    .font(Typeface.meta).foregroundStyle(Palette.ink3).fixedSize(horizontal: false, vertical: true)
                Text(Words.planPrice(product.displayPrice, product.everyWords)).font(Typeface.meta).foregroundStyle(Palette.ink2)
            }
            Spacer(minLength: Space.s3)
            if mine {
                Text(Words.planCurrent).font(Typeface.meta).foregroundStyle(Palette.ink3)
            } else {
                Button(Words.planSubscribe) { Task { await store.buy(product) } }
                    .buttonStyle(BDButtonStyle(.primary, size: .small, onTile: true, full: false))
                    .disabled(store.busy)
            }
        }
        .padding(.horizontal, Space.s4)
        .padding(.vertical, Space.s3)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack(spacing: Space.s3) {
                Button(Words.planRestore) { Task { await store.restore() } }
                    .buttonStyle(BDButtonStyle(.quiet, size: .small, full: false))
                    .disabled(store.busy || store.status == nil)
                Button(Words.planManage) { manage() }
                    .buttonStyle(BDButtonStyle(.quiet, size: .small, full: false))
            }
            Text(Words.planRenews).font(Typeface.meta).foregroundStyle(Palette.ink3).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: Space.s4) {
                Link(Words.planTerms, destination: URL(string: "https://brain.dog/legal/terms")!)
                Link(Words.planPrivacy, destination: URL(string: "https://brain.dog/legal/privacy")!)
            }
            .font(Typeface.meta)
            .tint(Palette.link)
        }
    }

    /// Apple's own subscription settings for this account.
    private func manage() {
        #if os(iOS)
        Task {
            if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
                try? await AppStore.showManageSubscriptions(in: scene)
            }
        }
        #else
        openURL(URL(string: "https://apps.apple.com/account/subscriptions")!)
        #endif
    }
}
