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
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../theme/ThemeContext';
import { useDevice, DeviceSms, DeviceContact } from '../store/DeviceStore';
import { CupertinoTextField } from '../components';

// ─── Native module helper ─────────────────────────────────────────────────────

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    return null;
  }
};

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
    ? colors.systemGreen
    : isDark
    ? '#38383A'
    : colors.systemGray5;

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
          {
            backgroundColor: bubbleBackground,
            maxWidth: BUBBLE_MAX_WIDTH,
            elevation: isSent ? 1 : 0,
            ...(isSent && Platform.OS === 'ios' ? {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1,
              shadowRadius: 2,
            } : {}),
          },
          isSent ? styles.bubbleSent : styles.bubbleReceived,
        ]}
      >
        <Text style={[typography.callout, { color: textColor }]}>
          {message.body}
        </Text>
        {isSent ? (
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              right: -6,
              width: 0,
              height: 0,
              borderLeftWidth: 8,
              borderLeftColor: colors.systemGreen,
              borderTopWidth: 8,
              borderTopColor: 'transparent',
              borderBottomWidth: 0,
            }}
          />
        ) : (
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: -6,
              width: 0,
              height: 0,
              borderRightWidth: 8,
              borderRightColor: bubbleBackground,
              borderTopWidth: 8,
              borderTopColor: 'transparent',
            }}
          />
        )}
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
  const [isSending, setIsSending] = useState(false);
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

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isSending) return;
    const mod = await getLauncher();
    if (mod) {
      setIsSending(true);
      try {
        const success = await mod.sendSms(address, text);
        if (success) {
          setInputText('');
          await device.refresh();
          // FlatList is inverted — index 0 is the newest message
          listRef.current?.scrollToIndex({ index: 0, animated: true });
        } else {
          Alert.alert('Failed', 'Could not send message. Check permissions and try again.');
        }
      } catch {
        Alert.alert('Failed', 'Could not send message. Check permissions and try again.');
      } finally {
        setIsSending(false);
      }
    }
  }, [inputText, isSending, address, device]);

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
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/* Nav Bar */}
      <BlurView
        intensity={80}
        tint={dark ? 'dark' : 'light'}
        experimentalBlurMethod="dimezisBlurView"
        style={[
          styles.navBar,
          {
            paddingTop: insets.top,
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
      </BlurView>

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
        <Pressable
          onPress={() => {}}
          hitSlop={8}
          style={styles.plusButton}
          accessibilityRole="button"
          accessibilityLabel="Add attachment"
        >
          <Ionicons name="add-circle" size={32} color={colors.systemBlue} />
        </Pressable>
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
          disabled={isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={colors.systemBlue} />
          ) : (
            <Ionicons
              name="send"
              size={24}
              color={inputText.trim() ? colors.systemBlue : colors.systemGray3}
            />
          )}
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
  plusButton: {
    paddingBottom: 6,
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
