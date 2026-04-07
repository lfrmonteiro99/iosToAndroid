import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../theme/ThemeContext';
import { useDevice, DeviceSms, DeviceContact } from '../store/DeviceStore';
import { CupertinoSearchBar, CupertinoButton, CupertinoActivityIndicator } from '../components';

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
        // Fall back to dateFormatted string comparison if no numeric date
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
  const digits = phone.replace(/\D/g, '').slice(-10);
  return contacts.find((c) => c.phone.replace(/\D/g, '').slice(-10) === digits);
}

function getInitials(contact: DeviceContact): string {
  const first = contact.firstName?.[0] ?? '';
  const last = contact.lastName?.[0] ?? '';
  return (first + last).toUpperCase() || '?';
}

// ─── Conversation Row ────────────────────────────────────────────────────────

const AVATAR_SIZE = 52;
const AVATAR_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#5AC8FA', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55',
];

function avatarColor(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) hash = address.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface ConversationRowProps {
  conversation: Conversation;
  contacts: DeviceContact[];
  colors: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  typography: any; // eslint-disable-line @typescript-eslint/no-explicit-any
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
  const bgColor = avatarColor(conversation.address);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.systemGray5 : colors.systemBackground },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${displayName}`}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: bgColor }]}>
        {contact?.imageUri ? null : (
          contact ? (
            <Text style={styles.avatarInitials}>{getInitials(contact)}</Text>
          ) : (
            <Ionicons name="call-outline" size={22} color="#FFFFFF" />
          )
        )}
      </View>

      {/* Content */}
      <View
        style={[
          styles.rowContent,
          { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth },
        ]}
      >
        <View style={styles.rowHeader}>
          <Text
            style={[
              typography.callout,
              styles.nameText,
              { color: colors.label, fontWeight: hasUnread ? '700' : '400' },
            ]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
            {conversation.lastMessage.dateFormatted}
          </Text>
        </View>

        <View style={styles.rowFooter}>
          <Text
            style={[
              typography.subhead,
              styles.previewText,
              { color: hasUnread ? colors.label : colors.secondaryLabel },
            ]}
            numberOfLines={1}
          >
            {conversation.lastMessage.body}
          </Text>
          {hasUnread && (
            <View style={[styles.unreadDot, { backgroundColor: colors.systemBlue }]} />
          )}
        </View>
      </View>
    </Pressable>
  );
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export function MessagesScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const device = useDevice();

  const [searchQuery, setSearchQuery] = useState('');

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

  const ListEmpty = (
    <View style={styles.emptyContainer}>
      {device.messages.length === 0 ? (
        <>
          <Ionicons name="chatbubble-outline" size={64} color={colors.systemGray3} />
          <Text style={[typography.title3, { color: colors.secondaryLabel, marginTop: spacing.md }]}>
            No Messages
          </Text>
          <Text style={[typography.body, { color: colors.tertiaryLabel, marginTop: spacing.xs, textAlign: 'center' }]}>
            Grant SMS permission to see your messages
          </Text>
          <View style={{ marginTop: spacing.lg }}>
            <CupertinoButton
              title="Grant SMS Permission"
              onPress={() => device.requestSmsPermission()}
            />
          </View>
        </>
      ) : (
        <>
          <Ionicons name="chatbubble-outline" size={64} color={colors.systemGray3} />
          <Text style={[typography.title3, { color: colors.secondaryLabel, marginTop: spacing.md }]}>
            No Messages
          </Text>
        </>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemBackground }]}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      {/* Nav Bar */}
      <BlurView
        intensity={80}
        tint={theme.dark ? 'dark' : 'light'}
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
          <View style={styles.navSlot}>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center' }}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={28} color={colors.systemBlue} />
            </Pressable>
          </View>
          <Text style={[typography.headline, { color: colors.label }]}>Messages</Text>
          <View style={[styles.navSlot, styles.navSlotRight]}>
            <Pressable
              onPress={handleComposePress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Compose new message"
            >
              <Ionicons name="create-outline" size={24} color={colors.systemBlue} />
            </Pressable>
          </View>
        </View>
      </BlurView>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <CupertinoSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          onCancel={() => setSearchQuery('')}
          placeholder="Search"
        />
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
          decelerationRate={0.998}
          contentContainerStyle={
            filtered.length === 0 ? styles.emptyList : undefined
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
  navBar: {
    zIndex: 10,
  },
  navBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: 16,
  },
  navSlot: {
    minWidth: 60,
    alignItems: 'flex-start',
  },
  navSlotRight: {
    alignItems: 'flex-end',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    elevation: 1,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  rowContent: {
    flex: 1,
    paddingRight: 16,
    paddingVertical: 12,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 3,
  },
  nameText: {
    flex: 1,
    marginRight: 8,
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewText: {
    flex: 1,
    marginRight: 8,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
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
