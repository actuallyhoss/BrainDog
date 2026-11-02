import AuthenticationServices
import Foundation
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// Signing in with a passkey, natively: the Face ID sheet (or Touch ID, or the Mac's), and passkey AutoFill on the email
/// field (plan 3.6, 1).
///
/// THE SAME DIRECTORY CEREMONY THE WEB USES. `/auth/passkey/assert/options` gives the challenge and the relying party
/// (`brain.dog`), `ASAuthorization` signs it with a passkey of that relying party, and `/auth/passkey/assert` checks it,
/// with `app` set to this device's label so the session it opens is an app session.
///
/// IT NEEDS THE NAMES TO VOUCH FOR THE APP. The app's entitlement lists `webcredentials:brain.dog`, and brain.dog's
/// `apple-app-site-association` names this app under the team; without both (an unsigned build, or a build whose team
/// the file does not name), the system refuses before any sheet shows, and `failure` says so in a sentence.
///
/// THE CLIENT DATA'S ORIGIN IS `https://brain.dog`, the relying party's, which is not the web's `https://app.brain.dog`;
/// the Directory accepts both (`rp.origins`, S2).
@MainActor
public final class Passkey: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public enum Outcome: Sendable, Equatable { case signedIn, cancelled, unusable(String), failed(CallFailure) }

    private var controller: ASAuthorizationController?
    private var waiting: CheckedContinuation<ASAuthorization?, Error>?

    public override init() {}

    nonisolated struct Options: Decodable, Sendable { let challenge: String; let rpId: String }

    /// The Face ID sheet now, for a press of "Use a passkey".
    public func signIn() async -> Outcome { await run(autofill: false) }

    /// Passkeys offered in the email field's AutoFill, until one is picked or `stop()` (iOS only; the Mac has no bar).
    public func offerInAutofill() async -> Outcome {
        #if os(iOS)
        return await run(autofill: true)
        #else
        return .cancelled
        #endif
    }

    /// Withdraw whatever is waiting: an AutoFill offer before the sheet, or a sheet nobody finished.
    public func stop() {
        controller?.cancel()
        controller = nil
    }

    private func run(autofill: Bool) async -> Outcome {
        stop()
        let options: Options
        do {
            options = try await Client.shared.auth("/auth/passkey/assert/options", as: Options.self)
        } catch {
            return .failed(error)
        }
        guard let challenge = Data(base64URL: options.challenge) else { return .failed(.failed(status: 200)) }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options.rpId)
        let request = provider.createCredentialAssertionRequest(challenge: challenge)
        request.userVerificationPreference = .required
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        self.controller = controller

        let authorization: ASAuthorization?
        do {
            authorization = try await withCheckedThrowingContinuation { (c: CheckedContinuation<ASAuthorization?, Error>) in
                waiting = c
                #if os(iOS)
                if autofill { controller.performAutoFillAssistedRequests() } else { controller.performRequests() }
                #else
                controller.performRequests()
                #endif
            }
        } catch let error as ASAuthorizationError {
            self.controller = nil
            switch error.code {
            case .canceled: return .cancelled
            case .notHandled, .notInteractive: return .cancelled
            default: return .unusable(Words.passkeyUnusable(error))
            }
        } catch {
            self.controller = nil
            return .unusable(Words.passkeyUnusable(error))
        }
        self.controller = nil
        guard let assertion = authorization?.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else { return .cancelled }

        let credential: JSONValue = [
            "id": .string(assertion.credentialID.base64URL),
            "rawId": .string(assertion.credentialID.base64URL),
            "type": "public-key",
            "response": [
                "clientDataJSON": .string(assertion.rawClientDataJSON.base64URL),
                "authenticatorData": .string(assertion.rawAuthenticatorData.base64URL),
                "signature": .string(assertion.signature.base64URL),
                "userHandle": assertion.userID.isEmpty ? .null : .string(assertion.userID.base64URL),
            ],
        ]
        do {
            _ = try await Client.shared.auth("/auth/passkey/assert", ["credential": credential, "app": .string(Session.deviceLabel)], as: Nothing.self)
            return .signedIn
        } catch {
            return .failed(error)
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        waiting?.resume(returning: authorization)
        waiting = nil
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        waiting?.resume(throwing: error)
        waiting = nil
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        #if os(iOS)
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.first?.windows.first ?? ASPresentationAnchor()
        #else
        return NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first ?? ASPresentationAnchor()
        #endif
    }
}
