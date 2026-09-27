// The DevTools check without a browser: the SDK's real injected script
// (its built lib/module/bridge.js) against the help center's real MobileBridge, in jsdom, run by the
// web app's own Vitest. docs/development.md, "The DevTools check", says how to run it.
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileBridge, useMobileBridge } from "@/components/help-mobile/mobile-bridge";
import { MobileProvider } from "@/components/help-mobile/mobile-context";
import { WidgetProvider } from "@/components/help-widget/widget-context";
import { MOBILE_BASE } from "@/lib/help-mobile/paths";
import { MOBILE_STRINGS } from "@/lib/help-mobile/strings";
import { WIDGET_STRINGS } from "@/lib/help-widget/strings";
// @ts-expect-error -- plain JavaScript from the SDK's build
import { injectionScript } from "sdk-bridge";

const pathname = "/_mobile";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(""),
}));

let native: { postMessage: ReturnType<typeof vi.fn<(message: string) => void>> } | undefined;
const sent = () => (native?.postMessage.mock.calls ?? []).map(([m]) => JSON.parse(String(m)));

function Probe() {
  const { prefill } = useMobileBridge();
  return <p data-testid="prefill">{JSON.stringify(prefill)}</p>;
}

function tree() {
  return (
    <WidgetProvider
      value={{ name: "Acme", logoOnWhiteBackground: false, siteUrl: "https://acme.localhost", theme: "light", strings: WIDGET_STRINGS.en, allowedOrigins: [], base: MOBILE_BASE }}
    >
      <MobileProvider value={{ slug: "acme", available: true, signedIn: false, words: MOBILE_STRINGS.en }}>
        <MobileBridge>
          <Probe />
        </MobileBridge>
      </MobileProvider>
    </WidgetProvider>
  );
}

/** Runs a script as injectJavaScript would: in the page, as top-level code. */
function inject(script: string) {
  act(() => {
    new Function(script)();
  });
}

beforeEach(() => {
  window.history.replaceState(null, "", "/_mobile/contact");
  native = { postMessage: vi.fn<(message: string) => void>() };
  window.ReactNativeWebView = native;
  replace.mockClear();
});

afterEach(() => {
  delete window.ReactNativeWebView;
});

describe("the SDK's real script against the page's real MobileBridge", () => {
  it("prefill, hostile values included, reaches the page exactly", () => {
    render(tree());
    const fields = { name: `Zoë "Z" </script> \\ ${String.fromCharCode(0x2028)}`, email: "ada@example.com", metadata: JSON.stringify({ appVersion: "1.0.0" }) };
    inject(injectionScript(window.location.origin, { type: "prefill", fields }));
    expect(JSON.parse(screen.getByTestId("prefill").textContent!)).toEqual(fields);
  });

  it("an empty prefill takes everything back", () => {
    render(tree());
    inject(injectionScript(window.location.origin, { type: "prefill", fields: { name: "Ada" } }));
    inject(injectionScript(window.location.origin, { type: "prefill", fields: {} }));
    expect(JSON.parse(screen.getByTestId("prefill").textContent!)).toEqual({});
  });

  it("up at the first view asks the app to close", () => {
    render(tree());
    native!.postMessage.mockClear();
    inject(injectionScript(window.location.origin, { type: "up" }));
    expect(sent()).toEqual([{ helpkit: 1, type: "close" }]);
  });

  it("a script for another origin does nothing", () => {
    render(tree());
    native!.postMessage.mockClear();
    inject(injectionScript("https://evil.example", { type: "up" }));
    inject(injectionScript("https://evil.example", { type: "prefill", fields: { name: "Mallory" } }));
    expect(sent()).toEqual([]);
    expect(screen.getByTestId("prefill").textContent).toBe("null");
  });

  it("signOut forgets what the app offered", () => {
    render(tree());
    inject(injectionScript(window.location.origin, { type: "prefill", fields: { name: "Ada" } }));
    inject(injectionScript(window.location.origin, { type: "signOut" }));
    expect(screen.getByTestId("prefill").textContent).toBe("null");
  });
});
