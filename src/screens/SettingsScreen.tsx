import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../components';

export function SettingsScreen() {
  const { theme, typography, spacing, borderRadius, isDark, toggleTheme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [airplaneMode, setAirplaneMode] = useState(false);
  const [wifi, setWifi] = useState(true);
  const [bluetooth, setBluetooth] = useState(true);
  const [notifications, setNotifications] = useState(true);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar title="Settings" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Row */}
        <View style={{ paddingHorizontal: spacing.md, marginBottom: 8 }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="John Appleseed"
              subtitle="Apple ID, iCloud+, Media & Purchases"
              leading={{
                name: 'person-circle',
                color: '#FFFFFF',
                backgroundColor: colors.systemGray,
              }}
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>

        {/* Connectivity */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Airplane Mode"
              leading={{
                name: 'airplane',
                color: '#FFFFFF',
                backgroundColor: '#FF9500',
              }}
              trailing={
                <CupertinoSwitch
                  value={airplaneMode}
                  onValueChange={setAirplaneMode}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Wi-Fi"
              leading={{
                name: 'wifi',
                color: '#FFFFFF',
                backgroundColor: '#007AFF',
              }}
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  Home
                </Text>
              }
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Bluetooth"
              leading={{
                name: 'bluetooth',
                color: '#FFFFFF',
                backgroundColor: '#007AFF',
              }}
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  On
                </Text>
              }
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Cellular"
              leading={{
                name: 'cellular',
                color: '#FFFFFF',
                backgroundColor: '#34C759',
              }}
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Personal Hotspot"
              leading={{
                name: 'link',
                color: '#FFFFFF',
                backgroundColor: '#34C759',
              }}
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  Off
                </Text>
              }
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>

        {/* Notifications & Focus */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Notifications"
              leading={{
                name: 'notifications',
                color: '#FFFFFF',
                backgroundColor: '#FF3B30',
              }}
              trailing={
                <CupertinoSwitch
                  value={notifications}
                  onValueChange={setNotifications}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Sounds & Haptics"
              leading={{
                name: 'volume-high',
                color: '#FFFFFF',
                backgroundColor: '#FF2D55',
              }}
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Focus"
              leading={{
                name: 'moon',
                color: '#FFFFFF',
                backgroundColor: '#5856D6',
              }}
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Screen Time"
              leading={{
                name: 'hourglass',
                color: '#FFFFFF',
                backgroundColor: '#5856D6',
              }}
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>

        {/* General */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="General"
              leading={{
                name: 'settings',
                color: '#FFFFFF',
                backgroundColor: '#8E8E93',
              }}
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Display & Brightness"
              leading={{
                name: 'sunny',
                color: '#FFFFFF',
                backgroundColor: '#007AFF',
              }}
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Wallpaper"
              leading={{
                name: 'image',
                color: '#FFFFFF',
                backgroundColor: '#5AC8FA',
              }}
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Accessibility"
              leading={{
                name: 'accessibility',
                color: '#FFFFFF',
                backgroundColor: '#007AFF',
              }}
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>

        {/* Appearance */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Appearance">
            <CupertinoListTile
              title="Dark Mode"
              leading={{
                name: 'moon',
                color: '#FFFFFF',
                backgroundColor: '#000000',
              }}
              trailing={
                <CupertinoSwitch
                  value={isDark}
                  onValueChange={toggleTheme}
                />
              }
              showChevron={false}
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
});
