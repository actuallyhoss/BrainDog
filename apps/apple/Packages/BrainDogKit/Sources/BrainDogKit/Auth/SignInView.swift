import Observation
import SwiftUI

/// Where native sign-in is, and what it is doing, shared by the Sign in screen and the universal link that finishes it.
@Observable
public final class SignInFlow {
    public static let shared = SignInFlow()

    public enum Step: Equatable { case ask, sent(email: String) }
    public enum Busy: Equatable { case sending, passkey, code, link }

    public var email = ""
    public var code = ""
    public private(set) var step: Step = .ask
    public private(set) var busy: Busy?
    /// The one sentence the screen says about the last press, or nil.
    public private(set) var said: String?
    /// Whether that sentence is a refusal (said in red words) or a calm note (ink-2).
    public private(set) var saidIsRefusal = false
    /// Whether that sentence is about the passkey, so it is said under the passkey's button and not the email's.
    public private(set) var saidOfPasskey = false

    @ObservationIgnored let passkey = Passkey()

    private init() {
        if EmailLink.pending != nil, let kept = UserDefaults.standard.string(forKey: "signin.email") { email = kept; step = .sent(email: kept) }
    }

    private func say(_ text: String?, refusal: Bool = true) {
        said = text
        saidIsRefusal = refusal
        saidOfPasskey = busy == .passkey
        if text != nil && refusal { Haptic.warning.play() }
    }

    /// "Email me a sign-in link": a primary that says what is missing rather than being disabled.
    public func sendLink() async {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !address.isEmpty else { return say(Words.emailMissing) }
        guard address.contains("@"), address.contains("."), !address.contains(" ") else { return say(Words.emailOdd) }
        passkey.stop()
        busy = .sending
        say(nil)
        defer { busy = nil }
        do {
            try await EmailLink.start(email: address)
            UserDefaults.standard.set(address, forKey: "signin.email")
            code = ""
            step = .sent(email: address)
            Haptic.success.play()
        } catch {
            say(Words.failure(error))
        }
    }

    /// The six digits from the letter. Sent by itself once six are typed, and by the button.
    public func sendCode() async {
        let digits = code.filter(\.isNumber)
        guard digits.count == 6 else { return say(Words.codeMissing) }
        guard busy == nil else { return }
        busy = .code
        say(nil)
        defer { busy = nil }
        do {
            try await EmailLink.finish(code: digits)
            done()
        } catch {
            code = ""
            say(Words.failure(error))
        }
    }

    /// The mailed link, opened on this device as a universal link.
    public func open(link url: URL) async {
        guard EmailLink.isSignInLink(url) else { return }
        busy = .link
        say(nil)
        defer { busy = nil }
        do {
            try await EmailLink.finish(link: url)
            done()
        } catch {
            say(Words.failure(error))
        }
    }

    /// "Use a passkey": the Face ID sheet now.
    public func usePasskey() async {
        busy = .passkey
        say(nil)
        defer { busy = nil }
        switch await passkey.signIn() {
        case .signedIn: done()
        case .cancelled: say(Words.passkeyCancelled, refusal: false)
        case .unusable(let why): say(why)
        case .failed(let failure): say(Words.failure(failure))
        }
    }

    /// Passkeys in the email field's AutoFill, offered quietly while the screen is up.
    func offerAutofill() async {
        guard step == .ask, busy == nil else { return }
        if case .signedIn = await passkey.offerInAutofill() { done() }
    }

    public func again() {
        passkey.stop()
        step = .ask
        code = ""
        say(nil)
    }

    private func done() {
        UserDefaults.standard.removeObject(forKey: "signin.email")
        step = .ask
        code = ""
        say(nil)
        Haptic.success.play()
    }
}

/// The native Sign in screen (plan 3.4, 3.6): the email link first and filled, with its code, and a passkey under it.
/// One red, the screen's primary; every other control quiet or bare. The same view on the Mac, at the Mac's width.
public struct SignInView: View {
    @State private var flow = SignInFlow.shared
    @FocusState private var focus: Focused?
    @Environment(\.horizontalSizeClass) private var width

    enum Focused { case email, code }

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s5) {
                Mark()
                    .frame(width: 56, height: 44, alignment: .leading)
                    .padding(.top, Space.s6)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: Space.s2) {
                    Text(Words.signInTitle)
                        .font(Typeface.page)
                        .foregroundStyle(Palette.ink)
                        .accessibilityAddTraits(.isHeader)
                    if case .ask = flow.step {
                        Text(Words.signInLede).font(Typeface.body).foregroundStyle(Palette.ink2)
                    }
                }

                switch flow.step {
                case .ask: ask
                case .sent(let email): sent(email)
                }

                Text(Words.privacy)
                    .font(Typeface.meta)
                    .foregroundStyle(Palette.ink3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, Space.s6)
            .frame(maxWidth: 440, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Palette.board.ignoresSafeArea())
        .animation(.easeOut(duration: 0.18), value: flow.step)
        .task { await flow.offerAutofill() }
    }

    // MARK: asking

    private var ask: some View {
        Tile(padding: Space.s4) {
            VStack(alignment: .leading, spacing: Space.s4) {
                Field(Words.emailLabel) {
                    TextField("", text: $flow.email, prompt: Text(Words.emailLike).foregroundStyle(Palette.ink3))
                        .font(Typeface.body)
                        .foregroundStyle(Palette.ink)
                        #if os(iOS)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        #endif
                        .autocorrectionDisabled()
                        .submitLabel(.send)
                        .focused($focus, equals: .email)
                        .onSubmit { Task { await flow.sendLink() } }
                }

                Button {
                    Haptic.press.play()
                    Task { await flow.sendLink() }
                } label: {
                    Text(flow.busy == .sending ? Words.sendingLink : Words.emailLink)
                }
                .buttonStyle(.primary)
                .disabled(flow.busy != nil && flow.busy != .sending)

                if !flow.saidOfPasskey { said }

                HStack(spacing: Space.s3) {
                    Hairline()
                    Text(Words.or).font(Typeface.meta).foregroundStyle(Palette.ink3)
                    Hairline()
                }
                .accessibilityHidden(true)

                Button {
                    Task { await flow.usePasskey() }
                } label: {
                    HStack(spacing: Space.s2) {
                        Glyph.key.image.resizable().frame(width: 18, height: 18).accessibilityHidden(true)
                        Text(flow.busy == .passkey ? Words.waitingForPasskey : Words.withPasskey)
                    }
                }
                .buttonStyle(.quietOnTile)

                if flow.saidOfPasskey { said }
            }
        }
    }

    // MARK: the letter is on its way

    private func sent(_ email: String) -> some View {
        Tile(padding: Space.s4) {
            VStack(alignment: .leading, spacing: Space.s4) {
                HStack(alignment: .top, spacing: Space.s3) {
                    IconWell(.mail, size: .card)
                    VStack(alignment: .leading, spacing: Space.s1) {
                        Text(Words.linkSentTitle).font(Typeface.heading).foregroundStyle(Palette.ink)
                        Text(Words.linkSentBody(email))
                            .font(Typeface.body)
                            .foregroundStyle(Palette.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                Field(Words.codeLabel) {
                    TextField("", text: $flow.code, prompt: Text(Words.codeLike).foregroundStyle(Palette.ink3))
                        .font(Typeface.codeEntry)
                        .monospacedDigit()
                        .foregroundStyle(Palette.ink)
                        #if os(iOS)
                        .textContentType(.oneTimeCode)
                        .keyboardType(.numberPad)
                        #endif
                        .focused($focus, equals: .code)
                        .onChange(of: flow.code) { _, typed in
                            let digits = String(typed.filter(\.isNumber).prefix(6))
                            if digits != typed { flow.code = digits }
                            if digits.count == 6 { Task { await flow.sendCode() } }
                        }
                        .onSubmit { Task { await flow.sendCode() } }
                }

                Button {
                    Haptic.press.play()
                    Task { await flow.sendCode() }
                } label: {
                    Text(flow.busy == .code || flow.busy == .link ? Words.signingIn : Words.codeSignIn)
                }
                .buttonStyle(.primary)

                said

                HStack(spacing: Space.s4) {
                    Button(Words.sendAgain) { Task { await flow.sendLink() } }.buttonStyle(.bare)
                    Button(Words.useAnotherEmail) { flow.again(); focus = .email }.buttonStyle(.bare)
                }
            }
        }
        .onAppear { focus = .code }
    }

    @ViewBuilder private var said: some View {
        if let text = flow.said {
            Text(text)
                .font(Typeface.meta)
                .foregroundStyle(flow.saidIsRefusal ? Palette.red : Palette.ink2)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.updatesFrequently)
        }
    }
}

/// A labelled field: the label in meta ink-3 above, the field 44 tall in a tile-2 well at radius 8.
struct Field<Content: View>: View {
    let label: String
    let content: Content

    init(_ label: String, @ViewBuilder content: () -> Content) {
        self.label = label
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text(label).font(Typeface.meta).foregroundStyle(Palette.ink3)
            content
                .textFieldStyle(.plain)
                .padding(.horizontal, Space.s3)
                .frame(minHeight: Space.tap)
                .background(Palette.tile2, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
        }
    }
}

/// The mark, in the house red.
public struct Mark: View {
    public init() {}
    public var body: some View {
        Image("mark", bundle: .module)
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .foregroundStyle(Palette.redFill)
    }
}
