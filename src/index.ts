/**
 * helpkit-react-native: your HelpKit help center in a native sheet inside your React Native app.
 *
 *     <HelpKit projectId="…" config={{ host: "https://…" }} />   // once, at the root
 *     HelpKitSDK.openArticle("reset-your-password");            // from anywhere
 *
 * README.md says how to use it; docs/protocol.md points at the contract with the help center's pages.
 */
export { HelpKit } from './HelpKit';
export { HelpKitSDK } from './sdk';
export type { ContactFields, HelpKitConfig, HelpKitOpenOptions, HelpKitProps, HelpKitStrings } from './types';
