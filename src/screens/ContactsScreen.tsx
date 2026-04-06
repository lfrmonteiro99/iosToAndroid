import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, SectionList, StyleSheet, Pressable, RefreshControl, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useContacts, Contact } from '../store/ContactsStore';
import { CupertinoNavigationBar, CupertinoSearchBar, CupertinoSwipeableRow, CupertinoActionSheet } from '../components';

function groupByLetter(contacts: Contact[]) {
  const groups: Record<string, Contact[]> = {};
  for (const contact of contacts) {
    const letter = contact.lastName[0].toUpperCase();
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(contact);
  }
  return Object.keys(groups)
    .sort()
    .map((letter) => ({
      title: letter,
      data: groups[letter].sort((a, b) => a.lastName.localeCompare(b.lastName)),
    }));
}

const ContactRow = React.memo(function ContactRow({
  contact,
  colors,
  typography,
  isLast,
  onPress,
  onDelete,
  onLongPress,
}: {
  contact: Contact;
  colors: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  typography: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  isLast: boolean;
  onPress: () => void;
  onDelete: () => void;
  onLongPress: () => void;
}) {
  return (
    <CupertinoSwipeableRow
      trailingActions={[
        { label: 'Delete', color: '#FF3B30', onPress: onDelete },
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: pressed ? colors.systemGray5 : colors.secondarySystemGroupedBackground,
          },
        ]}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={`${contact.firstName} ${contact.lastName}`}
      >
        <View style={[styles.avatar, { backgroundColor: contact.isFavorite ? colors.systemBlue : colors.systemGray4 }]}>
          <Text style={[styles.avatarText, { color: contact.isFavorite ? '#FFFFFF' : colors.label }]}>
            {contact.firstName[0]}{contact.lastName[0]}
          </Text>
        </View>
        <View
          style={[
            styles.rowContent,
            !isLast && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.separator,
            },
          ]}
        >
          <Text style={[typography.body, { color: colors.label }]}>
            <Text style={{ fontWeight: '400' }}>{contact.firstName} </Text>
            <Text style={{ fontWeight: '600' }}>{contact.lastName}</Text>
          </Text>
          {contact.company ? (
            <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
              {contact.company}
            </Text>
          ) : null}
        </View>
        {contact.isFavorite && (
          <Ionicons name="star" size={14} color={colors.systemYellow} style={{ marginRight: 12 }} />
        )}
      </Pressable>
    </CupertinoSwipeableRow>
  );
});

export function ContactsScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { contacts, favorites, deleteContact, toggleFavorite } = useContacts();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [contextContact, setContextContact] = useState<Contact | null>(null);

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(
      (c) =>
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.phone.includes(q),
    );
  }, [searchQuery, contacts]);

  const sections = useMemo(() => {
    const groups = groupByLetter(filteredContacts);
    if (!searchQuery.trim() && favorites.length > 0) {
      return [{ title: '★ Favorites', data: favorites }, ...groups];
    }
    return groups;
  }, [filteredContacts, favorites, searchQuery]);

  const sectionLetters = useMemo(() => sections.map((s) => s.title), [sections]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const renderItem = useCallback(
    ({ item, section, index }: { item: Contact; section: { data: Contact[] }; index: number }) => (
      <ContactRow
        contact={item}
        colors={colors}
        typography={typography}
        isLast={index === section.data.length - 1}
        onPress={() => navigation.navigate('ContactDetail', { contactId: item.id })}
        onDelete={() => deleteContact(item.id)}
        onLongPress={() => setContextContact(item)}
      />
    ),
    [colors, typography, navigation, deleteContact],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => (
      <View
        style={[
          styles.sectionHeader,
          { backgroundColor: colors.systemGroupedBackground },
        ]}
      >
        <Text
          style={[
            typography.subhead,
            { color: colors.label, fontWeight: '700' },
          ]}
        >
          {section.title}
        </Text>
      </View>
    ),
    [colors, typography],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Contacts"
        largeTitle={false}
        rightButton={
          <Pressable onPress={() => navigation.navigate('ContactEdit')}>
            <Ionicons name="add" size={28} color={colors.systemBlue} />
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.systemGroupedBackground }}>
        <CupertinoSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="person-outline" size={48} color={colors.systemGray3} />
            <Text style={[typography.body, { color: colors.secondaryLabel, marginTop: 12 }]}>
              No contacts found
            </Text>
          </View>
        }
      />

      <View style={[styles.sectionIndex, { top: insets.top + 44 + 48 }]}>
        {sectionLetters.map((letter) => (
          <Text
            key={letter}
            style={[styles.indexLetter, { color: colors.systemBlue }]}
          >
            {letter.length === 1 ? letter : '★'}
          </Text>
        ))}
      </View>

      <CupertinoActionSheet
        visible={contextContact !== null}
        onClose={() => setContextContact(null)}
        title={contextContact ? `${contextContact.firstName} ${contextContact.lastName}` : undefined}
        options={contextContact ? [
          {
            label: 'Call',
            onPress: () => Linking.openURL(`tel:${contextContact.phone}`),
          },
          {
            label: contextContact.isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
            onPress: () => toggleFavorite(contextContact.id),
          },
          {
            label: 'Send Message',
            onPress: () => Linking.openURL(`sms:${contextContact.phone}`),
          },
          {
            label: 'Delete',
            onPress: () => deleteContact(contextContact.id),
            destructive: true,
          },
        ] : []}
        cancelLabel="Cancel"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    minHeight: 44,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '500',
  },
  rowContent: {
    flex: 1,
    paddingRight: 16,
    paddingVertical: 10,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  sectionIndex: {
    position: 'absolute',
    right: 2,
    bottom: 90,
    alignItems: 'center',
  },
  indexLetter: {
    fontSize: 10,
    fontWeight: '600',
    paddingVertical: 1,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
});
