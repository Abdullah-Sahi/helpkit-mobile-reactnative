import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { HelpKit, HelpKitSDK } from 'helpkit-react-native';

/**
 * One screen with a button for each call. Its App ID and HelpKit's address come from .env.local
 * (see .env.example): both public values, never secrets.
 */

const APP_ID = process.env.EXPO_PUBLIC_HELPKIT_APP_ID ?? '';
const HOST = process.env.EXPO_PUBLIC_HELPKIT_HOST ?? '';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Calls />
      {/* Once, at the root, and last: on Android the sheet is drawn over everything before it. */}
      <HelpKit projectId={APP_ID} config={{ host: HOST, debug: __DEV__ }} />
    </SafeAreaProvider>
  );
}

function Calls() {
  const dark = useColorScheme() === 'dark';
  const [article, setArticle] = useState('');
  const [collection, setCollection] = useState('');
  const [query, setQuery] = useState('refund');
  const [log, setLog] = useState<string[]>([]);

  const call = (label: string, run: () => void) => () => {
    run();
    setLog((lines) => [`${new Date().toLocaleTimeString()}  ${label}`, ...lines].slice(0, 12));
  };

  const colors = dark ? { bg: '#0C0A09', fg: '#FAFAF9', field: '#1C1917' } : { bg: '#FFFFFF', fg: '#1C1917', field: '#F5F5F4' };
  const field = [styles.field, { backgroundColor: colors.field, color: colors.fg }];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.fg }]}>helpkit-react-native</Text>
        <Text style={[styles.note, { color: colors.fg }]}>
          {APP_ID ? `App ID ${APP_ID}` : 'No App ID: copy .env.example to .env.local and fill it in.'}
          {'\n'}
          {HOST ? `Host ${HOST}` : 'No host.'}
        </Text>

        <Button label="open()" onPress={call('open()', () => HelpKitSDK.open())} />

        <TextInput style={field} value={article} onChangeText={setArticle} placeholder="an article's slug" autoCapitalize="none" />
        <Button label="openArticle(slug)" onPress={call(`openArticle("${article}")`, () => HelpKitSDK.openArticle(article))} />

        <TextInput style={field} value={collection} onChangeText={setCollection} placeholder="a collection's slug" autoCapitalize="none" />
        <Button label="openCategory(slug)" onPress={call(`openCategory("${collection}")`, () => HelpKitSDK.openCategory(collection))} />

        <TextInput style={field} value={query} onChangeText={setQuery} placeholder="words to search for" />
        <Button label="openSearch(words)" onPress={call(`openSearch("${query}")`, () => HelpKitSDK.openSearch(query))} />

        <Button label="openContact()" onPress={call('openContact()', () => HelpKitSDK.openContact())} />

        <Button
          label="setContactFields(sample)"
          onPress={call('setContactFields(sample)', () =>
            HelpKitSDK.setContactFields({
              name: 'Ada Lovelace',
              email: 'ada@example.com',
              subject: 'Help from the example app',
              // Shown to the reader ("Sent with your message") and to the team, marked unverified.
              metadata: { appVersion: '1.0.0', platform: Platform.OS, osVersion: String(Platform.Version) },
            }),
          )}
        />
        <Button label="setContactFields(null)" onPress={call('setContactFields(null)', () => HelpKitSDK.setContactFields(null))} />
        <Button label="signOut()" onPress={call('signOut()', () => HelpKitSDK.signOut())} />
        <Button
          label="close() in 3 seconds"
          onPress={call('close() in 3 seconds', () => {
            setTimeout(() => HelpKitSDK.close(), 3000);
          })}
        />

        <Text style={[styles.heading, { color: colors.fg }]}>Calls made</Text>
        {log.map((line, index) => (
          <Text key={`${index}-${line}`} style={[styles.log, { color: colors.fg }]}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 10 },
  title: { fontSize: 22, fontWeight: '700' },
  note: { fontSize: 13, opacity: 0.7, marginBottom: 8 },
  heading: { fontSize: 15, fontWeight: '600', marginTop: 16 },
  field: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  button: { backgroundColor: '#0F766E', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, minHeight: 44 },
  pressed: { opacity: 0.7 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  log: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', opacity: 0.8 },
});
