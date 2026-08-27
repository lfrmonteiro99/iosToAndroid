import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  PermissionsAndroid,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';

import { useApps } from '../store/AppsStore';
import { useContacts, Contact } from '../store/ContactsStore';
import { useTheme } from '../theme/ThemeContext';
import { parseCommand } from '../assistant/commandParser';
import { speak, stopSpeaking } from '../assistant/speech';
import { assistantLocale, deviceLanguageTag } from '../assistant/locale';
import { assistantStrings } from '../assistant/replies';
import { builtInLabelForSpokenName, builtInRouteForSpokenName } from '../assistant/builtInAppNames';
import type { AppNavigationProp } from '../navigation/types';
import { logger } from '../utils/logger';
import { createQuickAlarm } from '../utils/alarmScheduling';
import { useAlert, SiriWaveform } from '../components';
import { withAutoLockSuppressed } from '../utils/permissions';


// Built-in apps are virtual screens of this app, not real Android packages:
// their `packageName` (com.iostoandroid.*) is absent from the PackageManager
// list the assistant searches (`apps`), and getLaunchIntentForPackage returns
// null for them. Routing them through the native launcher would drop back to
// the Android home screen (#697 class of bug). The home grid and the Control
// Center already open them via navigation; the assistant must do the same.
//
// Which name resolves to which screen lives in assistant/builtInAppNames.ts:
// this screen used to invert the ROUTE table, and a route name is not what the
// user says — "Safari", "Find My" and "App Store" all failed while "Browser"
// worked, and no Portuguese name resolved at all.

/** Format a Date the way the assistant speaks a clock time ("2:05 PM"). */
export function formatAssistantTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function fullName(c: Contact): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

/**
 * Match a spoken contact name against first name, last name or the full name.
 * Case-insensitive substring so "call anderson" and "call alice a" both land.
 */
function findContact(contacts: Contact[], query: string): Contact | undefined {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return undefined;
  return contacts.find((c) => {
    const first = c.firstName.toLowerCase();
    const last = c.lastName.toLowerCase();
    const full = fullName(c).toLowerCase();
    return first === q || last === q || full === q ||
      first.includes(q) || last.includes(q) || full.includes(q);
  });
}

// Loaded defensively via dynamic import so tests without the native module
// still render, matching the pattern in AppsStore.
async function getLauncherModuleExports(): Promise<
  typeof import('../../modules/launcher-module/src') | null
> {
  try {
    return await import('../../modules/launcher-module/src');
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro supports require
      return require('../../modules/launcher-module/src');
    } catch {
      return null;
    }
  }
}

interface SiriScreenProps {
  navigation: AppNavigationProp;
}

export function SiriScreen({ navigation }: SiriScreenProps) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { apps, launchApp } = useApps();
  const { contacts } = useContacts();
  const alert = useAlert();

  // The assistant listens, parses and answers in ONE language — the phone's.
  // Resolved once per mount: a locale change restarts the app anyway, and
  // re-reading it per render would rebuild every callback below.
  const languageTag = useMemo(() => deviceLanguageTag(), []);
  const strings = useMemo(() => assistantStrings(assistantLocale(languageTag)), [languageTag]);

  const [text, setText] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  // Availability is per-device — cached once, then used to disable the mic if
  // the platform has no on-device recognizer (e.g. non-Android emulators).
  const [voiceAvailable, setVoiceAvailable] = useState<boolean | null>(null);
  const inputRef = useRef<TextInput>(null);

  const findApp = useCallback(
    (name: string) => {
      const q = name.trim().toLowerCase();
      if (q.length === 0) return undefined;
      return apps.find((a) => a.name.toLowerCase() === q)
        ?? apps.find((a) => a.name.toLowerCase().includes(q));
    },
    [apps],
  );

  const runCommand = useCallback((input: string) => {
    if (input.trim().length === 0) return;
    const command = parseCommand(input);
    let reply: string;

    switch (command.type) {
      case 'OPEN_APP': {
        // Built-in apps (Calculator, Notes, Weather, …) are virtual screens of
        // this app, not real Android packages — route them through the in-app
        // navigator so they open internally instead of falling back to the
        // Android home screen (issue #700; same class of bug as #697).
        const spoken = command.appName.trim();
        const builtInRoute = builtInRouteForSpokenName(spoken);
        if (builtInRoute) {
          // The label, not what was said: "A abrir Safari" reads back the app
          // the user will see, and confirms the assistant understood which one.
          reply = strings.opening(builtInLabelForSpokenName(spoken) ?? spoken);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- built-in routes all have undefined params; navigate overloads require params spec
          navigation.navigate(builtInRoute as any);
          break;
        }
        const app = findApp(command.appName);
        if (!app) {
          reply = strings.appNotFound(command.appName);
          break;
        }
        reply = strings.opening(app.name);
        // The optimistic "Opening …" is already on screen, so both failure
        // shapes have to correct it through setResponse: `reply` is long out
        // of scope by the time this settles. A failed native launch resolves
        // `false` (dispatchLaunchApp swallows the error and reports it via the
        // store's alert) — only an unexpected throw reaches `.catch`, so
        // checking just one of the two would leave the assistant claiming it
        // opened an app it never opened.
        launchApp(app.packageName)
          .then((ok) => {
            if (!ok) setResponse(strings.openFailed(app.name));
          })
          .catch((e) => {
            logger.warn('SiriScreen', 'launchApp failed', e);
            setResponse(strings.openFailed(app.name));
          });
        break;
      }
      case 'CALL_CONTACT': {
        const contact = findContact(contacts, command.contactName);
        if (!contact) {
          reply = strings.contactNotFound(command.contactName);
          break;
        }
        reply = strings.calling(fullName(contact) || contact.phone);
        navigation.navigate('CallScreen', { name: fullName(contact), number: contact.phone });
        break;
      }
      case 'SEND_MESSAGE': {
        const contact = findContact(contacts, command.contactName);
        if (!contact) {
          reply = strings.contactNotFound(command.contactName);
          break;
        }
        reply = strings.messaging(fullName(contact) || contact.phone);
        navigation.navigate('Conversation', { address: contact.phone });
        break;
      }
      case 'WHAT_TIME':
        setResponse(strings.timeIs(formatAssistantTime(new Date())));
        return;
      case 'SET_ALARM': {
        const when = new Date();
        when.setHours(command.hour, command.minute, 0, 0);
        // Fire-and-catch like launchApp: persistence must not block the handler,
        // and the confirmation only claims success once the alarm is stored.
        createQuickAlarm(command.hour, command.minute)
          .then(() => {
            setResponse(strings.alarmSet(formatAssistantTime(when)));
          })
          .catch((e) => {
            logger.warn('SiriScreen', 'createQuickAlarm failed', e);
            setResponse(strings.alarmFailed);
          });
        return;
      }
      case 'UNRECOGNIZED':
      default:
        // Names what the assistant CAN do, in the phone's language: the old
        // "That's not supported yet." was the reply almost every spoken
        // request got, and it told the user nothing they could act on.
        reply = strings.notSupported;
        break;
    }

    // Every synchronous branch above lands here. The `speak` effect is bound to
    // `response`, so setting it is what both shows and says the answer — the
    // WHAT_TIME / SET_ALARM branches return early because they set it themselves.
    setResponse(reply);
  }, [findApp, contacts, launchApp, navigation, strings]);

  const handleSubmit = useCallback(() => {
    const input = text;
    setText('');
    runCommand(input);
  }, [text, runCommand]);

  // ── Voice recognition ──────────────────────────────────────────────────
  // Query availability once so the mic can be disabled when the platform
  // has no on-device recognizer.
  useEffect(() => {
    let cancelled = false;
    getLauncherModuleExports().then((mod) => {
      if (cancelled) return;
      if (!mod?.default) { setVoiceAvailable(false); return; }
      mod.default.isSpeechRecognitionAvailable()
        .then((ok) => { if (!cancelled) setVoiceAvailable(!!ok); })
        .catch(() => { if (!cancelled) setVoiceAvailable(false); });
    });
    return () => { cancelled = true; };
  }, []);

  // Subscribe to speech events while listening. Final result runs the same
  // command pipeline as typed input; partial results stream into the field so
  // the user sees their words appear.
  useEffect(() => {
    if (!listening) return;
    let unsubResult: (() => void) | undefined;
    let unsubPartial: (() => void) | undefined;
    let unsubError: (() => void) | undefined;
    let cancelled = false;

    getLauncherModuleExports().then((mod) => {
      if (cancelled || !mod) return;
      unsubPartial = mod.addSpeechPartialResultListener?.((partial) => {
        setText(partial);
      });
      unsubResult = mod.addSpeechResultListener?.((final) => {
        setText('');
        setListening(false);
        runCommand(final);
      });
      unsubError = mod.addSpeechErrorListener?.((err) => {
        setListening(false);
        setResponse(strings.didNotHear(err));
      });
    });

    return () => {
      cancelled = true;
      unsubResult?.();
      unsubPartial?.();
      unsubError?.();
    };
  }, [listening, runCommand, strings]);

  const stopListening = useCallback(async () => {
    setListening(false);
    const mod = await getLauncherModuleExports();
    await mod?.default?.stopSpeechRecognition().catch(() => {});
  }, []);

  const startListening = useCallback(async () => {
    if (voiceAvailable === false) {
      alert(strings.voiceUnavailableTitle, strings.voiceUnavailableBody);
      return;
    }

    // Ask for the microphone up front — the native recognizer will otherwise
    // just fire onError with an opaque code the user can't act on.
    if (Platform.OS === 'android') {
      try {
        const already = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        if (!already) {
          const result = await withAutoLockSuppressed(() => PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: 'Listen to Voice Commands',
              message: 'Allow the assistant to use the microphone for voice input?',
              buttonPositive: 'Allow',
              buttonNegative: 'Deny',
            },
          ));
          if (result !== PermissionsAndroid.RESULTS.GRANTED) {
            alert(
              strings.micNeededTitle,
              result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
                ? strings.micBlockedBody
                : strings.micDeniedBody,
              [
                ...(result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
                  ? [{ text: strings.openSettings, onPress: () => { Linking.openSettings().catch(() => {}); } }]
                  : []),
                { text: strings.ok },
              ],
            );
            return;
          }
        }
      } catch (e) {
        logger.warn('SiriScreen', 'RECORD_AUDIO check failed', e);
      }
    }

    setText('');
    setResponse(strings.listening);
    setListening(true);

    const mod = await getLauncherModuleExports();
    // Same tag the parser and the voice use, so the transcription cannot
    // arrive in a language the parser does not know.
    const started = await mod?.default?.startSpeechRecognition(languageTag).catch(() => false);
    if (!started) {
      // Native side already emitted an error; but if the module was missing
      // entirely, clear the listening state so the mic is tappable again.
      setListening(false);
      setResponse(strings.voiceUnavailableNow);
    }
  }, [voiceAvailable, alert, strings, languageTag]);

  const toggleListening = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  }, [listening, stopListening, startListening]);

  // Stop the recognizer if the screen unmounts mid-listen (back button, tab
  // switch) so the mic doesn't stay held.
  useEffect(() => () => {
    getLauncherModuleExports().then((mod) => {
      mod?.default?.stopSpeechRecognition().catch(() => {});
    });
  }, []);

  // Speak every response once it is set. Bound to `[response]` rather than
  // calling the speech inline in the switch so the async `launchApp` failure
  // path (which sets a second response inside `.catch`) is also covered, and
  // so the same text submitted twice doesn't double-speak. The `response`
  // guard skips the initial `null` (the greeting shows via `GREETING`).
  useEffect(() => {
    if (response) speak(response, languageTag);
  }, [response, languageTag]);

  useEffect(() => () => stopSpeaking(), []);

  const styles = useMemo(() => createStyles(), []);
  const micDisabled = voiceAvailable === false;
  const micColor = listening
    ? colors.systemRed
    : micDisabled
      ? colors.tertiaryLabel
      : colors.systemBlue;

  const displayText = listening ? (partial || strings.listening) : (response ?? strings.greeting);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemBackground }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={26} color={colors.systemBlue} />
          <Text style={[typography.body, { color: colors.systemBlue }]}>{strings.back}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.responseArea}
        contentContainerStyle={styles.responseContent}
        keyboardShouldPersistTaps="handled"
      >
        {listening ? (
          <ActivityIndicator
            size="large"
            color={colors.systemBlue}
            style={styles.listeningIndicator}
            accessibilityLabel="Listening"
          />
        ) : null}
        <Text
          style={[typography.title3, styles.responseText, { color: colors.label }]}
          accessibilityLabel="Siri response"
        >
          {displayText}
        </Text>
      </ScrollView>

      {/* Bars sit above the input row so their motion reads as the mic
          state, not decoration on the text field. */}
      <View style={styles.waveformRow} pointerEvents="none">
        <SiriWaveform listening={listening} />
      </View>

      <View
        style={[
          styles.inputRow,
          {
            borderTopColor: colors.separator,
            backgroundColor: colors.secondarySystemBackground,
            paddingBottom: insets.bottom + 8,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          style={[typography.body, styles.input, { color: colors.label, backgroundColor: colors.systemBackground }]}
          placeholder={strings.inputPlaceholder}
          placeholderTextColor={colors.systemGray}
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
          accessibilityLabel="Ask Siri"
          autoFocus
          blurOnSubmit={false}
          editable={!listening}
        />
        <Pressable
          onPress={toggleListening}
          disabled={micDisabled}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Stop listening' : 'Start voice input'}
          accessibilityState={{ disabled: micDisabled, selected: listening }}
          style={({ pressed }) => [
            styles.micButton,
            { opacity: pressed && !micDisabled ? 0.6 : 1 },
          ]}
        >
          <Ionicons name={listening ? 'stop-circle' : 'mic'} size={28} color={micColor} />
        </Pressable>
      </View>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 8, paddingBottom: 8 },
    backButton: { flexDirection: 'row', alignItems: 'center' },
    responseArea: { flex: 1 },
    responseContent: { padding: 24, flexGrow: 1, justifyContent: 'center' },
    responseText: { textAlign: 'center' },
    listeningIndicator: { marginBottom: 16 },
    waveformRow: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 8,
    },
    input: {
      flex: 1,
      minHeight: 40,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    micButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
