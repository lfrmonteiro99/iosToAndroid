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
  ActivityIndicator,
  TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { withAutoLockSuppressed } from '../utils/permissions';
import { dispatchSendMessage } from '../actions/primitiveDispatcher';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useTheme, ResolvedTypography } from '../theme/ThemeContext';
import { useDevice, DeviceSms, DeviceContact } from '../store/DeviceStore';
import { migrateAsyncStorageKey, draftStorageKey, draftLegacyStorageKey } from '../store/storage';
import { CupertinoTextField, GlassSurface, useAlert } from '../components';
import { findContactByPhone } from '../utils/contacts';
import type { AppNavigationProp, AppRouteProp } from '../navigation/types';
import type { CupertinoColors } from '../theme/CupertinoTheme';
import { hapticImpact } from '../utils/haptics';
import { LocalImageMessage, MessageBubble } from './MessageBubble';

// ─── Native module helper ─────────────────────────────────────────────────────

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    // Dynamic import is unavailable in some environments (e.g. Jest's VM);
    // fall back to a synchronous require so the module stays reachable there.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro supports require; fallback for environments without dynamic import
      return require('../../modules/launcher-module/src').default;
    } catch {
      return null; // Expected: module unavailable on non-Android
    }
  }
};

// #927: one page of a conversation's history. Small enough to make pagination
// exercise-able in practice and in tests, without paging on every few messages.
const MESSAGES_PAGE_SIZE = 30;

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

const REACTIONS_STORAGE_KEY = '@iostoandroid/message_reactions';

// ─── Message Row (Bubble + Press Handler) ─────────────────────────────────────

interface MessageRowProps {
  item: DeviceSms | LocalImageMessage;
  isDark: boolean;
  colors: CupertinoColors;
  typography: ResolvedTypography;
  reactions?: string[];
  selectedMsgId: string | null;
  onLongPress: (msgId: string) => void;
  onReaction: (msgId: string, emoji: string) => void;
  onCopy: (msgBody: string) => void;
  onPress: (msgId: string) => void;
}

const MessageRow = React.memo(function MessageRow({
  item,
  isDark,
  colors,
  typography,
  reactions,
  selectedMsgId,
  onLongPress,
  onReaction,
  onCopy,
  onPress,
}: MessageRowProps) {
  return (
    <Pressable onPress={() => onPress(item.id)} accessibilityRole="button">
      <MessageBubble
        message={item}
        isDark={isDark}
        colors={colors}
        typography={typography}
        reactions={reactions}
        onLongPress={() => onLongPress(item.id)}
        showReactionPicker={selectedMsgId === item.id}
        onReaction={(emoji) => onReaction(item.id, emoji)}
        onCopy={() => onCopy(item.body)}
      />
    </Pressable>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface ConversationScreenProps {
  navigation: AppNavigationProp;
  route: AppRouteProp<'Conversation'>;
}

export function ConversationScreen({ navigation, route }: ConversationScreenProps) {
  const { address: initialAddress } = route.params;

  const { theme, typography, spacing } = useTheme();
  const { colors, dark } = theme;
  const insets = useSafeAreaInsets();
  const device = useDevice();
  const alert = useAlert();

  // Composing a new message navigates here with an empty address (no recipient
  // chosen yet — see MessagesScreen/LauncherHomeScreen "compose" actions). Track
  // the chosen recipient locally so the rest of the screen (message filtering,
  // draft key, send target) can keep treating `address` as the effective one.
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(initialAddress || null);
  const [recipientQuery, setRecipientQuery] = useState('');
  const address = selectedRecipient ?? '';
  const isChoosingRecipient = address === '';

  const recipientSuggestions = useMemo(() => {
    const q = recipientQuery.trim().toLowerCase();
    if (!q) return [];
    const qDigits = q.replace(/\D/g, '');
    return device.contacts.filter((c) => {
      const name = `${c.firstName} ${c.lastName}`.toLowerCase();
      const nameMatch = name.includes(q);
      const phoneMatch = qDigits.length > 0 && c.phone.replace(/\D/g, '').includes(qDigits);
      return nameMatch || phoneMatch;
    }).slice(0, 5);
  }, [recipientQuery, device.contacts]);

  const handleSelectRecipient = useCallback((c: DeviceContact) => {
    setSelectedRecipient(c.phone);
    setRecipientQuery('');
  }, []);

  const handleSubmitRecipient = useCallback(() => {
    const trimmed = recipientQuery.trim();
    if (trimmed) {
      setSelectedRecipient(trimmed);
      setRecipientQuery('');
    }
  }, [recipientQuery]);

  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [localImageMessages, setLocalImageMessages] = useState<LocalImageMessage[]>([]);
  const listRef = useRef<FlatList>(null);

  // #927: this screen's own paged thread history — NOT a filter over
  // device.messages, which only ever holds the 50 most-recent SMS across
  // every conversation (see DeviceStore.loadMessages). oldestLoadedDateRef
  // drives keyset pagination (page by `date`, not offset, so a new incoming
  // SMS mid-scroll can't shift the page boundary).
  const [threadMessages, setThreadMessages] = useState<DeviceSms[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const oldestLoadedDateRef = useRef<number | null>(null);
  // A ref, not just the isLoadingOlderMessages state, guards re-entrancy: if
  // onEndReached fires twice before React re-renders, both calls would read
  // the same stale (false) state value from their closures and both proceed.
  const isLoadingOlderRef = useRef(false);
  // RN can call onEndReached as soon as an (initially empty) list mounts,
  // before the first page has resolved — without this guard that races
  // loadOlderMessages(beforeDate=null) against loadFirstPage's own request
  // for the same page, duplicating the first page's rows once both resolve.
  const hasLoadedFirstPageRef = useRef(false);
  // Discards a response that resolves after a newer request started (address
  // switched, or unmount) — the mount/unmount effect below also sets this to
  // -1 so any in-flight response is dropped even if no new request follows.
  const threadRequestIdRef = useRef(0);

  useEffect(() => {
    return () => { threadRequestIdRef.current = -1; };
  }, []);

  const loadFirstPage = useCallback(async (addr: string) => {
    const requestId = ++threadRequestIdRef.current;
    hasLoadedFirstPageRef.current = false;
    if (!addr) {
      setThreadMessages([]);
      setHasMoreMessages(false);
      oldestLoadedDateRef.current = null;
      hasLoadedFirstPageRef.current = true;
      return;
    }
    const mod = await getLauncher();
    if (requestId !== threadRequestIdRef.current) return;
    if (!mod) {
      setThreadMessages([]);
      setHasMoreMessages(false);
      oldestLoadedDateRef.current = null;
      hasLoadedFirstPageRef.current = true;
      return;
    }
    try {
      const page = await mod.getMessagesForThread(addr, MESSAGES_PAGE_SIZE, null);
      if (requestId !== threadRequestIdRef.current) return;
      setThreadMessages(page);
      setHasMoreMessages(page.length === MESSAGES_PAGE_SIZE);
      oldestLoadedDateRef.current = page.length > 0 ? page[page.length - 1].date ?? null : null;
    } catch {
      if (requestId !== threadRequestIdRef.current) return;
      setThreadMessages([]);
      setHasMoreMessages(false);
      oldestLoadedDateRef.current = null;
    } finally {
      if (requestId === threadRequestIdRef.current) hasLoadedFirstPageRef.current = true;
    }
  }, []);

  useEffect(() => {
    loadFirstPage(address);
  }, [address, loadFirstPage]);

  const loadOlderMessages = useCallback(async () => {
    if (!address || !hasMoreMessages || isLoadingOlderRef.current || !hasLoadedFirstPageRef.current) return;
    isLoadingOlderRef.current = true;
    const requestId = threadRequestIdRef.current;
    setIsLoadingOlderMessages(true);
    try {
      const mod = await getLauncher();
      if (!mod || requestId !== threadRequestIdRef.current) return;
      const page = await mod.getMessagesForThread(address, MESSAGES_PAGE_SIZE, oldestLoadedDateRef.current);
      if (requestId !== threadRequestIdRef.current) return;
      setThreadMessages((prev) => [...prev, ...page]);
      setHasMoreMessages(page.length === MESSAGES_PAGE_SIZE);
      if (page.length > 0) {
        oldestLoadedDateRef.current = page[page.length - 1].date ?? oldestLoadedDateRef.current;
      }
    } finally {
      isLoadingOlderRef.current = false;
      if (requestId === threadRequestIdRef.current) setIsLoadingOlderMessages(false);
    }
  }, [address, hasMoreMessages]);
  const draftKey = draftStorageKey(address);
  const legacyDraftKey = draftLegacyStorageKey(address);
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
    hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
    hapticImpact(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
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

  // Load draft on mount — migrate the legacy key first so existing users keep their drafts
  useEffect(() => {
    (async () => {
      await migrateAsyncStorageKey(legacyDraftKey, draftKey);
      const value = await AsyncStorage.getItem(draftKey);
      if (value) setInputText(value);
    })().catch(() => {});
  }, [draftKey, legacyDraftKey]);

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

  const displayName = isChoosingRecipient
    ? 'New Message'
    : contact
      ? `${contact.firstName} ${contact.lastName}`.trim()
      : address;

  // This thread's own messages (including local image messages), loaded via
  // getMessagesForThread — NOT filtered from device.messages, which only
  // holds the 50 most-recent SMS globally (#927). threadMessages already
  // arrives newest-first from the native DATE DESC query.
  // Guard the empty (no recipient chosen yet) case explicitly so it can never
  // accidentally match a stray message with an empty/undefined address.
  const rawMessages = useMemo(() => {
    if (!address) return [] as DeviceSms[];
    const allMsgs = [...localImageMessages, ...threadMessages] as DeviceSms[];
    return allMsgs;
  }, [address, threadMessages, localImageMessages]);

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
    if (!address) return;
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

    // Reject before touching permissions or the native bridge — a missing
    // recipient isn't a permissions problem, and the bridge would otherwise
    // just return false, surfacing a misleading "check permissions" alert.
    if (!address) {
      alert('No Recipient', 'Choose a contact or enter a phone number before sending.');
      return;
    }

    setIsSending(true);
    try {
      const success = await dispatchSendMessage(address, text, {
        isAndroid: Platform.OS === 'android',
        hasSmsPermission: () => PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.SEND_SMS),
        requestSmsPermission: async () => {
          const result = await withAutoLockSuppressed(() => PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.SEND_SMS,
            {
              title: 'Send Messages',
              message: 'Allow this app to send SMS messages on your behalf?',
              buttonPositive: 'Allow',
              buttonNegative: 'Deny',
            },
          ));
          if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
          if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'never_ask_again';
          return 'denied';
        },
        sendSmsNative: async (to, body) => {
          const mod = await getLauncher();
          return mod ? mod.sendSms(to, body) : false;
        },
        onPermissionDenied: (neverAskAgain) => {
          alert(
            'Permission Needed',
            neverAskAgain
              ? 'SMS permission is disabled. Enable it in system settings to send messages.'
              : 'SMS permission was denied. Messages can\u2019t be sent without it.',
            [
              ...(neverAskAgain
                ? [{ text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } }]
                : []),
              { text: 'OK' },
            ],
          );
        },
        onSent: () => {},
        onError: () => {
          alert('Failed', 'Could not send message. Check permissions and try again.');
        },
      });

      if (success) {
        setInputText('');
        AsyncStorage.removeItem(draftKey).catch(() => {});
        // device.refresh() keeps the global 50-message list (MessagesScreen's
        // conversation previews) in sync; loadFirstPage refreshes this
        // screen's own thread so the just-sent message appears immediately.
        await Promise.all([device.refresh(), loadFirstPage(address)]);
        // A brand-new conversation's first send can still race an empty list
        // here (loadFirstPage just resolved into state, not into this
        // closure's rawMessages) — scrollToIndex(0) throws on an empty list.
        try {
          listRef.current?.scrollToIndex({ index: 0, animated: true });
        } catch { /* nothing to scroll to yet */ }
      }
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending, address, device, draftKey, alert, loadFirstPage]);

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
        <MessageRow
          item={item}
          isDark={dark}
          colors={colors}
          typography={typography}
          reactions={reactions[item.id]}
          selectedMsgId={selectedMsgId}
          onLongPress={handleLongPress}
          onReaction={handleReaction}
          onCopy={handleCopy}
          onPress={handleBubblePress}
        />
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
      <GlassSurface
        intensity={80}
        tint={dark ? 'dark' : 'light'}
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
            accessibilityLabel={contact ? `View ${displayName}'s contact details` : undefined}
            accessibilityRole={contact ? 'button' : undefined}
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
              disabled={isChoosingRecipient}
              accessibilityRole="button"
              accessibilityLabel={`Call ${displayName}`}
            >
              <Ionicons
                name="call-outline"
                size={22}
                color={isChoosingRecipient ? colors.systemGray3 : colors.systemBlue}
              />
            </Pressable>
          </View>
        </View>
      </GlassSurface>

      {/* Recipient picker — shown while composing a new message (no address yet) */}
      {isChoosingRecipient && (
        <View
          style={[
            styles.recipientRow,
            { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <Text style={[typography.body, { color: colors.secondaryLabel }]}>To:</Text>
          <TextInput
            style={[typography.body, styles.recipientInput, { color: colors.label }]}
            placeholder="Name or phone number"
            placeholderTextColor={colors.systemGray}
            value={recipientQuery}
            onChangeText={setRecipientQuery}
            onSubmitEditing={handleSubmitRecipient}
            autoFocus
            returnKeyType="done"
            accessibilityLabel="Recipient"
          />
        </View>
      )}
      {isChoosingRecipient && recipientSuggestions.length > 0 && (
        <View style={[styles.suggestionsList, { backgroundColor: colors.systemBackground }]}>
          {recipientSuggestions.map((c) => {
            const name = `${c.firstName} ${c.lastName}`.trim();
            return (
              <Pressable
                key={c.id}
                onPress={() => handleSelectRecipient(c)}
                style={[styles.suggestionRow, { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}
                accessibilityRole="button"
                accessibilityLabel={`Send to ${name || c.phone}`}
              >
                <Text style={[typography.body, { color: colors.label }]}>{name || c.phone}</Text>
                {!!name && (
                  <Text style={[typography.subhead, { color: colors.secondaryLabel }]}>{c.phone}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Dismiss reaction picker on tap */}
      {selectedMsgId && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedMsgId(null)} accessibilityLabel="Dismiss" accessibilityRole="button" />
      )}

      {/* Message List */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        inverted={rawMessages.length > 0}
        ListEmptyComponent={ListEmpty}
        // Inverted list: "end" is the oldest end, rendered at the visual top —
        // reaching it is "scrolled to the top", where the previous (older) page loads.
        onEndReached={loadOlderMessages}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isLoadingOlderMessages
            ? <ActivityIndicator size="small" color={colors.systemGray} style={styles.olderMessagesLoader} />
            : null
        }
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
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  recipientInput: {
    flex: 1,
    paddingVertical: 0,
  },
  suggestionsList: {
    maxHeight: 220,
  },
  suggestionRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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
  olderMessagesLoader: {
    paddingVertical: 12,
  },
});
