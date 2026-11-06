/**
 * `/.well-known/assetlinks.json`: the file that lets BrainDog's Android app open app.brain.dog full screen, with no browser
 * bar. Android reads it and checks that the app is signed by a key named here.
 *
 * TWO KEYS ONCE GOOGLE SIGNS THE APP. A build is signed with the upload key, and Google Play signs what it hands out with a
 * key of its own, so people's phones hold the second one. Without it the app still runs, with the address bar showing.
 */
export const ANDROID_APP = 'dog.brain.app';

/** The upload key's certificate, and Play's app signing key from the Play Console once the app is there. */
export const ANDROID_FINGERPRINTS: readonly string[] = [
  '9F:B7:69:CD:8B:16:A7:F7:07:B7:A7:D1:FF:07:32:6C:81:96:BF:E1:6B:E2:79:8C:B5:67:45:38:86:9A:93:F4',
];

export const assetLinks = (): object[] => [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: ANDROID_APP, sha256_cert_fingerprints: [...ANDROID_FINGERPRINTS] },
  },
];

export function androidAssociation(): Response {
  return new Response(JSON.stringify(assetLinks()), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });
}
