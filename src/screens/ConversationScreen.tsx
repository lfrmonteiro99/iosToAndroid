import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useDevice, DeviceSms, DeviceContact } from '../store/DeviceStore';
import { CupertinoTextField } from '../components';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findContactByPhone(phone: string, contacts: DeviceContact[]): DeviceContact | undefined {
  const digits = phone.replace(/\D/g, '').slice(-10);
  return contacts.find((c) => c.phone.replace(/\D/g, '').slice(-10) === digits);
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
const BUBBLE_MAX_WIDTH = SCREEN_WIDTH * 0.75;

interface BubbleProps {
  message: DeviceSms;
  isDark: boolean;
  colors: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  typography: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const MessageBubble = React.memo(function MessageBubble({
  message,
  isDark,
  colors,
  typography,
}: BubbleProps) {
  const isSent = message.type === 2;

  const bubbleBackground = isSent
    ? '#007AFF'
    : isDark
    ? '#38383A'
    : '#E5E5EA';

  const textColor = isSent ? '#FFFFFF' : colors.label;

  return (
    <View
      style={[
        styles.bubbleRow,
        isSent ? styles.bubbleRowRight : styles.bubbleRowLeft,
      ]}
    >
      <View
        style={[
          styles.bubble,
          { backgroundColor: bubbleBackground, maxWidth: BUBBLE_MAX_WIDTH },
          isSent ? styles.bubbleSent : styles.bubbleReceived,
        ]}
      >
        <Text style={[typography.callout, { color: textColor }]}>
          {message.body}
        </Text>
      </View>
      <Text
        style={[
          typography.caption2,
          styles.bubbleTime,
          { color: colors.secondaryLabel },
          isSent ? styles.bubbleTimeRight : styles.bubbleTimeLeft,
        ]}
      >
        {message.dateFormatted}
      </Text>
    </View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function ConversationScreen({ navigation, route }: { navigation: any; route: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { address } = route.params as { address: string };

  const { theme, typography, spacing } = useTheme();
  const { colors, dark } = theme;
  const insets = useSafeAreaInsets();
  const device = useDevice();

  const [inputText, setInputText] = useState('');
  const listRef = useRef<FlatList>(null);

  // Match contact
  const contact = useMemo(
    () => findContactByPhone(address, device.contacts),
    [address, device.contacts],
  );

  const displayName = contact
    ? `${contact.firstName} ${contact.lastName}`.trim()
    : address;

  // Filter messages for this address
  const messages = useMemo(() => {
    return device.messages
      .filter((m) => m.address === address)
      .sort((a, b) => {
        const aTime = (a as DeviceSms & { date?: number }).date ?? 0;
        const bTime = (b as DeviceSms & { date?: number }).date ?? 0;
        // For inverted FlatList we want descending order (newest first = top of inverted)
        return bTime - aTime;
      });
  }, [device.messages, address]);

  const handleCall = useCallback(() => {
    Linking.openURL(`tel:${address}`);
  }, [address]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    Linking.openURL(`sms:${address}?body=${encodeURIComponent(text)}`);
    setInputText('');
  }, [inputText, address]);

  const renderItem = useCallback(
    ({ item }: { item: DeviceSms }) => (
      <MessageBubble
        message={item}
        isDark={dark}
        colors={colors}
        typography={typography}
      />
    ),
    [dark, colors, typography],
  );

  const keyExtractor = useCallback((item: DeviceSms) => item.id, []);

  const ListEmpty = (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubbles-outline" size={56} color={colors.systemGray3} />
      <Text
        style={[
          typography.body,
          { color: colors.secondaryLabel, marginTop: spacing.md, textAlign: 'center' },
        ]}
      >
        No messages with this contact
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.systemBackground }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Nav Bar */}
      <View
        style={[
          styles.navBar,
          {
            paddingTop: insets.top,
            backgroundColor: colors.systemBackground,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <View style={styles.navBarContent}>
          {/* Back button */}
          <Pressable
            style={styles.navBackButton}
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back to Messages"
          >
            <Ionicons name="chevron-back" size={22} color={colors.systemBlue} />
            <Text style={[typography.callout, { color: colors.systemBlue }]}>Messages</Text>
          </Pressable>

          {/* Title */}
          <Text
            style={[typography.headline, styles.navTitle, { color: colors.label }]}
            numberOfLines={1}
          >
            {displayName}
          </Text>

          {/* Call button */}
          <View style={styles.navActionSlot}>
            <Pressable
              onPress={handleCall}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Call ${displayName}`}
            >
              <Ionicons name="call-outline" size={22} color={colors.systemBlue} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Message List */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        inverted={messages.length > 0}
        ListEmptyComponent={ListEmpty}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          messages.length === 0
            ? styles.emptyList
            : styles.listContent
        }
      />

      {/* Input Area */}
      <View
        style={[
          styles.inputArea,
          {
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.separator,
            backgroundColor: colors.systemBackground,
            paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
          },
        ]}
      >
        <CupertinoTextField
          value={inputText}
          onChangeText={setInputText}
          placeholder="Message"
          multiline
          clearButton={false}
          containerStyle={styles.textFieldContainer}
          returnKeyType="default"
        />
        <Pressable
          onPress={handleSend}
          hitSlop={8}
          style={styles.sendButton}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Ionicons
            name="send"
            size={24}
            color={inputText.trim() ? colors.systemBlue : colors.systemGray3}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navBar: {
    zIndex: 10,
  },
  navBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 8,
  },
  navBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 90,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
  },
  navActionSlot: {
    minWidth: 90,
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleRow: {
    marginVertical: 2,
  },
  bubbleRowLeft: {
    alignItems: 'flex-start',
  },
  bubbleRowRight: {
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bubbleSent: {
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    borderBottomLeftRadius: 4,
  },
  bubbleTime: {
    marginTop: 2,
    marginHorizontal: 4,
  },
  bubbleTimeLeft: {
    alignSelf: 'flex-start',
  },
  bubbleTimeRight: {
    alignSelf: 'flex-end',
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  textFieldContainer: {
    flex: 1,
  },
  sendButton: {
    paddingBottom: 10,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyList: {
    flex: 1,
  },
});
