import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, Image, SectionList, StyleSheet, Pressable, RefreshControl, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../theme/ThemeContext';
import { useContacts } from '../store/ContactsStore';
import { useDevice, DeviceContact } from '../store/DeviceStore';
import { CupertinoNavigationBar, CupertinoSearchBar, CupertinoActionSheet, CupertinoButton } from '../components';

function groupByLetter(contacts: DeviceContact[]) {
  const groups: Record<string, DeviceContact[]> = {};
  for (const contact of contacts) {
    const letter = (contact.lastName[0] || contact.firstName[0] || '#').toUpperCase();
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
  onLongPress,
}: {
  contact: DeviceContact;
  colors: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  typography: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  isLast: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
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
      <View style={[styles.avatar, { backgroundColor: colors.systemGray4 }]}>
        {contact.imageUri ? (
          <Image source={{ uri: contact.imageUri }} style={styles.avatarImage} />
        ) : (
          <Text style={[styles.avatarText, { color: colors.label }]}>
            {contact.firstName[0] || ''}{contact.lastName[0] || ''}
          </Text>
        )}
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
      <Ionicons name="chevron-forward" size={14} color={colors.systemGray3} style={{ marginRight: 12 }} />
    </Pressable>
  );
});

export function ContactsScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  // Keep useContacts available for ContactDetail navigation compatibility
  useContacts();
  const { contacts: deviceContacts, requestContactsPermission } = useDevice();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [contextContact, setContextContact] = useState<DeviceContact | null>(null);

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return deviceContacts;
    const q = searchQuery.toLowerCase();
    return deviceContacts.filter(
      (c) =>
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.phone.includes(q),
    );
  }, [searchQuery, deviceContacts]);

  const sections = useMemo(() => groupByLetter(filteredContacts), [filteredContacts]);

  const sectionLetters = useMemo(() => sections.map((s) => s.title), [sections]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const renderItem = useCallback(
    ({ item, section, index }: { item: DeviceContact; section: { data: DeviceContact[] }; index: number }) => (
      <ContactRow
        contact={item}
        colors={colors}
        typography={typography}
        isLast={index === section.data.length - 1}
        onPress={() => navigation.navigate('ContactDetail', { contactId: item.id })}
        onLongPress={() => setContextContact(item)}
      />
    ),
    [colors, typography, navigation],
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
            typography.footnote,
            { color: colors.label, fontWeight: '600' },
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
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <CupertinoNavigationBar
        title="Contacts"
        largeTitle={false}
        leftButton={
          <Pressable onPress={() => navigation.goBack()} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="chevron-back" size={28} color={colors.systemBlue} />
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
        decelerationRate={0.998}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="person-outline" size={48} color={colors.systemGray3} />
            <Text style={[typography.body, { color: colors.secondaryLabel, marginTop: 12 }]}>
              No contacts found
            </Text>
            <View style={{ marginTop: 16 }}>
              <CupertinoButton
                title="Grant Contacts Permission"
                variant="filled"
                onPress={requestContactsPermission}
              />
            </View>
          </View>
        }
      />

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
            label: 'Send Message',
            onPress: () => Linking.openURL(`sms:${contextContact.phone}`),
          },
          {
            label: 'Add to Favorites',
            onPress: () => { /* future: persist to local favorites */ },
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
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
