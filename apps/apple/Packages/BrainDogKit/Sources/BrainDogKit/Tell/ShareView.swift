import SwiftUI

/// What the share sheet draws: **Attach** puts what was shared (a file, a PDF, a photo, a web page) on a project or a task
/// as it is (`AttachView`); **Tell** reads the words into entries as before (no Ask, Done closes the sheet). Attach is
/// first when a file or a page came; Tell when only words did. Signed out it says to sign in in the app.
public struct ShareView: View {
    public enum Mode: Hashable { case attach, tell }

    let model: TellModel
    let attach: AttachModel?
    let signedIn: Bool
    let close: () -> Void
    @State private var mode: Mode

    public init(model: TellModel, attach: AttachModel? = nil, startsAttaching: Bool = false, signedIn: Bool, close: @escaping () -> Void) {
        self.model = model
        self.attach = attach
        self.signedIn = signedIn
        self.close = close
        _mode = State(initialValue: attach != nil && startsAttaching ? .attach : .tell)
    }

    public var body: some View {
        Group {
            if !signedIn {
                VStack(alignment: .leading, spacing: Space.s4) {
                    HStack {
                        Text(Words.tellTitle).font(Typeface.heading).foregroundStyle(Palette.ink)
                        Spacer()
                        Button(Words.done, action: close).buttonStyle(.bare)
                    }
                    Text(Words.shareSignIn).font(Typeface.body).foregroundStyle(Palette.ink2)
                    Spacer(minLength: 0)
                }
                .padding(Space.gutter)
            } else if let attach {
                switch mode {
                case .attach: AttachView(model: attach, lead: choice, done: close)
                case .tell: TellSheet(model: model, asks: false, lead: choice, done: close)
                }
            } else {
                TellSheet(model: model, asks: false, done: close)
            }
        }
        .background(Palette.tile)
        .tint(Palette.ink)
    }

    private var choice: AnyView {
        AnyView(Segmented([(Mode.attach, Words.attachTab), (.tell, Words.tell)], chosen: $mode).frame(maxWidth: 220))
    }
}
