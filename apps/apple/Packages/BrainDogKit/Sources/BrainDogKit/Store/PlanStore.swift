import Foundation
import StoreKit
import Observation

/// What the server says of a record's plan for the store app (`POST /account/billing/apple`): which plan, how it stands,
/// who it is paid through, whether a purchase may be offered, and the `appAccountToken` every purchase for it carries.
nonisolated public struct PlanStatus: Decodable, Sendable, Equatable {
    public let record: String
    public let token: String
    public let plan: String
    public let name: String
    public let state: String
    /// `apple`, `web`, `gift`, or nil for nothing paid.
    public let by: String?
    public let periodEnd: Double?
    public let mayBuy: Bool

    enum CodingKeys: String, CodingKey {
        case record, token, plan, name, state, by
        case periodEnd = "period_end"
        case mayBuy = "may_buy"
    }
}

/// The store app's plans, sold with StoreKit 2 (App Store 3.1.1): the App Store's own products and prices, a purchase
/// made for the record on screen, every transaction told to the server, which is what moves the record's plan.
///
/// ONE RECORD'S TOKEN ON EVERY PURCHASE. The server makes a UUID from the record (`appAccountTokenOf`) and refuses a
/// transaction carrying another, so a subscription pays for the record it was bought for and no other. The tokens seen
/// are kept, so a renewal or a purchase finished outside the sheet (`Transaction.updates`, Ask to Buy) is told to the
/// server for its own record.
///
/// A TRANSACTION IS FINISHED ONCE THE SERVER HAS IT, or once the server has said it never will; until then StoreKit
/// hands it again on the next launch, and it is sent again.
@MainActor
@Observable
public final class PlanStore {
    public static let shared = PlanStore()

    /// The two monthly plans this app sells, by product id: Cloud, then Cloud Plus.
    public static let productIDs: [String] = {
        #if os(macOS)
        ["dog.brain.desktop.cloud.monthly", "dog.brain.desktop.plus.monthly"]
        #else
        ["dog.brain.app.cloud.monthly", "dog.brain.app.plus.monthly"]
        #endif
    }()

    public private(set) var products: [Product] = []
    public private(set) var status: PlanStatus?
    /// The product of the subscription active on this Apple account for this group, if any.
    public private(set) var owned: String?
    public private(set) var busy = false
    public private(set) var line: String?

    @ObservationIgnored private var listening: Task<Void, Never>?
    private static let tokensKey = "plan.tokens"

    private init() {}

    // MARK: listening

    /// Once, at launch: hear every transaction StoreKit hands the app from now on, and tell the server any it holds.
    public func listen() {
        guard listening == nil else { return }
        listening = Task { [weak self] in
            for await update in Transaction.updates {
                await self?.told(update)
            }
        }
        Task { await sendEntitlements() }
    }

    // MARK: the record's plan

    /// The plan of a record this person owns, by its id, with the App Store's products.
    public func open(record: String) async {
        line = nil
        await loadProducts()
        await read(record: record, jws: nil)
        await readOwned()
    }

    /// The plan of the record with this name, found among the records this person owns (`GET /account/billing`).
    public func open(slug: String) async {
        do {
            let list = try await Client.shared.get("/account/billing", as: JSONValue.self)
            let records: [JSONValue] = { if case .array(let a) = list["records"] ?? .null { return a } else { return [] } }()
            if let id = records.first(where: { $0["slug"]?.string == slug })?["record"]?.string {
                await open(record: id)
            } else {
                status = nil
                line = Words.planOwnerOnly
            }
        } catch {
            line = Words.failure(error)
        }
    }

    private func loadProducts() async {
        guard products.isEmpty else { return }
        do {
            let found = try await Product.products(for: Self.productIDs)
            products = Self.productIDs.compactMap { id in found.first { $0.id == id } }
            if products.isEmpty { line = Words.planNoProducts }
        } catch {
            line = Words.planNoProducts
        }
    }

    private func readOwned() async {
        var seen: String?
        for await result in Transaction.currentEntitlements {
            if case .verified(let t) = result, t.productType == .autoRenewable, Self.productIDs.contains(t.productID), t.revocationDate == nil {
                seen = t.productID
            }
        }
        owned = seen
    }

    /// How a call to the server went: answered, refused for good, or worth trying again (offline, the server down).
    private enum Reached { case answered, refused, again }

    @discardableResult
    private func read(record: String, jws: String?) async -> Reached {
        var body: [String: JSONValue] = ["record": .string(record)]
        if let jws { body["jws"] = .string(jws) }
        do {
            let said = try await Client.shared.account("/account/billing/apple", body, as: PlanStatus.self)
            status = said
            keep(token: said.token, record: said.record)
            return .answered
        } catch {
            if case .refused(let refusal) = error {
                line = refusal.fix
                return refusal.code == "RECORD_UNAVAILABLE" ? .again : .refused
            }
            line = Words.failure(error)
            return .again
        }
    }

    // MARK: buying

    /// Buy a plan for the record on screen. The server is told before the transaction is finished.
    public func buy(_ product: Product) async {
        guard let status, status.mayBuy, let token = UUID(uuidString: status.token) else { return }
        busy = true
        line = nil
        defer { busy = false }
        do {
            let result = try await product.purchase(options: [.appAccountToken(token)])
            switch result {
            case .success(let verification):
                await told(verification)
                await readOwned()
            case .pending:
                line = Words.planPending
            case .userCancelled:
                break
            @unknown default:
                break
            }
        } catch {
            line = Words.planFailed
        }
    }

    /// Restore Purchases: the App Store synced, and every subscription this Apple account holds told to the server.
    public func restore() async {
        busy = true
        line = nil
        defer { busy = false }
        do {
            try await AppStore.sync()
        } catch {
            /* Cancelled at the sign-in, or offline: what StoreKit already holds is still sent. */
        }
        await sendEntitlements()
        if let record = status?.record { await read(record: record, jws: nil) }
        await readOwned()
        if owned == nil { line = Words.planNothingToRestore }
    }

    /// Every entitlement this Apple account holds, told to the server for the record its token names.
    private func sendEntitlements() async {
        for await result in Transaction.currentEntitlements {
            await told(result, finish: false)
        }
    }

    /// One transaction told to the server for its record, and finished once the server has it or never will.
    private func told(_ result: VerificationResult<Transaction>, finish: Bool = true) async {
        guard case .verified(let t) = result else { return }
        guard Self.productIDs.contains(t.productID) else {
            if finish { await t.finish() }
            return
        }
        guard let token = t.appAccountToken?.uuidString.lowercased(), let record = tokens[token] else {
            /* A TOKEN THIS APP HAS NOT SEEN (bought on another Mac, or before it was kept): the server's notifications
               and the next Restore Purchases from that record's Plan sheet carry it. */
            if finish { await t.finish() }
            return
        }
        let reached = await read(record: record, jws: result.jwsRepresentation)
        if reached != .again, finish { await t.finish() }
    }

    // MARK: the tokens seen

    private var tokens: [String: String] {
        UserDefaults.standard.dictionary(forKey: Self.tokensKey) as? [String: String] ?? [:]
    }

    private func keep(token: String, record: String) {
        var all = tokens
        guard all[token.lowercased()] != record else { return }
        all[token.lowercased()] = record
        UserDefaults.standard.set(all, forKey: Self.tokensKey)
    }

    /// Signed out: the plan on screen goes. The tokens stay, as they name records, not people.
    public func forget() {
        status = nil
        owned = nil
        line = nil
    }
}

nonisolated extension Product {
    /// "a month", "a year": how often this subscription renews, in words.
    public var everyWords: String {
        guard let period = subscription?.subscriptionPeriod else { return "" }
        let unit: String
        switch period.unit {
        case .day: unit = "day"
        case .week: unit = "week"
        case .month: unit = "month"
        case .year: unit = "year"
        @unknown default: unit = "period"
        }
        return period.value == 1 ? "a \(unit)" : "every \(period.value) \(unit)s"
    }
}
