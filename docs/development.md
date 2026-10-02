# Developing the SDK

Building, testing and checking `helpkit-react-native`, all of which runs on Windows with no
simulator and no phone — and then how to try it on a phone.

## The clean-room rule

helpkit.so's React Native SDK is "All rights reserved". Nothing of it is copied here: not its code,
its injected scripts, its styles or its skeleton. Only its **public API names** are mirrored
(`HelpKit`, `HelpKitSDK` and their calls), so apps can move across. Write from HelpKit's own design
and the public documentation of React Native, react-native-webview and
react-native-safe-area-context. Don't open helpkit.so's source to see how it does something.

## Layout

```
src/
  index.ts        the exports: HelpKit, HelpKitSDK, and the public types
  types.ts        the public types
  sdk.ts          HelpKitSDK: checks each call and hands it to the store
  store.ts        the state between the calls and the mounted <HelpKit>: queued call, fields, sign-out
  HelpKit.tsx     the component: the iOS page sheet or the Android view, the header, the WebView
                  (the only file that imports react-native-webview)
  sheet.ts        what the open sheet does: find the site, show a view, check every load, talk protocol 1
  Header.tsx      Back, the title, Close
  StateView.tsx   loading, "not available", "couldn't load"
  resolve.ts      the resolver's question and answer
  bridge.ts       protocol 1: the page's messages, and the injected script
  links.ts        where each navigation goes: stay, outside, or nowhere
  url.ts          origins (compared by prefix), the http rule, view paths, slugs
  editions.ts     which language or version an opening shows, from the resolver's editions
  theme.ts        the sheet's colours
  keyboard.ts     room for the keyboard on Android
  strings.ts      the sheet's own words
  log.ts          development warnings and debug lines (never a field's value)
  version.ts      the SDK's version
  __tests__/      Jest, with a mocked WebView (support/webview.tsx)
example/          an Expo SDK 57 app, an npm workspace
scripts/          print-injection.mjs, check-bundle.mjs, web-cross-check/
docs/             this file, and protocol.md
```

## Setup

Node **22.13 or later** (React Native Testing Library 14 needs it); `.nvmrc` names 24, which is what
CI uses and what `nvm use` picks. Then, at the repository root:

```sh
npm install
```

The example app is an npm workspace, so this installs it too. The library's own copies of `react`,
`react-native`, `react-native-webview` and `react-native-safe-area-context` are pinned to exactly the
example's versions, so npm keeps a single copy of each (two copies of React in one app break it).

## The checks

| Command | What it proves |
| --- | --- |
| `npm test` | every rule, with a mocked WebView (Jest, `@react-native/jest-preset`, Testing Library) |
| `npm run typecheck` | TypeScript, strict, over the library, its tests and the example |
| `npm run lint` | ESLint: recommended, typescript-eslint, the rules of hooks |
| `npm run check:pack` | `bob build`, the packed file list, `publint`, and `attw --profile esm-only` (the types resolve for an ESM-only package) |
| `npm run -w helpkit-react-native-example export:android` (and `export:ios`) | Metro bundles the example for each platform, on Windows |
| `npm run check:bundle` | reads those bundles: the SDK is in them, and there is one copy each of react, react-native and the two native libraries |
| `npm run print-injection` | prints the exact scripts the SDK injects, for the DevTools check |

### The bundles, from the source and as an app gets the package

The example runs the library's **TypeScript source** (the `helpkit-rn-source` export condition,
added by `example/metro.config.js`), so edits reload at once. To bundle the package **as an app
installs it** — through `exports` to the built `lib/module` — build it first and turn the condition
off (in Git Bash):

```sh
npm run build
cd example
HELPKIT_EXAMPLE_BUILT=1 npx expo export --platform android --output-dir dist/android-built --source-maps --clear
HELPKIT_EXAMPLE_BUILT=1 npx expo export --platform ios --output-dir dist/ios-built --source-maps --clear
cd ..
node scripts/check-bundle.mjs example/dist/android-built example/dist/ios-built
```

`check-bundle` then reports built files rather than source files. (`example/app.json` switches off
Expo's tsconfig `paths` in Metro: the root tsconfig's alias is for TypeScript only, and would
otherwise always pick the source.) Bundling iOS JavaScript needs no Mac.

## CI

`.github/workflows/ci.yml` runs the checks above on every push to every branch and on every pull
request. It needs no secret, no variable and no setting on GitHub, and it publishes nothing.

| Job | Runs | What it proves |
| --- | --- | --- |
| `check` | `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:pack` | `package.json` and the lock file agree; the library, its tests and the example typecheck; the lint rules hold; every Jest test passes; and the package builds, packs the files it should, and resolves for an app that imports it |
| `bundle` | `npm ci`, the example's `export:android` and `export:ios`, `npm run check:bundle` | Metro can bundle an app that uses the SDK for both platforms, and each bundle has the SDK and one copy each of react, react-native and the two native libraries |

To run what CI runs, run those commands, in that order, at the repository root. `npm ci` installs
exactly the lock file, deleting `node_modules` first; `npm install` is fine for everyday work.

- **From the source, not the build.** The `bundle` job bundles the example as it is developed,
  from the SDK's TypeScript. The built-package bundle (above) is not in CI; `check:pack` is what
  covers the built files there.
- **Permissions and secrets.** `contents: read` and nothing else, and the checkout doesn't leave
  its token behind. There is no npm token anywhere: publishing is the owner's, by hand
  ([Releasing](#releasing-the-owners-decision)).
- **Concurrency and timeouts.** A newer push to the same branch or pull request cancels the run
  before it; each job stops after 15 minutes.
- **Node and caches.** `actions/setup-node` reads `.nvmrc` (24) and keeps npm's download cache,
  keyed on `package-lock.json`.
- **Actions.** `actions/checkout@v7` and `actions/setup-node@v7`, each one's newest major on
  2026-09-30, read from its releases and tags.

**It has not run on GitHub yet.** Every command in both jobs was run on Windows, the same way, from
a clean copy of the repository with no `node_modules`, no `lib` and no `example/.env.local`, and
passed: 154 Jest tests in 9 suites, and both bundles. What only a run on GitHub can show: that the
workflow starts at all, and the same commands on Linux — Metro and the Hermes compiler in
particular, which `expo export` runs and which are different programs there. Every relative import
was checked to be spelled exactly as its file is on disk, which is the usual way a Linux run
differs. Nothing in CI is a phone: the README's device checklist is still to be done by hand.

## The DevTools check

The SDK's real injected script against the help center's real `/_mobile` page, without a phone.
Two ways.

**Without a browser.** `scripts/web-cross-check/` holds a test that runs the built script against
the page's own `MobileBridge`, with the web app's own Vitest setup, adding nothing to the web app's
repository. From the web app's folder (`HELPKIT_WEB` is its path; by default the sibling
`../helpkit-web`):

```sh
npm run build                                   # here, in helpkit-react-native
cd ../helpkit-web                               # or the mobile lane's worktree
HELPKIT_WEB=$(pwd) npx vitest run --config ../helpkit-react-native/scripts/web-cross-check/vitest.config.mts
```

**In a browser**, with the web app running (the lane: `http://acme.localhost:3212`, a site `acme`
with its mobile app on), open `http://acme.localhost:3212/_mobile` at phone width, then:

1. `npm run print-injection -- http://acme.localhost:3212`, and paste its first line into the
   console: it defines the bridge object, so the page's messages to the app are logged.
2. Move around (a collection, an article, the contact view): each move logs a `state` with the right
   `up`.
3. On the contact view, paste the `prefill` script: the empty fields fill, and "Sent with your
   message" appears.
4. Paste the `up` script: the view goes back one step; at the first view the page logs `close`.
5. Send a message and press Done: the page logs `close`.

## Trying it on a phone

The example runs in **Expo Go** (it includes react-native-webview and safe-area-context, and the SDK
is plain JavaScript, so nothing needs building). Expo Go runs only the current Expo SDK, so the
example stays on the latest.

1. Copy `example/.env.example` to `example/.env.local` and fill in the App ID and `host` (both
   public values).
2. `npm run -w helpkit-react-native-example start`, and open the app in Expo Go.
3. Run the [device checklist](../README.md#device-checklist).

The phone has to reach the HelpKit web app **by a site's host name** (the resolver answers the
site's own subdomain, like `http://acme.localhost:3212`). Two setups need only configuration; the
system-level steps are the phone owner's.

**Android, over USB.**

- Install Android's platform-tools (for `adb`) and switch on USB debugging on the phone.
- `adb reverse tcp:3212 tcp:3212` and `adb reverse tcp:8081 tcp:8081`, then start with
  `npx expo start --localhost` in `example/`.
- `EXPO_PUBLIC_HELPKIT_HOST=http://localhost:3212`. The resolver then answers
  `http://acme.localhost:3212`, which Android's WebView should resolve to the phone's own loopback,
  and so through `adb reverse` to the computer. If it doesn't, use a `127-0-0-1.nip.io` root domain
  as below.

**Same Wi-Fi** (the only way for an iPhone from Windows).

- Run the web app and the API with their root domain set to the computer's address on nip.io, like
  `192-168-1-20.nip.io`: the web app's `HELP_CENTER_ROOT_DOMAIN`, and the API's
  `HelpCenterHosting:RootDomain` with `SiteScheme=http` and `SitePort=3212`. Start the web app with
  `next dev -H 0.0.0.0 -p 3212`. If Next logs "Blocked cross-origin request", add a development-only,
  never committed, `allowedDevOrigins`.
- Allow port 3212 through the Windows firewall for private networks.
- `EXPO_PUBLIC_HELPKIT_HOST=http://192-168-1-20.nip.io:3212`; the site is then
  `http://acme.192-168-1-20.nip.io:3212`.
- Some routers refuse DNS answers that point at private addresses; if so, use USB.
- nip.io is a public DNS service: it sees host names, nothing else. Development only.
- **An iPhone may refuse plain http to a nip.io name** (App Transport Security allows local IP
  addresses and `.local` names, not arbitrary ones). If it does, the fallback is an https tunnel on a
  domain you control.

A production app loads https only; the SDK enforces it.

## Releasing (the owner's decision)

Nothing is published until the owner decides the package's public name and npm scope, its licence,
and the trademark question in the README. Then: set `name`, `license` and a `LICENSE` file, remove
`"private": true`, update the dashboard's `MOBILE_PACKAGE`, the README and the example's import, run
every check above, and publish with the owner's own npm account. Nobody else types, stores or prints
its token.
