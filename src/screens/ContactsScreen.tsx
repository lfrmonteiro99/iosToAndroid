import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, SectionList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoNavigationBar, CupertinoSearchBar } from '../components';

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
}

const CONTACTS: Contact[] = [
  { id: '1', firstName: 'Alice', lastName: 'Anderson', phone: '+1 (555) 100-1001', email: 'alice@example.com' },
  { id: '2', firstName: 'Bob', lastName: 'Baker', phone: '+1 (555) 100-1002' },
  { id: '3', firstName: 'Carol', lastName: 'Clark', phone: '+1 (555) 100-1003', email: 'carol@example.com' },
  { id: '4', firstName: 'David', lastName: 'Davis', phone: '+1 (555) 100-1004' },
  { id: '5', firstName: 'Emma', lastName: 'Evans', phone: '+1 (555) 100-1005', email: 'emma@example.com' },
  { id: '6', firstName: 'Frank', lastName: 'Fisher', phone: '+1 (555) 100-1006' },
  { id: '7', firstName: 'Grace', lastName: 'Garcia', phone: '+1 (555) 100-1007' },
  { id: '8', firstName: 'Henry', lastName: 'Hill', phone: '+1 (555) 100-1008', email: 'henry@example.com' },
  { id: '9', firstName: 'Iris', lastName: 'Ingram', phone: '+1 (555) 100-1009' },
  { id: '10', firstName: 'James', lastName: 'Johnson', phone: '+1 (555) 100-1010', email: 'james@example.com' },
  { id: '11', firstName: 'Karen', lastName: 'King', phone: '+1 (555) 100-1011' },
  { id: '12', firstName: 'Leo', lastName: 'Lopez', phone: '+1 (555) 100-1012' },
  { id: '13', firstName: 'Maria', lastName: 'Martinez', phone: '+1 (555) 100-1013', email: 'maria@example.com' },
  { id: '14', firstName: 'Nathan', lastName: 'Nelson', phone: '+1 (555) 100-1014' },
  { id: '15', firstName: 'Olivia', lastName: 'Owen', phone: '+1 (555) 100-1015', email: 'olivia@example.com' },
  { id: '16', firstName: 'Paul', lastName: 'Parker', phone: '+1 (555) 100-1016' },
  { id: '17', firstName: 'Quinn', lastName: 'Quinn', phone: '+1 (555) 100-1017' },
  { id: '18', firstName: 'Rachel', lastName: 'Robinson', phone: '+1 (555) 100-1018', email: 'rachel@example.com' },
  { id: '19', firstName: 'Sam', lastName: 'Smith', phone: '+1 (555) 100-1019' },
  { id: '20', firstName: 'Tina', lastName: 'Taylor', phone: '+1 (555) 100-1020', email: 'tina@example.com' },
  { id: '21', firstName: 'Uma', lastName: 'Underwood', phone: '+1 (555) 100-1021' },
  { id: '22', firstName: 'Victor', lastName: 'Vargas', phone: '+1 (555) 100-1022' },
  { id: '23', firstName: 'Wendy', lastName: 'Williams', phone: '+1 (555) 100-1023', email: 'wendy@example.com' },
  { id: '24', firstName: 'Xavier', lastName: 'Xu', phone: '+1 (555) 100-1024' },
  { id: '25', firstName: 'Yuki', lastName: 'Yamamoto', phone: '+1 (555) 100-1025' },
  { id: '26', firstName: 'Zara', lastName: 'Zhang', phone: '+1 (555) 100-1026', email: 'zara@example.com' },
];

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
}: {
  contact: Contact;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colors: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typography: any;
  isLast: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.systemGray5 : colors.secondarySystemGroupedBackground,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${contact.firstName} ${contact.lastName}`}
    >
      <View
        style={[
          styles.avatar,
          { backgroundColor: colors.systemGray4 },
        ]}
      >
        <Text style={[styles.avatarText, { color: colors.label }]}>
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
      </View>
    </Pressable>
  );
});

export function ContactsScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return CONTACTS;
    const q = searchQuery.toLowerCase();
    return CONTACTS.filter(
      (c) =>
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.phone.includes(q),
    );
  }, [searchQuery]);

  const sections = useMemo(() => groupByLetter(filteredContacts), [filteredContacts]);

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
      />
    ),
    [colors, typography],
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
      <CupertinoNavigationBar title="Contacts" largeTitle={false} />

      {/* Search */}
      <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.systemGroupedBackground }}>
        <CupertinoSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search"
        />
      </View>

      {/* Contact list */}
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

      {/* Section index (right side) */}
      <View style={[styles.sectionIndex, { top: insets.top + 44 + 48 }]}>
        {sectionLetters.map((letter) => (
          <Text
            key={letter}
            style={[styles.indexLetter, { color: colors.systemBlue }]}
          >
            {letter}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
