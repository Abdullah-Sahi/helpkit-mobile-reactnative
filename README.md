# helpkit-react-native

[![Build and test](https://github.com/Abdullah-Sahi/helpkit-mobile-reactnative/actions/workflows/ci.yml/badge.svg)](https://github.com/Abdullah-Sahi/helpkit-mobile-reactnative/actions/workflows/ci.yml)

Your HelpKit help center inside your React Native app, on iOS and Android: search, articles,
feedback and your contact form, in a native sheet with its own header, opened from any button in
your app.

```tsx
import { HelpKit, HelpKitSDK } from 'helpkit-react-native';

// Once, at the root of your app:
<HelpKit projectId="YOUR_APP_ID" config={{ host: 'https://YOUR_HELPKIT_ADDRESS' }} />

// From anywhere:
HelpKitSDK.openArticle('reset-your-password');
```

> **Status: 0.1, private, unpublished.** The package is `"private": true` and `"license":
> "UNLICENSED"` until its public name, npm scope and licence are chosen (see [Licence and
> name](#licence-and-name)). The page ↔ app protocol, the resolver's answer and the view addresses
> are promised forever-compatible from the first **published** release.

## Contents

- [Install](#install)
- [Your App ID](#your-app-id)
- [Mount it once](#mount-it-once)
- [Opening help](#opening-help)
- [Contact fields and metadata](#contact-fields-and-metadata)
- [Signing out](#signing-out)
- [Languages and versions](#languages-and-versions)
- [Links](#links)
- [How it looks](#how-it-looks)
- [How the sheet is presented](#how-the-sheet-is-presented)
- [When help can't be shown](#when-help-cant-be-shown)
- [Accessibility](#accessibility)
- [What this sends, and to whom](#what-this-sends-and-to-whom)
- [Limits](#limits)
- [Security notes](#security-notes)
- [Compatibility](#compatibility)
- [Device checklist](#device-checklist)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [CI](#ci)
- [Licence and name](#licence-and-name)

## Install

With Expo:

```sh
npx expo install helpkit-react-native react-native-webview react-native-safe-area-context
```

Without Expo, `npm install` the same three, then `cd ios && pod install`.

`react-native-webview` and `react-native-safe-area-context` are **peer dependencies**: your app has
one copy of each, and so does the SDK. The SDK itself is plain JavaScript, so it runs in Expo Go.

## Your App ID

In the HelpKit dashboard: **Settings → Mobile app**. Switch "Show your help center in your app" on
and save; the card then shows your **App ID** and a snippet with both values filled in.

- The App ID is **public, not a secret**: it is built into your app, for anyone to read.
- It **never changes**: renaming your help center or connecting a domain doesn't break apps already
  on people's phones, and nobody who later takes an address you gave up can appear in your app.
- `host` is HelpKit's own address (where the dashboard is served), where the SDK asks which help
  center the App ID names. It is required until HelpKit has a production address of its own; the
  dashboard's snippet always includes it.

## Mount it once

Put `<HelpKit>` **once, at the root** of your app, and **last**, outside anything that pads or clips
(a `SafeAreaView`, a `View` with padding): on Android the sheet is drawn over everything before it.

```tsx
// App.tsx
export default function App() {
  return (
    <SafeAreaProvider>
      <Navigation />
      <HelpKit projectId="YOUR_APP_ID" config={{ host: 'https://YOUR_HELPKIT_ADDRESS' }} />
    </SafeAreaProvider>
  );
}
```

With Expo Router, the same in `app/_layout.tsx`, after `<Stack />` (or `<Slot />`).

`config`, all optional but `host`:

| Option | |
| --- | --- |
| `host` | HelpKit's address. `https:`, or `http:` for a local address in a development build. |
| `headerTitle` | The sheet's title: a string, or a function for your own translations. Defaults to your help center's name. |
| `strings` | Your words for the sheet's own few: `help`, `back`, `close`, `loading`, `errorTitle`, `errorBody`, `retry`, `unavailableTitle`, `unavailableBody`. |
| `onOpenLink` | Receives every link that leaves the help center, instead of the SDK opening it ([Links](#links)). |
| `debug` | Diagnostics in the console. Never your contact fields, and never WebView debugging ([Security notes](#security-notes)). |
| `language` | Your app's language, as a tag (`de`, `pt-BR`, `zh-Hant`): help opens in it when your help center is written in it ([Languages and versions](#languages-and-versions)). |
| `version` | The version of your help center to open, by its label (`v2`), when your app is built for one ([Languages and versions](#languages-and-versions)). |

`config` is read each time the sheet opens, so a changed value is used from the next opening.

## Opening help

```tsx
HelpKitSDK.open();                          // the front page
HelpKitSDK.openArticle('reset-your-password'); // an article (on a documentation site, a page)
HelpKitSDK.openCategory('billing');         // a collection (on a documentation site, a top-level page)
HelpKitSDK.openSearch('refund');            // the front page with these words in the search box
HelpKitSDK.openContact();                   // the contact form
HelpKitSDK.close();
HelpKitSDK.isOpen();                        // true while the sheet is open
```

- **Slugs.** An article or collection is named by its slug: the last part of its address, like
  `reset-your-password` in `/articles/reset-your-password`. A slug is lowercase letters, digits and
  hyphens. A malformed one opens the front page instead (with a warning in development); one that
  doesn't exist shows the help center's own "not found", with a way home. Renaming an article's slug
  breaks an app that opens it by the old one, so keep slugs you use in your app stable.
- **`openSearch`** puts the words in the box and searches nothing until the reader asks.
- **Per-call options**, as helpkit.so takes them: `{ headerTitle }` and `{ version }` for that
  opening only.
- **Calling while open** shows the new view in the same sheet.
- **Calling before `<HelpKit>` has mounted** is kept, not dropped: the last call opens once it
  mounts, if that is within 5 seconds (later than that it is forgotten, so an app that mounts
  `<HelpKit>` only after sign-in doesn't get a sheet nobody asked for just then).
- **Back.** The header's Back, and Android's back button, go back one view; at the first view they
  close the sheet. An article opened directly shows no Back.
- **Every opening asks HelpKit afresh** which help center the App ID names (one small request; no
  cookies). Nothing is cached, so switching the app off, or renaming the site, reaches the next open.

## Contact fields and metadata

```tsx
HelpKitSDK.setContactFields({
  name: user.name,
  email: user.email,
  subject: 'About my order',
  metadata: { appVersion: '2.4.1', platform: Platform.OS },
});
HelpKitSDK.setContactFields(null); // or {}: clears them
```

- They **fill only fields the reader left empty**, and every field stays visible and editable. A
  reader signed in to a protected help center always sends from their signed-in address.
- `metadata` is a string, or a plain object sent as JSON. It is **shown to the reader** under "Sent
  with your message" before they send, stored with the message for its year, shown to your team, and
  included in the `contact.received` webhook — everywhere labelled **"not verified"**.
- **Never put a secret in metadata** (a token, a password, a session ID), and **never rely on it for
  who somebody is** or what they are entitled to: anyone can send a message with any metadata.
- Limits: name 100 characters, email 254, subject 150, metadata 2,000. A longer field, a field that
  isn't a string, or a key other than these four is dropped, with a warning in development that
  never shows the value.
- Held **in memory only**: never written to storage, never put in an address, never logged — not
  even with `debug`.

## Signing out

A protected help center asks its readers to sign in, on its own sign-in form, inside the sheet. The
pass is kept by the WebView, so they stay signed in between openings, and they can sign out at the
foot of the sheet.

**Call `HelpKitSDK.signOut()` when somebody signs out of your app**, so the next person to use the
phone doesn't read, or send messages, as them:

```tsx
async function logOut() {
  await myAuth.signOut();
  HelpKitSDK.signOut();
}
```

It signs the reader out of the help center, forgets the contact fields you set and any unsent
draft. With the sheet closed, it happens the next time the sheet opens **in this run of your app** —
if your app is closed first, the reader stays signed in until they sign out in the sheet (a later
version may do it at once).

The contact form keeps an unsent draft on the phone for a day, and only its subject and message —
never the reader's name or email address.

## Languages and versions

On a plan with more than one language, your help center can be written in other languages, and in
versions of your product (`v1`, `beta`), each launched on the dashboard's **Languages & versions**
page. Tell the SDK your app's language, and the version it is built for, and each opening goes to the
right one:

```tsx
import { getLocales } from 'expo-localization';

// Once, at the root: the language your app is showing (here the phone's first, for an app that
// follows the phone), and, when your help center has versions, the one this build of your app is for.
<HelpKit
  projectId="YOUR_APP_ID"
  config={{ host: 'https://YOUR_HELPKIT_ADDRESS', language: getLocales()[0]?.languageTag, version: 'v2' }}
/>

// When the reader changes your app's language:
HelpKitSDK.setLanguage('de-AT');
// When the version your app needs help for changes:
HelpKitSDK.setVersion('v1');

// For one opening only:
HelpKitSDK.openArticle('install', { version: 'v1' });
```

Which one opens, first match wins:

1. **A version**: the opening's own `{ version }`, else `setVersion()`'s, else `config.version`. It
   is your version's label, as the Languages page shows it, in any case.
2. **A language**: `setLanguage()`'s, else `config.language`. Its exact tag first, then the same
   language wherever it is spoken (`de-AT` opens German), with Chinese kept apart by script
   (`zh-TW` and `zh-HK` open Traditional, `zh-CN` Simplified). Android's `de_AT` works too.
3. **Your help center's main language**, as when neither is set.

- **A version is never chosen by language**, and a language never by a version: a German version
  (labelled, say, `v2-de`) opens only when it is the version you ask for.
- **Only what readers are offered**: a language or version opens once it is launched and your plan
  serves it. Until then, help opens as if it weren't set.
- **A version your help center doesn't have** — not made yet, deleted, or not yet launched — opens
  as if no version were set (the language, then the main one), never a "not found". A development
  build warns once, naming the versions there are. So an app shipped today can ask for a version you
  make later.
- **Slugs are your main language's**, the ones on your help center's site: `openArticle('install')`
  is the same call in every language. Each language's pages have slugs of their own, made from their
  translated titles, so in German `install` opens the German translation of `install`, whatever its
  slug there, or the main language's `install` when it hasn't been translated. `openCategory` works
  the same way. A version's pages keep their slugs, so the same slug opens that version's page.
- **The language is your app's, never guessed from the phone**: your app knows which language it is
  showing. `null` or `''` clears either setting. Both are read at each opening; changing them while
  the sheet is open changes the next opening.
- **Inside the sheet**, the front page lists your help center's languages (never its versions), and a
  reader may switch there. The next opening follows your app's settings again.
- The sheet's own few words stay yours (`strings`), in whatever language your app gives them; the
  pages bring theirs in the edition's language.

## Links

Every link that leaves the help center opens **outside your app**: in the phone's browser, or its
mail app for `mailto:`. Links between help pages stay in the sheet. Nothing but the help center's
own app pages is ever shown under your app's header.

To open links yourself — in an in-app browser, or to send your own universal links or App Links
into your app — pass `onOpenLink`. It receives every link out (`https:`, `http:` and `mailto:`), and
the SDK then opens none itself:

```tsx
<HelpKit projectId="…" config={{ host: '…', onOpenLink: (url) => WebBrowser.openBrowserAsync(url) }} />
```

Article links are `http(s)` and `mailto:` only in this version: an article can't yet link into your
app with a custom scheme (like `myapp://settings`).

## How it looks

- **Styles**, chosen on the dashboard's Mobile app card: **Branded** (your header colour across the
  top, and behind the search box) or **Minimal** (plain, in your help center's own background).
- **Dark mode** follows your help center's theme: a site set to light or dark is always that; one
  set to follow the device follows it. The native header and the page below it are worked out from
  the same colours, so they meet without a seam, and the sheet's background matches the page's so
  nothing flashes white in dark mode.
- The **status bar's icons** are chosen to read on the header (Android).
- The front page's sections (suggested articles, all collections, "Contact us") are set on the same
  card, for the app only; your website and widget are untouched.

## How the sheet is presented

- **iOS: a page sheet** (a Modal with `presentationStyle="pageSheet"`). Swipe down to close.
  WKWebView keeps a focused field above the keyboard by itself.
- **Android: a view over your app, in your app's own window — not a Modal.** An Android Modal is a
  separate dialog window, and under edge-to-edge (every app on Android 15 and later) that window
  neither shrinks for the keyboard nor reliably hears keyboard events, so the keyboard would cover
  the contact form's fields and its Send button. In your app's own window the keyboard is heard, and
  the sheet makes room for it. Back is Android's back button (`BackHandler`, which React Native 0.81
  and later route through Android 16's new back handling). This is why `<HelpKit>` goes last in your
  root: there, it covers the whole screen.

**Help can't open over your app's own `<Modal>`** (React Native's, or `react-native-modal`, which is
built on it), on either platform. Close your Modal first, then call `HelpKitSDK.open*()` — from the
Modal's `onDismiss` on iOS, or once it has closed on Android.

- On Android your Modal is a dialog window above your app's window, so the sheet is drawn beneath
  it, out of sight, and the back button goes to your Modal.
- On iOS a screen that is already presenting a Modal can't present another, so the sheet doesn't
  appear, and help stays unavailable until `HelpKitSDK.close()` is called.

This choice was made without a device to hand; the [device checklist](#device-checklist) is how it
is confirmed.

## When help can't be shown

| What the reader sees | When | Try again |
| --- | --- | --- |
| **"Help isn't available right now"** | the App ID names no help center; or its mobile app is switched off, or not on its plan; or `projectId`/`host` isn't usable | yes |
| **"Couldn't load help"** | no network; HelpKit answered with an error; the page didn't finish within 15 seconds; the WebView stopped twice within 30 seconds | yes, back to the page the reader had reached |

Neither ever opens a browser instead. In a development build, a warning in the console says which
case it is and what to fix. A page of the help center's own (not found, sign in, paused) is shown as
it is, and Close always works.

## Accessibility

- Back and Close are buttons labelled for screen readers, each at least 44 points square.
- The title is the screen reader's heading, and where focus starts when the sheet opens. It keeps to
  one line, so large text can't push the buttons off.
- Loading, "not available" and "couldn't load" are announced (a live region on Android,
  announcements on iOS).
- Reduced motion drops the slide.
- The pages themselves carry the help center's language and direction, move focus to each new
  view's heading (never to a field, so going back never pops the keyboard up), and follow Android's
  system font size.
- The header follows your app's own direction (right-to-left included).

## What this sends, and to whom

For the App Store's App Privacy details and Google Play's Data safety form. Everything goes to
HelpKit, which runs your help center; nothing goes to any other party, and there is no analytics,
advertising or tracking code in the SDK. Your help center's own analytics (GA4, Plausible), custom
code and chat don't run inside your app.

| Data | When | Kept |
| --- | --- | --- |
| The App ID and, as with any request, the phone's IP address; the help pages' requests also carry `HelpKitRN/<version>` in their user agent, and their address the language or version opened (`/_mobile/de`) | each opening | not stored beyond server logs |
| Name, email address, subject, message, and your metadata | only when the reader sends a message | with the message, a year |
| Email address | only when a reader of a protected help center signs in by email | for the sign-in |
| Search words, which articles are read (counted per day, as "From the mobile app"), and feedback on articles | as the reader uses the help center | as anonymous counts; nothing identifies the reader |
| A sign-in cookie for a protected help center, and an unsent draft's subject and message (a day) | on the phone, in the WebView | until signed out / sent / a day |

As declarations, this is typically **Contact info (name, email address)** and **User content
(customer support messages)**, collected for **app functionality (customer support)**, not used for
tracking, and not linked to the reader's identity by HelpKit beyond what they send. The final
declaration is yours: it depends on what your app puts in the contact fields and metadata.

## Limits

HelpKit's limits were set for browsers, and many phones can share one network address behind a
carrier's NAT:

- a message: 5 a minute from one network address to one site; 5 an hour from one email address to
  one site; 50 an hour and 200 a day to one site;
- signing in to a protected help center: 10 a minute from one network address.

The form says so when a limit is reached.

## Security notes

- **WebView debugging is on only in development builds** (`__DEV__`), never in a release build, and
  `debug` doesn't change that. On Android, enabling it switches inspection on for *every* WebView in
  the app, including your own sign-in or payment pages, so the SDK never does that in a release.
- The WebView **never uses `incognito`**: on Android that clears cookies for the whole app.
- Only the help center's own app pages, on its HelpKit address over https, are shown in the sheet,
  talked to, or given your contact fields. Anything else that starts to load there is stopped, and
  the last help page shown again.
- The page ↔ app messages are in [docs/protocol.md](docs/protocol.md). The page tells your app almost
  nothing (that it is ready, whether Back has somewhere to go, that it wants to close), and your app
  can't act for the reader: it can point to a view, offer contact fields, and sign the reader out.

## Compatibility

| | Required | Tested with (Expo SDK 57) |
| --- | --- | --- |
| React | 19.1 or later | 19.2.3 |
| React Native | **0.81** or later | 0.86.3 |
| react-native-webview | **13.3** or later | 13.16.1 |
| react-native-safe-area-context | 4.10 or later | 5.7 |
| iOS / Android | whatever your React Native version supports | not yet on a device ([checklist](#device-checklist)) |

- **React Native 0.81** is where Android's back button reaches `BackHandler` under Android 16's new
  back handling (apps targeting API 36), and where edge-to-edge became the default the Android sheet
  is built for. On an older version Android's back button may do nothing.
- **react-native-webview 13.3** is the first with `onOpenWindow`, which is how links that open a new
  window leave your app instead of loading in the sheet.
- The SDK is published as ES modules only (with types), so an app can't end up with two copies of it.
- It does nothing on the web (Expo web), apart from a warning in development: the sheet is native.

## Device checklist

The SDK is tested on Windows with a mocked WebView, and its example app bundles for both platforms,
but nothing here has yet run on a phone. Before relying on it, run the example app on a real device
([docs/development.md](docs/development.md) says how) and check each of these. Note what you see
beside each one.

**Opening and closing**

1. The sheet opens from each button of the example, and closes with Close. On iOS it also closes by
   swiping down.
2. On iOS, the page sheet has no gap above the header (the safe-area inset inside a sheet is 0).
3. Landscape: the sheet looks right, and the app doesn't rotate when help opens.

**Back (Android)**

4. Android's back button goes back one view, then closes the sheet — on an Android 16 device with
   the app targeting API 36 too (predictive back).
5. After signing in to a protected help center (the page reloads), back still behaves.
6. Going back to the front page doesn't open the keyboard.

**The keyboard (the reason for the Android presentation)**

7. On the contact form, every field and the Send button can be reached with the keyboard up, on
   Android (edge-to-edge, Android 15 or later, and an older version) and on iOS.

**Look**

8. Safe areas: nothing under the notch, the Dynamic Island or the home indicator; nothing under
   Android's status or navigation bar.
9. On Android, the status bar's icons read on a dark branded header and on a light one. On iOS the
   SDK leaves the status bar to the system (above a page sheet it sits over the dimmed app, not the
   header): check it reads there too.
10. The header and the page below agree in light and dark mode (Branded and Minimal).
11. Large system text: the header keeps its buttons; on Android the page grows with it.

**Links**

12. A link to another site in an article opens the browser. On iOS, check that a `target="_blank"`
    link arrives through `onOpenWindow` (not as a sub-frame, which is refused).
13. `mailto:` opens the mail app. With `onOpenLink` set, it receives both instead.

**Contact and sign-in**

14. `setContactFields(sample)` fills the empty fields and shows "Sent with your message"; the message
    arrives in the dashboard's inbox with its metadata, marked not verified. Done closes the sheet.
15. A protected help center: signing in inside the sheet works, the pass survives closing the sheet
    and restarting the app, "Sign out" at its foot works, and `signOut()` from the example signs the
    reader out at once (sheet open) or at the next opening (sheet closed).

**Failures**

16. Airplane mode shows "Couldn't load help"; Try again works once back online, at the same page.
17. The app switched off on the dashboard, and a wrong App ID, show "Help isn't available right now".
18. After billing lands: a paused site shows its paused page in the sheet, and Close works.
19. Help opened from a button inside the example's own React Native `<Modal>`: note what shows and
    what Back does on each platform (expected: nothing shows until the Modal closes; see
    [How the sheet is presented](#how-the-sheet-is-presented)).
20. On a slow network (Android's network throttling), open an article and follow a link in it
    before its images finish loading: Back still goes up one view rather than closing.

**Accessibility**

21. VoiceOver and TalkBack: focus starts at the title; Back and Close are announced by name; the
    states are announced. On Android, check whether TalkBack can reach your app's screen behind the
    sheet (a view over the app, unlike a Modal, doesn't hide it) — note it if so.

**Development networking**

22. Android over USB with `adb reverse`: `*.localhost` addresses resolve inside the WebView.
23. An iPhone over Wi-Fi with a `*.nip.io` address over http (App Transport Security may refuse it;
    the fallback is an https tunnel).

**Languages and versions**

24. On a site with a German edition launched: `config.language: 'de-AT'` opens German, the front
    page's languages list switches language inside the sheet and Close still works after it, and a
    right-to-left edition (Arabic or Hebrew) reads right to left under the native header.

## Troubleshooting

In a development build the console says why help isn't showing:

- **"projectId isn't an App ID"**: copy it from Settings → Mobile app (22 characters).
- **"config.host isn't an address this SDK may use"**: give it HelpKit's https address, as the
  dashboard's snippet does. Plain `http:` works only in a development build, and only for
  `localhost`, `127.0.0.1`, `10.0.2.2`, `*.localhost`, `*.nip.io`, `*.sslip.io` or a private network
  address.
- **"No help center has this App ID"**: check it against the dashboard.
- **"switched off, or isn't on its plan"**: switch it on under Settings → Mobile app.
- **"More than one <HelpKit> is mounted"**: mount it once; the one mounted last receives the calls.
- **Nothing happens on Android**: `<HelpKit>` must come last in your root, not inside a padded view.
- **Nothing happens when help is opened from a Modal**: close your Modal first; help can't open over
  it on either platform ([why](#how-the-sheet-is-presented)).
- **"This help center offers no version …"**: the version you set isn't one readers are offered. Check
  its label on the dashboard's Languages & versions page, and that it is launched; until then help
  opens as if no version were set.
- **Help opens in the main language**: `language` (or `setLanguage`) must be a tag like `de` or
  `pt-BR`, of a language your help center has launched; `debug: true` says which edition opens.

Set `debug: true` to see what the SDK does, step by step.

## Development

[docs/development.md](docs/development.md): building, testing, the example app, the checks that run
on Windows, and trying it on a phone. [CHANGELOG.md](CHANGELOG.md) lists what changed.

## CI

`.github/workflows/ci.yml` runs on every push to every branch and on every pull request, with no
secrets and nothing to set up on GitHub. Two jobs, on the Node version `.nvmrc` names (24):

- **`check`**: `npm ci`, then `npm run typecheck`, `npm run lint`, `npm test`, and
  `npm run check:pack` — the package built and packed as npm would publish it, and read by publint
  and "are the types wrong".
- **`bundle`**: Metro bundles the example app for Android and for iOS, and `npm run check:bundle`
  reads both: the SDK is in each, with one copy each of react, react-native and the two native
  libraries.

Those are the same commands as [the checks](docs/development.md#the-checks) a developer runs, with
no simulator and no phone. What only a phone can show — the [device checklist](#device-checklist) —
no workflow runs. It publishes nothing: that stays the owner's, by hand. The workflow was checked
command by command on a developer's machine and has not run on GitHub yet
([what that leaves unproved](docs/development.md#ci)).

## Licence and name

- **Licence to be decided.** Until then the package is `"license": "UNLICENSED"` and `"private":
  true`, so nothing can be published by accident. Publishing is the owner's to do, with their own npm
  account.
- **The name is a working name.** `helpkit-react-native`, and the exports `HelpKit` and `HelpKitSDK`,
  mirror helpkit.so's React Native SDK (published as `@helpkit/helpkit-help-center-react-native`),
  so an app moving across keeps its calls. Publishing under "helpkit" names beside helpkit.so's own
  `@helpkit` package is a **trademark question for the owner** to settle before any release.
- Nothing here is copied from helpkit.so's SDK, which is "All rights reserved": this is written from
  HelpKit's own design and the public documentation of React Native, react-native-webview and
  react-native-safe-area-context.
