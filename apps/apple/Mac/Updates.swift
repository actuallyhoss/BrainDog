import BrainDogKit
import Foundation
import Observation
import Security
import Sparkle

/// Updates for the Mac app (plan M6, Updates): Sparkle 2 reading the appcast at `https://brain.dog/mac/appcast.xml`
/// (`apps/site/static/mac/appcast.xml`, an empty feed until the first release), each update checked against the EdDSA
/// public key in the app's Info.plist (`SUPublicEDKey`) and against the Developer ID signature it must carry.
///
/// OFF UNTIL THERE IS A SIGNED BUILD. The updater starts only in an app signed by the team (MG86668Z52) that carries a
/// public key; a Debug build, an unsigned check build, or a build with no key yet never asks the feed and Settings says
/// why. The key pair is made once into this Mac's keychain by Sparkle's own `generate_keys` (only the public half goes in
/// `project.yml`), and the release script signs each dmg with it (`sign_update`) when it writes the appcast.
@Observable
final class Updates {
    static let shared = Updates()

    /// The team every release is signed by.
    static let team = "MG86668Z52"

    @ObservationIgnored private let controller: SPUStandardUpdaterController?
    /// Why updates are off, or nil when the updater runs.
    let off: String?
    private(set) var automatic: Bool {
        didSet { controller?.updater.automaticallyChecksForUpdates = automatic }
    }

    private init() {
        let key = (Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String ?? "").trimmingCharacters(in: .whitespaces)
        let team = Self.signingTeam()
        if team != Self.team {
            off = "Updates come with the signed app from brain.dog. This copy was built on this Mac, so it does not look for them."
        } else if key.isEmpty {
            off = "Updates are not switched on yet: this build has no update key."
        } else {
            off = nil
        }
        controller = off == nil ? SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil) : nil
        automatic = controller?.updater.automaticallyChecksForUpdates ?? false
    }

    var canCheck: Bool { controller != nil }

    func setAutomatic(_ on: Bool) { automatic = on }

    /// What Settings says under the switch.
    var said: String {
        if let off { return off }
        if let last = controller?.updater.lastUpdateCheckDate { return "Last looked \(Said.time(last))." }
        return "BrainDog looks for a new version once a day and asks before it installs one."
    }

    /// The menu's Check for Updates…, and Settings' Check Now.
    func check() {
        controller?.checkForUpdates(nil)
    }

    /// The team identifier this app is signed with, or nil (unsigned, or signed to run locally).
    private static func signingTeam() -> String? {
        var code: SecCode?
        guard SecCodeCopySelf([], &code) == errSecSuccess, let code else { return nil }
        var staticCode: SecStaticCode?
        guard SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode else { return nil }
        var info: CFDictionary?
        guard SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
              let dict = info as? [String: Any] else { return nil }
        return dict[kSecCodeInfoTeamIdentifier as String] as? String
    }
}
