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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../theme/ThemeContext';
import * as Haptics from 'expo-haptics';
import { useDevice, DeviceSms, DeviceContact } from '../store/DeviceStore';
import { CupertinoButton, CupertinoSwipeableRow, useAlert, SkeletonListRow } from '../components';
import { findContactByPhone } from '../utils/contacts';
import { logger } from '../utils/logger';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colors: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typography: any;
  onPress: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
  draft?: string;
  isOpen: boolean;
  onOpen: () => void;
  editMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  hasUnread: boolean;
}

const ConversationRow = React.memo(function ConversationRow({
  conversation,
  contacts,
  colors,
  typography,
  onPress,
  onDelete,
  onMarkRead,
  draft,
  isOpen,
  onOpen,
  editMode,
  isSelected,
  onSelect,
  hasUnread,
}: ConversationRowProps) {
  const contact = findContactByPhone(conversation.address, contacts);
  const displayName = contact
    ? `${contact.firstName} ${contact.lastName}`.trim()
    : conversation.address;
  const bgColor = contact ? avatarColor(contact.id) : avatarColor(conversation.address);

  const trailingActions = editMode ? [] : [
    { label: 'Delete', color: '#FF3B30', onPress: onDelete },
  ];
  const leadingActions = editMode ? [] : [
    {
      label: hasUnread ? 'Read' : 'Unread',
      color: '#007AFF',
      onPress: onMarkRead,
    },
  ];

  const rowContent = (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.systemGray5 : 'transparent' },
      ]}
      onPress={editMode ? onSelect : onPress}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${displayName}`}
    >
      {/* Edit mode checkbox */}
      {editMode ? (
        <View style={styles.checkboxSlot}>
          <View
            style={[
              styles.checkbox,
              isSelected
                ? { backgroundColor: colors.systemBlue, borderColor: colors.systemBlue }
                : { borderColor: colors.systemGray3, backgroundColor: 'transparent' },
            ]}
          >
            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        </View>
      ) : (
        /* Unread indicator */
        <View style={styles.unreadIndicatorSlot}>
          {hasUnread && (
            <View style={[styles.unreadIndicator, { backgroundColor: colors.systemBlue }]} />
          )}
        </View>
      )}

      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: bgColor }]}>
        {contact ? (
          <Text style={styles.avatarInitials}>{getInitials(contact)}</Text>
        ) : (
          <Ionicons name="person-outline" size={22} color="#FFFFFF" />
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
          {!editMode && (
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
          )}
        </View>

        <Text
          style={[
            typography.subhead,
            styles.previewText,
            { color: colors.secondaryLabel },
          ]}
          numberOfLines={2}
        >
          {draft ? (
            <>
              <Text style={{ color: colors.systemGray, fontStyle: 'italic' }}>Draft: </Text>
              {draft}
            </>
          ) : (
            conversation.lastMessage.body
          )}
        </Text>
      </View>
    </Pressable>
  );

  if (editMode) {
    return <View style={{ backgroundColor: colors.systemBackground }}>{rowContent}</View>;
  }

  return (
    <CupertinoSwipeableRow
      trailingActions={trailingActions}
      leadingActions={leadingActions}
      isOpen={isOpen}
      onOpen={onOpen}
    >
      {rowContent}
    </CupertinoSwipeableRow>
  );
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export function MessagesScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigation = useNavigation<any>();
  const device = useDevice();
  const alert = useAlert();

  const [searchQuery, setSearchQuery] = useState('');
  const [deletedAddresses, setDeletedAddresses] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [, setIsSearchFocused] = useState(false);
  const [hasSmsPermission, setHasSmsPermission] = useState<boolean | null>(null);

  // Swipe row coordination — only one row open at a time
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [selectedAddresses, setSelectedAddresses] = useState<Set<string>>(new Set());

  // Read/unread overrides: address → true means manually marked read, false means manually marked unread
  const [readOverrides, setReadOverrides] = useState<Record<string, boolean>>({});

  // Load persisted state on mount
  useEffect(() => {
    AsyncStorage.getItem('@iostoandroid/deleted_sms').then((raw) => {
      if (raw) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setDeletedAddresses(new Set(arr));
        } catch { /* ignore */ }
      }
    }).catch(() => {});

    AsyncStorage.getItem('@iostoandroid/read_overrides').then((raw) => {
      if (raw) {
        try {
          const obj = JSON.parse(raw);
          if (obj && typeof obj === 'object') setReadOverrides(obj);
        } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

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
    () => groupConversations(device.messages).filter(
      (conv) => !deletedAddresses.has(conv.address),
    ),
    [device.messages, deletedAddresses],
  );

  // Load drafts for all conversation addresses
  useEffect(() => {
    const loadDrafts = async () => {
      const allConvs = groupConversations(device.messages);
      if (allConvs.length === 0) return;
      try {
        const loaded: Record<string, string> = {};
        await Promise.all(
          allConvs.map(async (c) => {
            const value = await AsyncStorage.getItem(`@draft_${c.address}`);
            if (value) loaded[c.address] = value;
          }),
        );
        setDrafts(loaded);
      } catch (e) {
        logger.warn('MessagesScreen', 'failed to load drafts', e);
      }
    };
    loadDrafts();
  }, [device.messages]);

  const persistReadOverrides = useCallback((overrides: Record<string, boolean>) => {
    AsyncStorage.setItem('@iostoandroid/read_overrides', JSON.stringify(overrides)).catch(() => {});
  }, []);

  const effectiveHasUnread = useCallback((conv: Conversation): boolean => {
    if (conv.address in readOverrides) return !readOverrides[conv.address];
    return conv.unreadCount > 0;
  }, [readOverrides]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDeleteConversation = useCallback((address: string) => {
    alert(
      'Delete Conversation',
      'Are you sure you want to delete this conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeletedAddresses((prev) => {
              const next = new Set(prev).add(address);
              AsyncStorage.setItem('@iostoandroid/deleted_sms', JSON.stringify([...next])).catch(() => {});
              return next;
            });
            setOpenRowId(null);
          },
        },
      ],
    );
  }, [alert]);

  const handleMarkReadUnread = useCallback((address: string, markAsRead: boolean) => {
    setReadOverrides((prev) => {
      const next = { ...prev, [address]: markAsRead };
      persistReadOverrides(next);
      return next;
    });
    setOpenRowId(null);
  }, [persistReadOverrides]);

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev);
    setSelectedAddresses(new Set());
    setOpenRowId(null);
  }, []);

  const toggleSelection = useCallback((address: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAddresses((prev) => {
      const next = new Set(prev);
      if (next.has(address)) next.delete(address);
      else next.add(address);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedAddresses.size === 0) return;
    alert(
      'Delete Conversations',
      `Delete ${selectedAddresses.size} conversation${selectedAddresses.size > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeletedAddresses((prev) => {
              const next = new Set(prev);
              for (const addr of selectedAddresses) next.add(addr);
              AsyncStorage.setItem('@iostoandroid/deleted_sms', JSON.stringify([...next])).catch(() => {});
              return next;
            });
            setSelectedAddresses(new Set());
            setEditMode(false);
          },
        },
      ],
    );
  }, [selectedAddresses, alert]);

  const handleBulkMarkRead = useCallback(() => {
    if (selectedAddresses.size === 0) return;
    setReadOverrides((prev) => {
      const next = { ...prev };
      for (const addr of selectedAddresses) next[addr] = true;
      persistReadOverrides(next);
      return next;
    });
    setSelectedAddresses(new Set());
    setEditMode(false);
  }, [selectedAddresses, persistReadOverrides]);

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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Mark as read when opening a conversation
      setReadOverrides((prev) => {
        const next = { ...prev, [address]: true };
        persistReadOverrides(next);
        return next;
      });
      navigation.navigate('Conversation', { address });
    },
    [navigation, persistReadOverrides],
  );

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => {
      const hasUnread = effectiveHasUnread(item);
      return (
        <ConversationRow
          conversation={item}
          contacts={device.contacts}
          colors={colors}
          typography={typography}
          onPress={() => handleConversationPress(item.address)}
          onDelete={() => handleDeleteConversation(item.address)}
          onMarkRead={() => handleMarkReadUnread(item.address, hasUnread)}
          draft={drafts[item.address]}
          isOpen={openRowId === item.address}
          onOpen={() => setOpenRowId(item.address)}
          editMode={editMode}
          isSelected={selectedAddresses.has(item.address)}
          onSelect={() => toggleSelection(item.address)}
          hasUnread={hasUnread}
        />
      );
    },
    [
      device.contacts, colors, typography,
      handleConversationPress, handleDeleteConversation, handleMarkReadUnread,
      drafts, openRowId, editMode, selectedAddresses, toggleSelection, effectiveHasUnread,
      setOpenRowId,
    ],
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

  const hasSelectedUnread = useMemo(
    () => [...selectedAddresses].some((addr) => {
      const conv = conversations.find((c) => c.address === addr);
      return conv ? effectiveHasUnread(conv) : false;
    }),
    [selectedAddresses, conversations, effectiveHasUnread],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemBackground }]}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerTopRow}>
          {editMode ? (
            <Pressable
              onPress={toggleEditMode}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Cancel edit mode"
            >
              <Text style={[typography.body, { color: colors.systemBlue }]}>Cancel</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={8}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={28} color={colors.systemBlue} />
            </Pressable>
          )}

          <View style={styles.headerRight}>
            {!editMode && (
              <>
                <Pressable
                  onPress={toggleEditMode}
                  hitSlop={8}
                  style={{ marginRight: 16 }}
                  accessibilityRole="button"
                  accessibilityLabel="Edit conversations"
                >
                  <Text style={[typography.body, { color: colors.systemBlue }]}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={handleComposePress}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Compose new message"
                >
                  <Ionicons name="create-outline" size={24} color={colors.systemBlue} />
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* Large title */}
        <Text style={[styles.largeTitle, { color: colors.label }]}>
          Messages
        </Text>

        {/* Search bar */}
        {!editMode && (
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
        )}
      </View>

      {/* List or loading */}
      {!device.isReady ? (
        <View style={{ flex: 1, paddingTop: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonListRow key={i} />
          ))}
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
            filtered.length === 0
              ? styles.emptyList
              : { paddingBottom: editMode ? insets.bottom + 60 : 20 }
          }
        />
      )}

      {/* Edit mode bottom toolbar */}
      {editMode && (
        <View
          style={[
            styles.editToolbar,
            {
              paddingBottom: insets.bottom + 8,
              backgroundColor: colors.systemBackground,
              borderTopColor: colors.separator,
            },
          ]}
        >
          <Pressable
            onPress={handleBulkMarkRead}
            disabled={selectedAddresses.size === 0 || !hasSelectedUnread}
            style={[styles.editToolbarAction, { opacity: (selectedAddresses.size === 0 || !hasSelectedUnread) ? 0.4 : 1 }]}
          >
            <Text style={[typography.body, { color: colors.systemBlue }]}>Mark as Read</Text>
          </Pressable>
          <Pressable
            onPress={handleBulkDelete}
            disabled={selectedAddresses.size === 0}
            style={[styles.editToolbarAction, { opacity: selectedAddresses.size === 0 ? 0.4 : 1 }]}
          >
            <Text style={[typography.body, { color: colors.systemRed }]}>Delete</Text>
          </Pressable>
        </View>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
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
  checkboxSlot: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
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

  // Edit toolbar
  editToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  editToolbarAction: {
    paddingHorizontal: 24,
    paddingVertical: 8,
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
