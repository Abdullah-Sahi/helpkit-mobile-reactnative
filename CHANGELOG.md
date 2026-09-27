# Changelog

All notable changes to this package are written down here, in the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. It follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), and stays at 0.x until it has been used on
real phones.

## [Unreleased]

## [0.1.0] - not yet released

The first version: private, and not published.

### Added

- `<HelpKit projectId config />`, mounted once at the app's root, and `HelpKitSDK` with `open`,
  `openArticle`, `openCategory`, `openSearch`, `openContact`, `setContactFields`, `setVersion`
  (kept, does nothing yet), `signOut`, `close` and `isOpen` — names that mirror helpkit.so's SDK.
- The help center found by its App ID on HelpKit's own `host`, asked afresh at each opening, and
  shown from its HelpKit subdomain's `/_mobile` pages only.
- iOS: a page sheet. Android: a view over the app in its own window, with Android's back button and
  room made for the keyboard (README: "How the sheet is presented").
- A native header with a centred title, a Back that goes back one view, and a Close that always
  works; labelled for screen readers; colours that match the page in light and dark; the status
  bar's icons on Android; safe areas.
- Contact fields and metadata offered to the page's contact form, in memory only; a sign-out for the
  app's own logout, held until the next opening when the sheet is closed.
- Links out opened by `Linking` or the app's `onOpenLink`; every page that loads checked again, and
  anything but the help center's app pages taken away.
- "Help isn't available right now" and "Couldn't load help", each with Try again; a 15-second limit
  on loading; a WebView that stops is loaded again once.
- WebView debugging in development builds only.
- Protocol 1 with the help center's pages (docs/protocol.md), and the resolver's answer version 1.
- Jest tests with a mocked WebView, an Expo SDK 57 example app, and scripts for the checks that run
  without a phone.

[Unreleased]: #unreleased
[0.1.0]: #010---not-yet-released
