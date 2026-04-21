import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Linking,
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
  Dimensions,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { withAutoLockSuppressed } from '../utils/permissions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { useDevice, DeviceSms } from '../store/DeviceStore';
import { CupertinoTextField, useAlert } from '../components';
import { findContactByPhone } from '../utils/contacts';
import type { AppNavigationProp, AppRouteProp } from '../navigation/types';
import type { CupertinoColors } from '../theme/CupertinoTheme';
import { Typography } from '../theme/CupertinoTheme';

// ─── Local message type extension ────────────────────────────────────────────

interface LocalImageMessage {
  id: string;
  address: string;
  body: string;
  dateFormatted: string;
  type: number;
  isRead: boolean;
  imageUri: string;
}

// ─── Native module helper ─────────────────────────────────────────────────────

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    return null; // Expected: module unavailable on non-Android
  }
};

// ─── Date grouping ──────────────────────────────────────────────────────────

interface DateSeparatorItem {
  type: 'separator';
  id: string;
  label: string;
}

type ListItem = DeviceSms | DateSeparatorItem;

function isSeparator(item: ListItem): item is DateSeparatorItem {
  return (item as DateSeparatorItem).type === 'separator';
}

function formatDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function insertDateSeparators(messages: DeviceSms[]): ListItem[] {
  if (messages.length === 0) return [];
  // Messages are sorted newest-first (inverted list), so iterate in order
  const result: ListItem[] = [];
  let lastDateKey = '';

  // Walk from oldest to newest so separators precede their group
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const timestamp = (msg as DeviceSms & { date?: number }).date ?? 0;
    const msgDate = new Date(timestamp);
    const dateKey = `${msgDate.getFullYear()}-${msgDate.getMonth()}-${msgDate.getDate()}`;

    if (dateKey !== lastDateKey) {
      result.push({
        type: 'separator',
        id: `sep_${dateKey}`,
        label: formatDateLabel(msgDate),
      });
      lastDateKey = dateKey;
    }
    result.push(msg);
  }

  // Reverse so newest is first (for inverted FlatList)
  return result.reverse();
}

// ─── Reactions ───────────────────────────────────────────────────────────────

const REACTIONS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];
const REACTIONS_STORAGE_KEY = '@iostoandroid/message_reactions';

// ─── Message Bubble ───────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
const BUBBLE_MAX_WIDTH = SCREEN_WIDTH * 0.75;

function isLocalImageMessage(m: DeviceSms | LocalImageMessage): m is LocalImageMessage {
  return typeof (m as LocalImageMessage).imageUri === 'string';
}

interface BubbleProps {
  message: DeviceSms | LocalImageMessage;
  isDark: boolean;
  colors: CupertinoColors;
  typography: typeof Typography;
  reactions?: string[];
  onLongPress?: () => void;
  showReactionPicker?: boolean;
  onReaction?: (emoji: string) => void;
  onCopy?: () => void;
}

const MessageBubble = React.memo(function MessageBubble({
  message,
  isDark,
  colors,
  typography,
  reactions,
  onLongPress,
  showReactionPicker,
  onReaction,
  onCopy,
}: BubbleProps) {
  const isSent = message.type === 2;
  const pickerScale = useSharedValue(showReactionPicker ? 1 : 0);

  useEffect(() => {
    pickerScale.value = withSpring(showReactionPicker ? 1 : 0, { damping: 18, stiffness: 400 });
  }, [showReactionPicker, pickerScale]);

  const pickerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pickerScale.value }],
    opacity: pickerScale.value,
  }));

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
      {/* Reaction picker + action buttons */}
      {showReactionPicker && (
        <Animated.View style={[styles.reactionPicker, isSent ? styles.reactionPickerRight : styles.reactionPickerLeft, { backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF' }, pickerStyle]}>
          <View style={styles.reactionEmojiRow}>
            {REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => onReaction?.(emoji)}
                style={({ pressed }) => [styles.reactionBtn, pressed && { transform: [{ scale: 1.3 }] }]}
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.reactionActionDivider, { backgroundColor: isDark ? '#48484A' : '#E5E5EA' }]} />
          <Pressable
            onPress={onCopy}
            style={({ pressed }) => [styles.reactionActionBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="copy-outline" size={16} color={isDark ? '#EBEBF5' : '#3C3C43'} />
            <Text style={[typography.subhead, { color: isDark ? '#EBEBF5' : '#3C3C43', marginLeft: 6 }]}>
              Copy
            </Text>
          </Pressable>
        </Animated.View>
      )}
      <Pressable onLongPress={onLongPress} delayLongPress={400}>
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: isLocalImageMessage(message) ? 'transparent' : bubbleBackground,
              maxWidth: BUBBLE_MAX_WIDTH,
              elevation: isSent ? 1 : 0,
            },
            isSent ? styles.bubbleSent : styles.bubbleReceived,
          ]}
        >
          {isLocalImageMessage(message) ? (
            <Image
              source={{ uri: message.imageUri }}
              style={styles.imageBubble}
              resizeMode="cover"
            />
          ) : (
            <Text style={[typography.callout, { color: textColor }]}>
              {message.body}
            </Text>
          )}
          {/* Reaction badges */}
          {reactions && reactions.length > 0 && (
            <View style={[styles.reactionBadge, { backgroundColor: isDark ? '#3A3A3C' : '#E8E8ED', borderColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
              {reactions.map((r, i) => (
                <Text key={i} style={{ fontSize: 12 }}>{r}</Text>
              ))}
            </View>
          )}
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
      </Pressable>
      <View style={[styles.bubbleMeta, isSent ? styles.bubbleMetaRight : styles.bubbleMetaLeft]}>
        <Text
          style={[
            typography.caption2,
            styles.bubbleTime,
            { color: colors.secondaryLabel },
          ]}
        >
          {message.dateFormatted}
        </Text>
        {isSent && (
          <View style={styles.sentIndicator}>
            <Ionicons name="checkmark" size={12} color={colors.secondaryLabel} />
            <Text style={[typography.caption2, { color: colors.secondaryLabel, marginLeft: 2 }]}>
              Sent
            </Text>
          </View>
        )}
      </View>
    </View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface ConversationScreenProps {
  navigation: AppNavigationProp;
  route: AppRouteProp<'Conversation'>;
}

export function ConversationScreen({ navigation, route }: ConversationScreenProps) {
  const { address } = route.params;

  const { theme, typography, spacing } = useTheme();
  const { colors, dark } = theme;
  const insets = useSafeAreaInsets();
  const device = useDevice();
  const alert = useAlert();

  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [localImageMessages, setLocalImageMessages] = useState<LocalImageMessage[]>([]);
  const listRef = useRef<FlatList>(null);
  const draftKey = `@draft_${address}`;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load reactions from storage
  useEffect(() => {
    AsyncStorage.getItem(REACTIONS_STORAGE_KEY).then((val) => {
      if (val) try { setReactions(JSON.parse(val)); } catch { /* ignore */ }
    }).catch(() => {});
  }, []);

  // Save reactions
  const saveReactions = useCallback((updated: Record<string, string[]>) => {
    setReactions(updated);
    AsyncStorage.setItem(REACTIONS_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  }, []);

  const handleReaction = useCallback((msgId: string, emoji: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReactions((prev) => {
      const current = prev[msgId] || [];
      const updated = current.includes(emoji)
        ? current.filter((r) => r !== emoji)
        : [...current, emoji];
      const next = { ...prev, [msgId]: updated.length > 0 ? updated : [] };
      if (updated.length === 0) delete next[msgId];
      saveReactions(next);
      return next;
    });
    setSelectedMsgId(null);
  }, [saveReactions]);

  const handleLongPress = useCallback((msgId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMsgId((prev) => (prev === msgId ? null : msgId));
  }, []);

  const handleCopy = useCallback((msgBody: string) => {
    Clipboard.setStringAsync(msgBody).catch(() => {});
    setSelectedMsgId(null);
  }, []);

  const handleBubblePress = useCallback((msgId: string) => {
    if (selectedMsgId === msgId) {
      setSelectedMsgId(null);
    }
  }, [selectedMsgId]);

  // Load draft on mount
  useEffect(() => {
    AsyncStorage.getItem(draftKey).then((value) => {
      if (value) setInputText(value);
    }).catch(() => {});
  }, [draftKey]);

  // Debounced draft save on text change
  const handleInputChange = useCallback((text: string) => {
    setInputText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (text.trim()) {
        AsyncStorage.setItem(draftKey, text).catch(() => {});
      } else {
        AsyncStorage.removeItem(draftKey).catch(() => {});
      }
    }, 500);
  }, [draftKey]);

  // Cleanup draft debounce timeout on unmount to avoid missed saves
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        // Flush the pending draft save immediately
      }
    };
  }, []);

  // Match contact
  const contact = useMemo(
    () => findContactByPhone(address, device.contacts),
    [address, device.contacts],
  );

  const displayName = contact
    ? `${contact.firstName} ${contact.lastName}`.trim()
    : address;

  // Filter messages for this address (including local image messages)
  const rawMessages = useMemo(() => {
    const deviceMsgs = device.messages
      .filter((m) => m.address === address)
      .sort((a, b) => {
        const aTime = (a as DeviceSms & { date?: number }).date ?? 0;
        const bTime = (b as DeviceSms & { date?: number }).date ?? 0;
        return bTime - aTime;
      });
    // Merge local image messages (already newest-first)
    const allMsgs = [...localImageMessages, ...deviceMsgs] as DeviceSms[];
    return allMsgs;
  }, [device.messages, address, localImageMessages]);

  const messages = useMemo(
    () => insertDateSeparators(rawMessages),
    [rawMessages],
  );

  const addImageMessage = useCallback((uri: string) => {
    const newMsg: LocalImageMessage = {
      id: `img_${Date.now()}`,
      address,
      body: '',
      dateFormatted: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 2, // sent
      isRead: true,
      imageUri: uri,
    };
    setLocalImageMessages((prev) => [newMsg, ...prev]);
  }, [address]);

  const handleCameraButton = useCallback(async () => {
    const { status } = await withAutoLockSuppressed(() => ImagePicker.requestCameraPermissionsAsync());
    if (status !== 'granted') {
      alert('Permission Denied', 'Camera access is required to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!result.canceled && result.assets.length > 0) {
      addImageMessage(result.assets[0].uri);
    }
  }, [alert, addImageMessage]);

  const handlePhotoLibraryButton = useCallback(async () => {
    const { status } = await withAutoLockSuppressed(() => ImagePicker.requestMediaLibraryPermissionsAsync());
    if (status !== 'granted') {
      alert('Permission Denied', 'Photo library access is required to select photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!result.canceled && result.assets.length > 0) {
      addImageMessage(result.assets[0].uri);
    }
  }, [alert, addImageMessage]);

  const handleCall = useCallback(async () => {
    const mod = await getLauncher();
    if (mod) {
      try {
        const ok = await mod.makeCall(address);
        if (ok) return;
      } catch { /* fall through to tel: */ }
    }
    // Fallback: open dialer
    Linking.openURL(`tel:${address}`);
  }, [address]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isSending) return;

    // Ensure SEND_SMS permission is granted BEFORE hitting the native module
    // so the user gets a system prompt instead of a silent failure.
    if (Platform.OS === 'android') {
      try {
        const already = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.SEND_SMS,
        );
        if (!already) {
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.SEND_SMS,
            {
              title: 'Send Messages',
              message: 'Allow this app to send SMS messages on your behalf?',
              buttonPositive: 'Allow',
              buttonNegative: 'Deny',
            },
          );
          if (result !== PermissionsAndroid.RESULTS.GRANTED) {
            alert(
              'Permission Needed',
              result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
                ? 'SMS permission is disabled. Enable it in system settings to send messages.'
                : 'SMS permission was denied. Messages can\u2019t be sent without it.',
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
      } catch {
        // Fall through — native module call below will surface the real failure.
      }
    }

    const mod = await getLauncher();
    if (mod) {
      setIsSending(true);
      try {
        const success = await mod.sendSms(address, text);
        if (success) {
          setInputText('');
          AsyncStorage.removeItem(draftKey).catch(() => {});
          await device.refresh();
          listRef.current?.scrollToIndex({ index: 0, animated: true });
        } else {
          alert('Failed', 'Could not send message. Check permissions and try again.');
        }
      } catch {
        alert('Failed', 'Could not send message. Check permissions and try again.');
      } finally {
        setIsSending(false);
      }
    }
  }, [inputText, isSending, address, device, draftKey, alert]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (isSeparator(item)) {
        return (
          <View style={styles.dateSeparator}>
            <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
              {item.label}
            </Text>
          </View>
        );
      }
      return (
        <Pressable onPress={() => handleBubblePress(item.id)}>
          <MessageBubble
            message={item}
            isDark={dark}
            colors={colors}
            typography={typography}
            reactions={reactions[item.id]}
            onLongPress={() => handleLongPress(item.id)}
            showReactionPicker={selectedMsgId === item.id}
            onReaction={(emoji) => handleReaction(item.id, emoji)}
            onCopy={() => handleCopy(item.body)}
          />
        </Pressable>
      );
    },
    [dark, colors, typography, reactions, selectedMsgId, handleLongPress, handleReaction, handleCopy, handleBubblePress],
  );

  const keyExtractor = useCallback((item: ListItem) => isSeparator(item) ? item.id : item.id, []);

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

          {/* Title — tap to view contact details */}
          <Pressable
            onPress={contact ? () => navigation.navigate('ContactDetail', { contactId: contact.id }) : undefined}
            hitSlop={8}
          >
            <Text
              style={[typography.headline, styles.navTitle, { color: colors.label }]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
          </Pressable>

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

      {/* Dismiss reaction picker on tap */}
      {selectedMsgId && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedMsgId(null)} />
      )}

      {/* Message List */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        inverted={rawMessages.length > 0}
        ListEmptyComponent={ListEmpty}

        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          rawMessages.length === 0
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
        {/* Camera button */}
        <Pressable
          onPress={handleCameraButton}
          hitSlop={8}
          style={styles.plusButton}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
        >
          <Ionicons name="camera-outline" size={24} color={colors.systemBlue} />
        </Pressable>
        {/* Photo library button */}
        <Pressable
          onPress={handlePhotoLibraryButton}
          hitSlop={8}
          style={styles.plusButton}
          accessibilityRole="button"
          accessibilityLabel="Choose photo from library"
        >
          <Ionicons name="image-outline" size={24} color={colors.systemBlue} />
        </Pressable>
        <View style={styles.textFieldWrapper}>
          <CupertinoTextField
            value={inputText}
            onChangeText={handleInputChange}
            placeholder="Message"
            multiline
            clearButton={false}
            containerStyle={styles.textFieldContainer}
            returnKeyType="default"
          />
          {inputText.length > 0 && (
            <Text style={[typography.caption2, styles.charCounter, { color: colors.secondaryLabel }]}>
              {inputText.length}
            </Text>
          )}
        </View>
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
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginHorizontal: 4,
    gap: 6,
  },
  bubbleMetaLeft: {
    justifyContent: 'flex-start',
  },
  bubbleMetaRight: {
    justifyContent: 'flex-end',
  },
  bubbleTime: {
  },
  sentIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateSeparator: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  textFieldWrapper: {
    flex: 1,
    position: 'relative',
  },
  textFieldContainer: {
    flex: 1,
  },
  charCounter: {
    position: 'absolute',
    bottom: -16,
    right: 4,
    fontSize: 10,
  },
  plusButton: {
    paddingBottom: 6,
  },
  imageBubble: {
    width: 200,
    height: 150,
    borderRadius: 14,
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
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  reactionPicker: {
    flexDirection: 'column',
    borderRadius: 16,
    paddingVertical: 4,
    marginBottom: 4,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    minWidth: 200,
  },
  reactionEmojiRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 2,
  },
  reactionActionDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  reactionActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  reactionPickerLeft: {
    alignSelf: 'flex-start',
  },
  reactionPickerRight: {
    alignSelf: 'flex-end',
  },
  reactionBtn: {
    padding: 4,
  },
  reactionBadge: {
    position: 'absolute',
    top: -8,
    right: -4,
    flexDirection: 'row',
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 2,
    gap: 1,
  },
});
