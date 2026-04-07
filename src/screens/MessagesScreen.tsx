import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../theme/ThemeContext';
import { useDevice, DeviceSms, DeviceContact } from '../store/DeviceStore';
import { CupertinoButton, CupertinoActivityIndicator } from '../components';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface Conversation {
  address: string;
  messages: DeviceSms[];
  lastMessage: DeviceSms;
  unreadCount: number;
}

function groupConversations(messages: DeviceSms[]): Conversation[] {
  const groups: Record<string, DeviceSms[]> = {};
  for (const msg of messages) {
    const key = msg.address || 'unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(msg);
  }
  return Object.entries(groups)
    .map(([address, msgs]) => {
      const sorted = [...msgs].sort((a, b) => {
        const aTime = (a as DeviceSms & { date?: number }).date ?? 0;
        const bTime = (b as DeviceSms & { date?: number }).date ?? 0;
        return bTime - aTime;
      });
      return {
        address,
        messages: sorted,
        lastMessage: sorted[0],
        unreadCount: msgs.filter((m) => !m.isRead).length,
      };
    })
    .sort((a, b) => {
      const aTime = (a.lastMessage as DeviceSms & { date?: number }).date ?? 0;
      const bTime = (b.lastMessage as DeviceSms & { date?: number }).date ?? 0;
      return bTime - aTime;
    });
}

function findContactByPhone(phone: string, contacts: DeviceContact[]): DeviceContact | undefined {
  const digits = phone.replace(/\D/g, '').slice(-9);
  return contacts.find((c) => c.phone.replace(/\D/g, '').slice(-9) === digits);
}

function getInitials(contact: DeviceContact): string {
  const first = contact.firstName?.[0] ?? '';
  const last = contact.lastName?.[0] ?? '';
  return (first + last).toUpperCase() || '?';
}

const AVATAR_SIZE = 48;
const AVATAR_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#5AC8FA', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55',
];

function avatarColor(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) hash = address.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Conversation Row ────────────────────────────────────────────────────────

interface ConversationRowProps {
  conversation: Conversation;
  contacts: DeviceContact[];
  colors: any;
  typography: any;
  onPress: () => void;
}

const ConversationRow = React.memo(function ConversationRow({
  conversation,
  contacts,
  colors,
  typography,
  onPress,
}: ConversationRowProps) {
  const contact = findContactByPhone(conversation.address, contacts);
  const displayName = contact
    ? `${contact.firstName} ${contact.lastName}`.trim()
    : conversation.address;
  const hasUnread = conversation.unreadCount > 0;
  const bgColor = contact ? avatarColor(contact.id) : avatarColor(conversation.address);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.systemGray5 : 'transparent' },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${displayName}`}
    >
      {/* Unread indicator */}
      <View style={styles.unreadIndicatorSlot}>
        {hasUnread && (
          <View style={[styles.unreadIndicator, { backgroundColor: colors.systemBlue }]} />
        )}
      </View>

      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: bgColor }]}>
        {contact ? (
          <Text style={styles.avatarInitials}>{getInitials(contact)}</Text>
        ) : (
          <Ionicons name="person" size={22} color="#FFFFFF" />
        )}
      </View>

      {/* Content */}
      <View
        style={[
          styles.rowContent,
          { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth },
        ]}
      >
        <View style={styles.rowTop}>
          <Text
            style={[
              typography.body,
              styles.nameText,
              { color: colors.label, fontWeight: hasUnread ? '700' : '400' },
            ]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <View style={styles.dateChevronRow}>
            <Text style={[typography.subhead, { color: colors.secondaryLabel, fontSize: 15 }]}>
              {conversation.lastMessage.dateFormatted}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.systemGray3}
              style={{ marginLeft: 4 }}
            />
          </View>
        </View>

        <Text
          style={[
            typography.subhead,
            styles.previewText,
            { color: colors.secondaryLabel },
          ]}
          numberOfLines={2}
        >
          {conversation.lastMessage.body}
        </Text>
      </View>
    </Pressable>
  );
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export function MessagesScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const device = useDevice();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [hasSmsPermission, setHasSmsPermission] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'android') {
        setHasSmsPermission(false);
        return;
      }
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
      );
      setHasSmsPermission(granted);
    })();
  }, [device.messages]);

  const conversations = useMemo(
    () => groupConversations(device.messages),
    [device.messages],
  );

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((conv) => {
      const contact = findContactByPhone(conv.address, device.contacts);
      const name = contact
        ? `${contact.firstName} ${contact.lastName}`.toLowerCase()
        : conv.address;
      return name.includes(q) || conv.messages.some((m) => m.body.toLowerCase().includes(q));
    });
  }, [conversations, searchQuery, device.contacts]);

  const handleComposePress = useCallback(() => {
    navigation.navigate('Conversation', { address: '' });
  }, [navigation]);

  const handleConversationPress = useCallback(
    (address: string) => {
      navigation.navigate('Conversation', { address });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationRow
        conversation={item}
        contacts={device.contacts}
        colors={colors}
        typography={typography}
        onPress={() => handleConversationPress(item.address)}
      />
    ),
    [device.contacts, colors, typography, handleConversationPress],
  );

  const keyExtractor = useCallback((item: Conversation) => item.address, []);

  const handleGrantPermission = useCallback(async () => {
    const granted = await device.requestSmsPermission();
    setHasSmsPermission(granted);
  }, [device]);

  const ListEmpty = (
    <View style={styles.emptyContainer}>
      {hasSmsPermission === false ? (
        <>
          <View style={[styles.emptyIconBg, { backgroundColor: colors.systemGray5 }]}>
            <Ionicons name="lock-closed-outline" size={40} color={colors.systemGray} />
          </View>
          <Text style={[typography.title3, { color: colors.label, marginTop: 16 }]}>
            SMS Permission Required
          </Text>
          <Text style={[typography.subhead, { color: colors.secondaryLabel, marginTop: 6, textAlign: 'center' }]}>
            Grant SMS permission to see your messages.
          </Text>
          <View style={{ marginTop: spacing.lg }}>
            <CupertinoButton
              title="Grant SMS Permission"
              onPress={handleGrantPermission}
            />
          </View>
        </>
      ) : (
        <>
          <Ionicons name="chatbubble-outline" size={48} color={colors.systemGray3} />
          <Text style={[typography.title3, { color: colors.secondaryLabel, marginTop: spacing.md }]}>
            No Results
          </Text>
        </>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemBackground }]}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerTopRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={28} color={colors.systemBlue} />
          </Pressable>
          <Pressable
            onPress={handleComposePress}
            hitSlop={8}
          >
            <Ionicons name="create-outline" size={24} color={colors.systemBlue} />
          </Pressable>
        </View>

        {/* Large title */}
        <Text style={[styles.largeTitle, { color: colors.label }]}>
          Messages
        </Text>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.systemGray5 }]}>
          <Ionicons name="search" size={16} color={colors.systemGray} style={{ marginRight: 6 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.label }]}
            placeholder="Search"
            placeholderTextColor={colors.systemGray}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.systemGray} />
            </Pressable>
          )}
        </View>
      </View>

      {/* List or loading */}
      {!device.isReady ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <CupertinoActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListEmptyComponent={ListEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            filtered.length === 0 ? styles.emptyList : { paddingBottom: 20 }
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.41,
    marginBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 0,
  },

  // Conversation row
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 0,
  },
  unreadIndicatorSlot: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  unreadIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitials: {
    fontSize: 19,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  rowContent: {
    flex: 1,
    paddingRight: 16,
    paddingVertical: 10,
    marginLeft: 10,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  dateChevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 8,
  },
  nameText: {
    flex: 1,
    marginRight: 4,
  },
  previewText: {
    lineHeight: 20,
  },

  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyList: {
    flex: 1,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
