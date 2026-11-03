import SwiftUI

/// Tell, as the share sheet draws it: no Ask, Done closes the sheet, and signed out it says to sign in in the app.
public struct ShareView: View {
    let model: TellModel
    let signedIn: Bool
    let close: () -> Void

    public init(model: TellModel, signedIn: Bool, close: @escaping () -> Void) {
        self.model = model
        self.signedIn = signedIn
        self.close = close
    }

    public var body: some View {
        Group {
            if signedIn {
                TellSheet(model: model, asks: false, done: close)
            } else {
                VStack(alignment: .leading, spacing: Space.s4) {
                    HStack {
                        Text(Words.tellTitle).font(Typeface.heading).foregroundStyle(Palette.ink)
                        Spacer()
                        Button(Words.done, action: close).buttonStyle(.bare)
                    }
                    Text(Words.shareSignIn).font(Typeface.body).foregroundStyle(Palette.ink2).leading(.body)
                    Spacer(minLength: 0)
                }
                .padding(Space.gutter)
            }
        }
        .background(Palette.tile)
        .tint(Palette.ink)
    }
}

