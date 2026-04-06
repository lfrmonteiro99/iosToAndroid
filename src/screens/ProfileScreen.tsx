import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoButton,
  CupertinoCard,
  CupertinoListSection,
  CupertinoListTile,
} from '../components';

export function ProfileScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const stats = [
    { label: 'Posts', value: '128' },
    { label: 'Followers', value: '1.2K' },
    { label: 'Following', value: '347' },
  ];

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
        {/* Avatar */}
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

        {/* Name & Email */}
        <Text style={[typography.title1, { color: colors.label, marginTop: 16 }]}>
          John Appleseed
        </Text>
        <Text style={[typography.subhead, { color: colors.secondaryLabel, marginTop: 4 }]}>
          john.appleseed@icloud.com
        </Text>

        {/* Stats Row */}
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

        {/* Action Buttons */}
        <View style={[styles.actionRow, { marginTop: spacing.lg }]}>
          <CupertinoButton title="Edit Profile" variant="filled" style={{ flex: 1 }} />
          <CupertinoButton title="Share" variant="tinted" style={{ flex: 1 }} />
        </View>

        {/* Bio Card */}
        <View style={[styles.fullWidth, { paddingHorizontal: spacing.md, marginTop: spacing.lg }]}>
          <CupertinoCard title="About">
            <Text style={[typography.body, { color: colors.label }]}>
              Designer & developer based in Cupertino. Passionate about creating
              beautiful user interfaces that feel right at home on any platform.
              Currently working on bringing iOS aesthetics to Android.
            </Text>
          </CupertinoCard>
        </View>

        {/* Account Section */}
        <View style={[styles.fullWidth, { paddingHorizontal: spacing.md, marginTop: spacing.lg }]}>
          <CupertinoListSection header="Account">
            <CupertinoListTile
              title="Apple ID"
              leading={{ name: 'person-circle', color: '#FFF', backgroundColor: '#007AFF' }}
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  john@icloud.com
                </Text>
              }
              onPress={() => {}}
            />
            <CupertinoListTile
              title="iCloud"
              leading={{ name: 'cloud', color: '#FFF', backgroundColor: '#5AC8FA' }}
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  50 GB
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

          <CupertinoListSection>
            <CupertinoListTile
              title="Sign Out"
              leading={{ name: 'log-out', color: '#FFF', backgroundColor: colors.systemRed }}
              showChevron={false}
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderWidth: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 40,
  },
  statItem: {
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    width: '100%',
  },
  fullWidth: {
    width: '100%',
  },
});
