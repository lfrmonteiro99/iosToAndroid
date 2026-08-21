import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
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

const GREETING = 'What can I help you with?';
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

interface SiriScreenProps {
  navigation: AppNavigationProp;
}

export function SiriScreen({ navigation }: SiriScreenProps) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { apps, launchApp } = useApps();
  const { contacts } = useContacts();

  const [text, setText] = useState('');
  const [response, setResponse] = useState<string | null>(null);
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

  const handleSubmit = useCallback(() => {
    const input = text;
    if (input.trim().length === 0) return;
    setText('');

    const command = parseCommand(input);

    switch (command.type) {
      case 'OPEN_APP': {
        const app = findApp(command.appName);
        if (!app) {
          setResponse(`Couldn't find an app called "${command.appName}".`);
          return;
        }
        setResponse(`Opening ${app.name}.`);
        // launchApp is a no-op off Android and can reject if the package
        // vanished between the scan and the tap; surface it instead of
        // letting an unhandled rejection escape the handler.
        launchApp(app.packageName).catch((e) => {
          logger.warn('SiriScreen', 'launchApp failed', e);
          setResponse(`Couldn't open ${app.name}.`);
        });
        return;
      }
      case 'CALL_CONTACT': {
        const contact = findContact(contacts, command.contactName);
        if (!contact) {
          setResponse(`Couldn't find a contact called "${command.contactName}".`);
          return;
        }
        setResponse(`Calling ${fullName(contact) || contact.phone}.`);
        navigation.navigate('CallScreen', { name: fullName(contact), number: contact.phone });
        return;
      }
      case 'SEND_MESSAGE': {
        const contact = findContact(contacts, command.contactName);
        if (!contact) {
          setResponse(`Couldn't find a contact called "${command.contactName}".`);
          return;
        }
        setResponse(`Messaging ${fullName(contact) || contact.phone}.`);
        navigation.navigate('Conversation', { address: contact.phone });
        return;
      }
      case 'WHAT_TIME':
        setResponse(`It's ${formatAssistantTime(new Date())}`);
        return;
      case 'SET_ALARM':
        setResponse(`Setting alarms ${NOT_SUPPORTED.replace("That's ", '')}`);
        return;
      case 'UNRECOGNIZED':
      default:
        setResponse(NOT_SUPPORTED);
        return;
    }
  }, [text, findApp, contacts, launchApp, navigation]);

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
        <Text
          style={[typography.title3, styles.responseText, { color: colors.label }]}
          accessibilityLabel="Siri response"
        >
          {response ?? GREETING}
        </Text>
      </ScrollView>

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
        />
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
    inputRow: {
      paddingHorizontal: 12,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    input: {
      minHeight: 40,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
  });
}
