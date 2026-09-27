# The page ↔ app protocol

The SDK talks to the help center's `/_mobile` pages by **protocol 1**. The contract has one written
copy, kept with the pages it governs:

**`helpkit-web/docs/mobile.md`, section "The protocol (version 1)"** — both directions, their limits,
what each side may and may not do for the other, and why a pre-fill is allowed here but not in the
web widget.

This file only says where the SDK keeps its side, so the two can't drift into two versions of the
truth.

| | |
| --- | --- |
| The app's side | `src/bridge.ts`: reads the page's messages, and builds the one injected script |
| Where it is used | `src/sheet.ts`: when a message is believed, when anything is sent, in what order |
| The executable copy | `src/__tests__/bridge.test.ts`: the documented script, character for character, run in a separate JavaScript context with hostile values; and `src/__tests__/HelpKit.test.tsx` for the order |
| Against the real page | `scripts/web-cross-check/` runs the built script against the page's own `MobileBridge` with the web app's tests ([development](development.md#the-devtools-check)); `scripts/print-injection.mjs` prints it to paste into a browser |

Two further versions sit beside the protocol, each independent of it:

- **the resolver's answer**, `v: 1` (`GET <host>/api/mobile-apps/<App ID>`, `src/resolve.ts`);
- **the package's own version** (`package.json`, and `HelpKitRN/<version>` in the WebView's user agent).

Unknown message types and keys are ignored on both sides, so either side can add one without
breaking the other. From the first published release, anything that can't be added that way becomes
`helpkit: 2` (or `v: 2`), served beside version 1, never instead of it: app binaries live for years.
