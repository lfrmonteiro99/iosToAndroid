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
import { useApps } from '../store/AppsStore';
import { useContacts, Contact } from '../store/ContactsStore';
import { useTheme } from '../theme/ThemeContext';
import { parseCommand } from '../assistant/commandParser';
import { speak, stopSpeaking } from '../assistant/speech';
import type { AppNavigationProp } from '../navigation/types';
import { logger } from '../utils/logger';
import { createQuickAlarm } from '../utils/alarmScheduling';
import { useAlert, SiriWaveform } from '../components';
import { withAutoLockSuppressed } from '../utils/permissions';

const GREETING = 'What can I help you with?';
const LISTENING = 'Listening…';
const NOT_SUPPORTED = "That's not supported yet.";

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

  const [text, setText] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
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
        const app = findApp(command.appName);
        if (!app) {
          reply = `Couldn't find an app called "${command.appName}".`;
          break;
        }
        reply = `Opening ${app.name}.`;
        launchApp(app.packageName).catch((e) => {
          logger.warn('SiriScreen', 'launchApp failed', e);
          reply = `Couldn't open ${app.name}.`;
        });
        break;
      }
      case 'CALL_CONTACT': {
        const contact = findContact(contacts, command.contactName);
        if (!contact) {
          reply = `Couldn't find a contact called "${command.contactName}".`;
          break;
        }
        reply = `Calling ${fullName(contact) || contact.phone}.`;
        navigation.navigate('CallScreen', { name: fullName(contact), number: contact.phone });
        break;
      }
      case 'SEND_MESSAGE': {
        const contact = findContact(contacts, command.contactName);
        if (!contact) {
          reply = `Couldn't find a contact called "${command.contactName}".`;
          break;
        }
        reply = `Messaging ${fullName(contact) || contact.phone}.`;
        navigation.navigate('Conversation', { address: contact.phone });
        break;
      }
      case 'WHAT_TIME':
        setResponse(`It's ${formatAssistantTime(new Date())}`);
        return;
      case 'SET_ALARM': {
        const when = new Date();
        when.setHours(command.hour, command.minute, 0, 0);
        // Fire-and-catch like launchApp: persistence must not block the handler,
        // and the confirmation only claims success once the alarm is stored.
        createQuickAlarm(command.hour, command.minute)
          .then(() => {
            setResponse(`Alarm set for ${formatAssistantTime(when)}`);
          })
          .catch((e) => {
            logger.warn('SiriScreen', 'createQuickAlarm failed', e);
            setResponse("Couldn't set that alarm.");
          });
        return;
      }
      case 'UNRECOGNIZED':
      default:
        reply = NOT_SUPPORTED;
        break;
    }

    // For the non-early-return cases (OPEN_APP / CALL / SEND / UNRECOGNIZED)
    // the reply is set in the switch above; surface it. Speaking is owned by
    // the `[response]` effect below so async failure paths (launchApp .catch)
    // and identical consecutive responses are also covered exactly once.
    setResponse(reply);
  }, [findApp, contacts, launchApp, navigation]);

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
        setResponse(`Couldn't hear you (${err}).`);
      });
    });

    return () => {
      cancelled = true;
      unsubResult?.();
      unsubPartial?.();
      unsubError?.();
    };
  }, [listening, runCommand]);

  const stopListening = useCallback(async () => {
    setListening(false);
    const mod = await getLauncherModuleExports();
    await mod?.default?.stopSpeechRecognition().catch(() => {});
  }, []);

  const startListening = useCallback(async () => {
    if (voiceAvailable === false) {
      alert('Voice Not Available', 'Speech recognition is not available on this device.');
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
              'Microphone Needed',
              result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
                ? 'Microphone access is disabled. Enable it in system settings to talk to the assistant.'
                : 'Microphone access was denied. Voice commands need it to work.',
              [
                ...(result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
                  ? [{ text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } }]
                  : []),
                { text: 'OK' },
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
    setResponse(LISTENING);
    setListening(true);

    const mod = await getLauncherModuleExports();
    const started = await mod?.default?.startSpeechRecognition().catch(() => false);
    if (!started) {
      // Native side already emitted an error; but if the module was missing
      // entirely, clear the listening state so the mic is tappable again.
      setListening(false);
      setResponse('Voice input is unavailable right now.');
    }
  }, [voiceAvailable, alert]);

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
    if (response) speak(response);
  }, [response]);

  useEffect(() => () => stopSpeaking(), []);

  const styles = useMemo(() => createStyles(), []);
  const micDisabled = voiceAvailable === false;
  const micColor = listening
    ? colors.systemRed
    : micDisabled
      ? colors.tertiaryLabel
      : colors.systemBlue;

  const displayText = listening ? LISTENING : (response ?? GREETING);

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
          <Text style={[typography.body, { color: colors.systemBlue }]}>Back</Text>
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
          placeholder="Type a request"
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
