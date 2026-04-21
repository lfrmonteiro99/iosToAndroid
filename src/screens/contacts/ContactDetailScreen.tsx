import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useContacts } from '../../store/ContactsStore';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoButton,
  CupertinoAlertDialog,
  BackEdgeSwipe,
} from '../../components';
import type { AppNavigationProp, AppRouteProp } from '../../navigation/types';

const getLauncher = async () => {
  try {
    return (await import('../../../modules/launcher-module/src')).default;
  } catch {
    return null; // Expected: module unavailable on non-Android
  }
};

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

interface ContactDetailScreenProps {
  navigation: AppNavigationProp;
  route: AppRouteProp<'ContactDetail'>;
}

export function ContactDetailScreen({ navigation, route }: ContactDetailScreenProps) {
  const { contactId } = route.params;
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const { getContact, toggleFavorite, deleteContact, deviceFavoriteIds } = useContacts();
  const { contacts: deviceContacts } = useDevice();
  const insets = useSafeAreaInsets();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);

  const contact = useMemo(() => {
    const deviceContact = deviceContacts.find(c => c.id === contactId);
    if (deviceContact) {
      return {
        id: deviceContact.id,
        firstName: deviceContact.firstName,
        lastName: deviceContact.lastName,
        phone: deviceContact.phone,
        email: deviceContact.email,
        company: deviceContact.company,
        notes: '',
        isFavorite: deviceFavoriteIds.includes(deviceContact.id),
        createdAt: '',
        _imageUri: deviceContact.imageUri,
        _isDeviceContact: true,
      };
    }
    const mockContact = getContact(contactId);
    return mockContact ? { ...mockContact, _imageUri: undefined, _isDeviceContact: false } : null;
  }, [contactId, deviceContacts, getContact, deviceFavoriteIds]);

  const isDeviceContact = contact?._isDeviceContact ?? false;
  const imageUri = contact?._imageUri;

  if (!contact) {
    return (
      <BackEdgeSwipe>
      <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
        <CupertinoNavigationBar
          title="Contact"
          largeTitle={false}
          leftButton={
            <Pressable onPress={() => navigation.goBack()} style={styles.navButton} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="chevron-back" size={22} color={colors.systemBlue} />
              <Text style={[typography.body, { color: colors.systemBlue }]}>Contacts</Text>
            </Pressable>
          }
        />
        <View style={styles.notFound}>
          <Text style={[typography.body, { color: colors.secondaryLabel }]}>Contact not found.</Text>
        </View>
      </View>
      </BackEdgeSwipe>
    );
  }

  const initials = getInitials(contact.firstName, contact.lastName);
  const fullName = `${contact.firstName} ${contact.lastName}`;

  const handleCall = async () => {
    const mod = await getLauncher();
    if (mod && contact.phone) {
      await mod.makeCall(contact.phone);
    } else if (contact.phone) {
      Linking.openURL(`tel:${contact.phone}`);
    }
  };

  const handleMessage = () => {
    // Navigate to in-app ConversationScreen instead of opening Android SMS app
    navigation.navigate('Conversation', { address: contact.phone });
  };

  const handleMail = () => {
    // Navigate to in-app Mail screen with composed draft (no Android email app)
    if (contact.email) {
      navigation.navigate('Mail', { composeTo: contact.email });
    }
  };

  const actionButtons = [
    { icon: 'call-outline' as const, label: 'call', onPress: handleCall },
    { icon: 'chatbubble-outline' as const, label: 'message', onPress: handleMessage },
    { icon: 'mail-outline' as const, label: 'mail', onPress: handleMail },
  ];

  return (
    <BackEdgeSwipe>
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title={fullName}
        largeTitle={false}
        leftButton={
          <Pressable onPress={() => navigation.goBack()} style={styles.navButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={22} color={colors.systemBlue} />
            <Text style={[typography.body, { color: colors.systemBlue }]}>Contacts</Text>
          </Pressable>
        }
        rightButton={
          <View style={styles.navRightRow}>
            <Pressable
              onPress={() => toggleFavorite(contactId)}
              hitSlop={8}
              style={styles.navIconButton}
              accessibilityLabel={contact.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Ionicons
                name={contact.isFavorite ? 'star' : 'star-outline'}
                size={22}
                color={contact.isFavorite ? colors.systemBlue : colors.systemBlue}
              />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('ContactEdit', { contactId })}
              hitSlop={8}
              style={styles.navIconButton}
            >
              <Text style={[typography.body, { color: colors.systemBlue }]}>Edit</Text>
            </Pressable>
          </View>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + name */}
        <View style={styles.header}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.systemBlue }]}>
              <Text style={[typography.title1, styles.avatarText]}>{initials}</Text>
            </View>
          )}
          <Text style={[typography.title1, { color: colors.label, marginTop: spacing.md }]}>
            {fullName}
          </Text>
          {contact.company ? (
            <Text style={[typography.subhead, { color: colors.secondaryLabel, marginTop: 4 }]}>
              {contact.company}
            </Text>
          ) : null}
        </View>

        {/* Action buttons row */}
        <View style={[styles.actionRow, { marginBottom: spacing.lg }]}>
          {actionButtons.map((btn) => (
            <Pressable
              key={btn.label}
              onPress={btn.onPress}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: pressed ? colors.systemGray4 : colors.secondarySystemGroupedBackground,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              accessibilityLabel={btn.label}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: colors.systemBlue }]}>
                <Ionicons name={btn.icon} size={20} color="#FFFFFF" />
              </View>
              <Text style={[typography.caption2, { color: colors.secondaryLabel, marginTop: 4 }]}>
                {btn.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Phone */}
        <CupertinoListSection header="Phone">
          <CupertinoListTile
            title={contact.phone}
            showChevron={false}
            onPress={handleCall}
            trailing={
              <Text style={[typography.body, { color: colors.secondaryLabel }]}>mobile</Text>
            }
          />
        </CupertinoListSection>

        {/* Email */}
        {contact.email ? (
          <CupertinoListSection header="Email">
            <CupertinoListTile
              title={contact.email}
              showChevron={false}
              onPress={handleMail}
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>home</Text>
              }
            />
          </CupertinoListSection>
        ) : null}

        {/* Notes */}
        {contact.notes ? (
          <CupertinoListSection header="Notes">
            <CupertinoListTile
              title={contact.notes}
              showChevron={false}
            />
          </CupertinoListSection>
        ) : null}

        {/* Delete — only for mock contacts */}
        {!isDeviceContact ? (
          <View style={[styles.deleteContainer, { marginTop: spacing.lg }]}>
            <CupertinoButton
              title="Delete Contact"
              variant="plain"
              destructive
              onPress={() => setShowDeleteAlert(true)}
            />
          </View>
        ) : null}
      </ScrollView>

      <CupertinoAlertDialog
        visible={showDeleteAlert}
        onClose={() => setShowDeleteAlert(false)}
        title="Delete Contact"
        message={`Are you sure you want to delete ${fullName}? This action cannot be undone.`}
        actions={[
          {
            label: 'Cancel',
            style: 'cancel',
            onPress: () => setShowDeleteAlert(false),
          },
          {
            label: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteContact(contactId);
              navigation.goBack();
            },
          },
        ]}
      />
    </View>
    </BackEdgeSwipe>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navIconButton: {
    padding: 2,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    maxWidth: 80,
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
