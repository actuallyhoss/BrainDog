/**
 * The apps' doors, held shut. Runs in `pnpm test` through `apps/desktop/test/apple-security.test.mjs`, or alone:
 *
 *   node --test apps/apple/test/security.test.mjs
 *
 * `WebGate.swift` is compiled on its own and asked every case (where `swiftc` is there, on a Mac); everything else is the
 * source and the project read for the line that closes the hole, so it cannot quietly come back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const apple = join(import.meta.dirname, '..');
const kit = join(apple, 'Packages/BrainDogKit/Sources/BrainDogKit');
const read = (...at) => readFileSync(join(...at), 'utf8');
const swiftc = spawnSync('xcrun', ['--find', 'swiftc'], { encoding: 'utf8' }).status === 0;

/* Each case: what the gate is asked, and what it must say. */
const CASES = String.raw`
let o = URL(string: "https://app.brain.dog")!
func u(_ s: String) -> URL { URL(string: s)! }
func m(_ s: String, _ f: WebGate.Frame = .main, link: Bool = false, popup: Bool = false) -> WebGate.Move { WebGate.move(u(s), origin: o, frame: f, link: link, popup: popup) }
var bad = 0
@MainActor func check(_ ok: Bool, _ what: String, line: Int = #line) { if !ok { bad += 1; print("FAILED line \(line): \(what)") } }

// The window stays on the origin, by an exact host.
check(m("https://app.brain.dog/") == .allow, "own")
check(m("https://evilapp.brain.dog/") == .cancel, "a name ending the same")
check(m("https://app.brain.dog.evil.example/") == .cancel, "a name starting the same")
check(m("https://app.brain.dog@evil.example/") == .cancel, "userinfo")
check(m("https://x@app.brain.dog/") == .cancel, "a name in our address")
check(m("http://app.brain.dog/") == .cancel, "plain http")
check(m("https://app.brain.dog:8443/") == .cancel, "another port")
check(m("https://evil.example/") == .cancel, "a redirect or location.assign off the app")
check(m("https://evil.example/", link: true) == .outside, "a pressed link goes outside")
check(m("https://evil.example/", .newWindow) == .outside, "window.open goes outside")
// What is not an address does not stand in the window.
check(m("data:text/html,x") == .cancel, "data page")
check(m("data:text/html,x", link: true) == .cancel, "data link")
check(m("data:text/html,x", .newWindow) == .cancel, "data window")
check(m("blob:https://app.brain.dog/1") == .cancel, "blob in the window")
check(m("blob:https://evil.example/1", popup: true) == .cancel, "someone else's blob")
check(m("blob:https://app.brain.dog.evil.example/1", .newWindow) == .cancel, "a blob with a name starting the same")
check(m("blob:https://app.brain.dog/1", popup: true) == .allow, "the PDF's hidden window")
check(m("blob:https://app.brain.dog/1", .newWindow) == .allow, "opening that window")
check(m("about:blank") == .allow, "a sleeping screen")
check(m("about:srcdoc") == .cancel, "srcdoc in the window")
check(m("about:blank", .newWindow) == .cancel, "a blank window")
// Sign-in.
check(m("https://app.brain.dog/signin") == .signedOut, "the web's sign-in page")
// Frames have no bridge, but only what can be a frame loads.
check(m("https://challenges.cloudflare.com/x", .sub) == .allow, "Turnstile")
check(m("blob:https://app.brain.dog/1", .sub) == .allow, "the PDF's frame")
check(m("about:srcdoc", .sub) == .allow, "srcdoc frame")
check(m("http://evil.example/", .sub) == .cancel, "plain http frame")
check(m("file:///etc/passwd", .sub) == .cancel, "a file frame")
check(m("braindog://tell", .sub) == .cancel, "our scheme in a frame")
// Only the web, a mail and a call leave the app.
for s in ["https://x.example", "http://x.example", "mailto:a@b.example", "tel:123"] { check(WebGate.mayLeave(u(s)), s) }
for s in ["file:///Applications/Calculator.app", "smb://evil.example/s", "shortcuts://run-shortcut?name=x", "braindog://tell", "ftp://x.example", "javascript:alert(1)", "data:text/html,x", "x-apple.systempreferences:"] { check(!WebGate.mayLeave(u(s)), s) }
for s in ["file:///var/mobile/x", "mailto:a@b.example", "braindog://tell"] { check(!WebGate.mayShare(u(s)), s) }
check(WebGate.mayShare(u("https://x.example/a")), "a web address is shared")
// A frame of someone else's keeps no file.
check(WebGate.mayKeep(u("https://evil.example/f"), origin: o, mainFrame: true), "the window's own")
check(!WebGate.mayKeep(u("https://evil.example/f"), origin: o, mainFrame: false), "someone else's frame")
check(WebGate.mayKeep(u("https://app.brain.dog/f"), origin: o, mainFrame: false), "our frame")
// Addresses from outside.
for s in ["/", "/decide/SG4", "/p/money?view=month", "/the-studio/r/tasks/3", "/invite", "/slash?q=a%20b", "/p/api", "/settings/signing-in"] { check(WebGate.appPath(s) == s, s) }
for s in ["", "decide", "//evil.example", "/\\evil.example", "/x\\y", "/x\ny", "/api/x", "/API/x", "/auth/logout", "/oauth/authorize?client=x", "/account/records", "/mcp", "/slug/api/x", "/slug/auth/x", "/./api/x", "/../auth/x", "/%2e%2e/api/x", "/x/%2F/y", "/.well-known/x", "/drawn-frame"] { check(WebGate.appPath(s) == nil, s) }
// The sign-in link: the origin's, never the scheme any page can open.
check(WebGate.isSignInLink(u("https://app.brain.dog/signin?app=a#magic=t"), origin: o), "the link")
for s in ["braindog://x/signin#magic=t", "braindog:///signin?app=a#magic=t", "https://evil.example/signin#magic=t", "http://app.brain.dog/signin#magic=t", "https://app.brain.dog/signin", "https://app.brain.dog/x#magic=t"] { check(!WebGate.isSignInLink(u(s), origin: o), s) }
// A redirect does not carry the session away.
check(WebGate.staysHome(u("https://app.brain.dog/a"), from: u("https://app.brain.dog/b")), "home")
for s in ["https://evil.example/", "http://app.brain.dog/", "https://app.brain.dog:8443/"] { check(!WebGate.staysHome(u(s), from: u("https://app.brain.dog/b")), s) }
// A name is a name.
for (s, want) in [("a.pdf", "a.pdf"), ("../../x.sh", "x.sh"), ("..\\..\\x", "x"), ("..", "BrainDog"), ("", "BrainDog"), ("/", "BrainDog")] { check(WebGate.fileName(s) == want, s) }
print(bad == 0 ? "ALL HELD" : "\(bad) FAILED")
exit(bad == 0 ? 0 : 1)
`;

test('THE GATE, ASKED EVERY CASE: the window, what leaves, what comes in, the sign-in link', { skip: swiftc ? false : 'no swiftc here' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'webgate-'));
  try {
    writeFileSync(join(dir, 'main.swift'), `import Foundation\n${CASES}`);
    const out = join(dir, 'gate');
    const built = spawnSync('xcrun', ['swiftc', '-swift-version', '6', join(kit, 'Web/WebGate.swift'), join(dir, 'main.swift'), '-o', out], { encoding: 'utf8' });
    assert.equal(built.status, 0, built.stderr);
    const ran = spawnSync(out, { encoding: 'utf8' });
    assert.equal(ran.status, 0, ran.stdout);
    assert.match(ran.stdout, /ALL HELD/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('THE WEB SCREEN ASKS THE GATE, for each move, each thing it hands outside and each file name', () => {
  const screen = read(kit, 'Web/WebScreen.swift');
  assert.match(screen, /WebGate\.move\(url, origin: Server\.origin/);
  assert.match(screen, /private func openOutside\(_ url: URL\) \{\n\s+guard WebGate\.mayLeave\(url\) else \{ return \}/);
  assert.match(screen, /WebGate\.fileName\(suggestedFilename\)/);
  assert.match(screen, /WebGate\.mayKeep\(/);
  assert.doesNotMatch(screen, /\["about", "blob", "data"\]\.contains/);
});

test('NOTHING IN A WEB VIEW OPENS FILES, OPENS WINDOWS BY ITSELF, OR IS INSPECTABLE IN A RELEASE', () => {
  const swift = walk(apple).filter((f) => f.endsWith('.swift')).map((f) => read(f)).join('\n');
  for (const flag of ['loadFileURL', 'allowFileAccess', 'allowUniversalAccess', 'javaScriptCanOpenWindowsAutomatically']) assert.ok(!swift.includes(flag), flag);
  const screen = read(kit, 'Web/WebScreen.swift');
  assert.match(screen, /#if DEBUG\n\s+webView\.isInspectable = true/);
  assert.equal(swift.split('isInspectable').length - 1, 1);
});

test('THE BRIDGE IS THE MAIN FRAME OF THE ORIGIN, and hands the system only what the gate lets out', () => {
  const bridge = read(kit, 'Bridge/ShellHandler.swift');
  assert.match(bridge, /guard message\.frameInfo\.isMainFrame else \{ return false \}/);
  assert.match(bridge, /origin\.protocol == Server\.origin\.scheme && origin\.host == Server\.host/);
  assert.match(bridge, /forMainFrameOnly: true/);
  assert.match(bridge, /WebGate\.mayLeave\(url\) \{ hear\(\.open\(url\)\) \}/);
  assert.match(bridge, /WebGate\.mayShare\(url\) \{ hear\(\.share/);
  assert.match(read(kit, 'Web/Look.swift'), /forMainFrameOnly: true/);
});

test('ONLY THE MAILED LINK ON THE ORIGIN SIGNS IN, a link never swaps the session, and one not asked for here asks first', () => {
  for (const file of ['iOS/BrainDogApp.swift', 'Mac/BrainDogMac.swift']) {
    const links = read(apple, file);
    assert.match(links, /if url\.scheme != "braindog", url\.path == "\/signin" \{/, file);
    assert.match(links, /path\.flatMap\(WebGate\.appPath\)/, file);
    assert.doesNotMatch(links, /path\.hasPrefix\("\/api\/"\)/, file);
  }
  assert.match(read(kit, 'Auth/EmailLink.swift'), /WebGate\.isSignInLink\(url, origin: Server\.origin\)/);
  const flow = read(kit, 'Auth/SignInView.swift');
  assert.match(flow, /guard EmailLink\.isSignInLink\(url\), !Session\.shared\.signedIn else \{ return \}/);
  assert.match(flow, /guard EmailLink\.askedHere\(url\) else \{\n\s+unasked = url/);
});

test('THE SESSION IS THIS DEVICE ONLY, never synchronised, and nothing kept outlives a sign-out', () => {
  const session = read(kit, 'Auth/Session.swift');
  assert.equal(session.match(/kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/g).length, 2, 'both the add and the update set the class');
  assert.doesNotMatch(session, /kSecAttrAccessibleAfterFirstUnlock\b|kSecAttrAccessibleAlways|kSecAttrSynchronizable/);
  assert.match(session, /allWebsiteDataTypes\(\)\.subtracting\(\[WKWebsiteDataTypeCookies\]\)/);
  const kept = read(kit, 'Glance/Kept.swift');
  assert.match(kept, /isExcludedFromBackup = true/);
  assert.match(kept, /file\("launch", "png"\), options: \[\.atomic, \.completeFileProtection\]/);
  assert.match(read(kit, 'API/Client.swift'), /delegate: StaysHome\(\)/);
});

test('A LOCKED PHONE NEITHER SAYS NOR TAKES THE RECORD: Siri needs it unlocked, a glance is blanked, Accept asks', () => {
  const intents = read(apple, 'Shared/Intents.swift');
  assert.equal(intents.match(/authenticationPolicy: IntentAuthenticationPolicy \{ \.requiresAuthentication \}/g).length, 2);
  const glance = read(kit, 'Glance/GlanceViews.swift');
  assert.ok(glance.match(/\.privacySensitive\(\)/g).length >= 10);
  for (const text of ['first.question', 'q.question', 'f.said', 'dueLine', 'line.text', 'figure.said']) {
    const at = glance.indexOf(`Text(${text}`);
    assert.ok(at >= 0 && glance.slice(at, at + 600).includes('.privacySensitive()'), text);
  }
  assert.equal(read(kit, 'Push/Push.swift').match(/options: \[\.authenticationRequired\]/g).length, 2);
});

test('A RELEASE TALKS TO THE ONE HOST: every override is Debug, and no plist opens plain http', () => {
  const server = read(kit, 'API/Server.swift');
  const open = server.indexOf('#if DEBUG');
  assert.ok(open >= 0 && open < server.indexOf('braindogServer"') && server.indexOf('braindogServer"') < server.indexOf('#endif'));
  const project = read(apple, 'project.yml');
  assert.doesNotMatch(project, /NSAllowsArbitraryLoads|NSExceptionDomains|NSAllowsLocalNetworking/);
  assert.doesNotMatch(project, /BrainDogServer: (?!https:\/\/app\.brain\.dog\n)/);
  assert.match(project, /configs:\n\s+#[^\n]*\n\s+Release:\n\s+CODE_SIGN_INJECT_BASE_ENTITLEMENTS: NO/);
  assert.doesNotMatch(walk(apple).filter((f) => f.endsWith('.entitlements')).map((f) => read(f)).join('\n'), /get-task-allow|cs\.disable-library-validation|cs\.allow-unsigned|cs\.allow-jit|cs\.debugger/);
});

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'build' || e.name === 'node_modules' || e.name.endsWith('.xcodeproj') || e.name.endsWith('.xcassets')) return [];
    const at = join(dir, e.name);
    return e.isDirectory() ? walk(at) : [at];
  });
}
