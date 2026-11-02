// swift-tools-version: 6.2
//
// BrainDogKit: what every BrainDog target shares (loop/plans/apps-2026-11-02/PLAN.md, 3.1). The client and the session,
// sign-in, the bridge to the web app, the web screen, Look B in SwiftUI, and the Tell reader in JavaScriptCore.

import PackageDescription

let package = Package(
    name: "BrainDogKit",
    defaultLocalization: "en",
    platforms: [.iOS("26.0"), .macOS(.v14)],
    products: [
        .library(name: "BrainDogKit", targets: ["BrainDogKit"]),
    ],
    targets: [
        .target(
            name: "BrainDogKit",
            resources: [
                .process("Resources/Colours.xcassets"),
                .process("Resources/Icons.xcassets"),
                .copy("Resources/Fonts"),
                .copy("Resources/tell-core.js"),
                .copy("Bridge/ShellScript.js"),
            ],
            swiftSettings: [
                .defaultIsolation(MainActor.self),
                .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
            ]
        ),
    ],
    swiftLanguageModes: [.v6]
)
