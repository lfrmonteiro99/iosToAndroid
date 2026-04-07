import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { useProfile } from '../store/ProfileStore';
import { useContacts } from '../store/ContactsStore';
import { useSettings } from '../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoButton,
  CupertinoCard,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoAlertDialog,
  CupertinoActionSheet,
} from '../components';

export function ProfileScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { profile } = useProfile();
  const { contacts, favorites, reset: resetContacts } = useContacts();
  const { reset: resetSettings } = useSettings();
  const { reset: resetProfile } = useProfile();

  const [showSignOut, setShowSignOut] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showAvatarSheet, setShowAvatarSheet] = useState(false);

  const stats = [
    { label: 'Contacts', value: String(contacts.length) },
    { label: 'Favorites', value: String(favorites.length) },
    { label: 'Following', value: '347' },
  ];

  const handleSignOut = () => {
    resetSettings();
    resetContacts();
    resetProfile();
    AsyncStorage.removeItem('@iostoandroid/theme_preference');
    setShowSignOut(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar title="Profile" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 90,
          alignItems: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => setShowAvatarSheet(true)} style={styles.avatarWrapper}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: colors.systemGray5,
                borderColor: colors.systemBackground,
              },
            ]}
          >
            <Ionicons name="person" size={60} color={colors.systemGray} />
          </View>
          <View style={[styles.cameraBadge, { backgroundColor: colors.systemBlue }]}>
            <Ionicons name="camera" size={14} color="#FFFFFF" />
          </View>
        </Pressable>

        <Text style={[typography.title1, { color: colors.label, marginTop: 16 }]}>
          {profile.name}
        </Text>
        <Text style={[typography.subhead, { color: colors.secondaryLabel, marginTop: 4 }]}>
          {profile.email}
        </Text>

        <View style={[styles.statsRow, { marginTop: spacing.lg }]}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statItem}>
              <Text style={[typography.title2, { color: colors.label }]}>
                {stat.value}
              </Text>
              <Text style={[typography.caption1, { color: colors.secondaryLabel, marginTop: 2 }]}>
                {stat.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={[styles.actionRow, { marginTop: spacing.lg }]}>
          <CupertinoButton
            title="Edit Profile"
            variant="filled"
            style={{ flex: 1 }}
            onPress={() => navigation.navigate('EditProfile')}
          />
          <CupertinoButton
            title="Share"
            variant="tinted"
            style={{ flex: 1 }}
            onPress={() => setShowShare(true)}
          />
        </View>

        <View style={[styles.fullWidth, { paddingHorizontal: spacing.md, marginTop: spacing.lg }]}>
          <CupertinoCard title="About">
            <Text style={[typography.body, { color: colors.label }]}>
              {profile.bio}
            </Text>
          </CupertinoCard>
        </View>

        <View style={[styles.fullWidth, { paddingHorizontal: spacing.md, marginTop: spacing.lg }]}>
          <CupertinoListSection header="Account">
            <CupertinoListTile
              title="Apple ID"
              leading={{ name: 'person-circle', color: '#FFF', backgroundColor: '#007AFF' }}
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {profile.appleId}
                </Text>
              }
              onPress={() => {}}
            />
            <CupertinoListTile
              title="iCloud"
              leading={{ name: 'cloud', color: '#FFF', backgroundColor: '#5AC8FA' }}
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {profile.icloudStorage}
                </Text>
              }
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Media & Purchases"
              leading={{ name: 'bag', color: '#FFF', backgroundColor: '#FF2D55' }}
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Find My"
              leading={{ name: 'location', color: '#FFF', backgroundColor: '#34C759' }}
              onPress={() => {}}
            />
          </CupertinoListSection>

          {__DEV__ && (
          <CupertinoListSection>
            <CupertinoListTile
              title="Components Gallery"
              leading={{ name: 'grid', color: '#FFF', backgroundColor: colors.systemBlue }}
              onPress={() => navigation.navigate('ComponentsGallery')}
            />
          </CupertinoListSection>
          )}

          <CupertinoListSection>
            <CupertinoListTile
              title="Sign Out"
              leading={{ name: 'log-out', color: '#FFF', backgroundColor: colors.systemRed }}
              showChevron={false}
              onPress={() => setShowSignOut(true)}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>

      <CupertinoAlertDialog
        visible={showSignOut}
        title="Sign Out"
        message="This will reset all settings, contacts, and profile data to defaults."
        actions={[
          { label: 'Cancel', style: 'cancel', onPress: () => setShowSignOut(false) },
          { label: 'Sign Out', style: 'destructive', onPress: handleSignOut },
        ]}
        onClose={() => setShowSignOut(false)}
      />

      <CupertinoActionSheet
        visible={showShare}
        title="Share Profile"
        options={[
          { label: 'Copy Link', onPress: () => setShowShare(false) },
          { label: 'Share via Messages', onPress: () => setShowShare(false) },
          { label: 'Share via Email', onPress: () => setShowShare(false) },
        ]}
        cancelLabel="Cancel"
        onClose={() => setShowShare(false)}
      />

      <CupertinoActionSheet
        visible={showAvatarSheet}
        title="Profile Photo"
        options={[
          {
            label: 'Take Photo',
            onPress: () => {
              setShowAvatarSheet(false);
              Alert.alert('Camera not available in demo');
            },
          },
          {
            label: 'Choose from Library',
            onPress: () => {
              setShowAvatarSheet(false);
              Alert.alert('Photo library not available in demo');
            },
          },
          {
            label: 'Remove Photo',
            destructive: true,
            onPress: () => setShowAvatarSheet(false),
          },
        ]}
        cancelLabel="Cancel"
        onClose={() => setShowAvatarSheet(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  avatarWrapper: {
    marginTop: 16,
    position: 'relative',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 40,
  },
  statItem: { alignItems: 'center' },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    width: '100%',
  },
  fullWidth: { width: '100%' },
});
