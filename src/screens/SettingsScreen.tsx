import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../theme/ThemeContext';
import { useSettings } from '../store/SettingsStore';
import { useDevice } from '../store/DeviceStore';
import { useProfile } from '../store/ProfileStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoSearchBar,
  BackEdgeSwipe,
} from '../components';
import type { AppNavigationProp, RootStackParamList } from '../navigation/types';

interface SettingsItem {
  key: string;
  title: string;
  subtitle?: string;
  icon: string;
  iconBg: string;
  type: 'navigate' | 'switch';
  route?: keyof RootStackParamList;
  settingsKey?: string;
}

export function SettingsScreen() {
  const { theme, typography, spacing, isDark, toggleTheme } = useTheme();
  const { colors } = theme;
  const navigation = useNavigation<AppNavigationProp>();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const device = useDevice();
  const { profile } = useProfile();

  const [searchQuery, setSearchQuery] = React.useState('');

  const ALL_SETTINGS: { section: string; items: SettingsItem[] }[] = useMemo(() => [
    {
      section: 'profile',
      items: [
        { key: 'profile', title: profile.name, subtitle: profile.email || 'Google Account & Cloud Settings', icon: 'person-circle', iconBg: '#8E8E93', type: 'navigate', route: 'ProfileMain' },
      ],
    },
    {
      section: 'connectivity',
      items: [
        { key: 'airplane', title: 'Airplane Mode', icon: 'airplane', iconBg: '#FF9500', type: 'navigate' },
        { key: 'wifi', title: 'Wi-Fi', icon: 'wifi', iconBg: colors.accent, type: 'navigate', route: 'WiFi' },
        { key: 'bluetooth', title: 'Bluetooth', icon: 'bluetooth', iconBg: colors.accent, type: 'navigate', route: 'Bluetooth' },
        { key: 'cellular', title: 'Cellular', icon: 'cellular', iconBg: '#34C759', type: 'navigate', route: 'Cellular' },
        { key: 'hotspot', title: 'Personal Hotspot', icon: 'link', iconBg: '#34C759', type: 'navigate', route: 'Hotspot' },
      ],
    },
    {
      section: 'notifications',
      items: [
        { key: 'notifications', title: 'Notifications', icon: 'notifications', iconBg: '#FF3B30', type: 'navigate', route: 'Notifications' },
        { key: 'sounds', title: 'Sounds & Haptics', icon: 'volume-high', iconBg: '#FF2D55', type: 'navigate', route: 'SoundsHaptics' },
        { key: 'focus', title: 'Focus', icon: 'moon', iconBg: '#5856D6', type: 'navigate', route: 'Focus' },
        { key: 'screentime', title: 'Screen Time', icon: 'hourglass', iconBg: '#5856D6', type: 'navigate', route: 'ScreenTime' },
      ],
    },
    {
      section: 'general',
      items: [
        { key: 'general', title: 'General', icon: 'settings', iconBg: '#8E8E93', type: 'navigate', route: 'General' },
        { key: 'display', title: 'Display & Brightness', icon: 'sunny', iconBg: colors.accent, type: 'navigate', route: 'DisplayBrightness' },
        { key: 'wallpaper', title: 'Wallpaper', icon: 'image', iconBg: '#5AC8FA', type: 'navigate', route: 'Wallpaper' },
        { key: 'accessibility', title: 'Accessibility', icon: 'accessibility', iconBg: colors.accent, type: 'navigate', route: 'Accessibility' },
      ],
    },
    {
      section: 'extra',
      items: [
        { key: 'battery', title: 'Battery', icon: 'battery-half', iconBg: '#34C759', type: 'navigate', route: 'Battery' },
        { key: 'privacy', title: 'Privacy & Security', icon: 'shield-checkmark', iconBg: colors.accent, type: 'navigate', route: 'Privacy' },
      ],
    },
  ], [colors.accent, profile.name, profile.email]);

  const getTrailing = (item: SettingsItem): string | undefined => {
    switch (item.key) {
      case 'airplane': return settings.airplaneMode ? 'On' : undefined;
      case 'wifi': return device.wifi.enabled ? device.wifi.ssid || 'On' : 'Off';
      case 'bluetooth': return device.bluetooth.enabled ? device.bluetooth.name || 'On' : 'Off';
      case 'hotspot': return settings.hotspotEnabled ? 'On' : 'Off';
      case 'focus': return settings.focusMode !== 'off' ? settings.focusMode.charAt(0).toUpperCase() + settings.focusMode.slice(1) : undefined;
      case 'screentime': return settings.screenTimeEnabled ? 'On' : 'Off';
      case 'battery': return settings.lowPowerMode ? 'Low Power' : undefined;
      default: return undefined;
    }
  };

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return ALL_SETTINGS;
    const q = searchQuery.toLowerCase();
    return ALL_SETTINGS.map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q)),
      ),
    })).filter((section) => section.items.length > 0);
  }, [searchQuery, ALL_SETTINGS]);

  const handleItemPress = (item: SettingsItem) => {
    if (item.key === 'airplane') {
      // In-app airplane mode toggle (cosmetic — persisted in settings)
      return;
    }
    if (item.route) {
      (navigation as AppNavigationProp).navigate(item.route as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- route is a dynamic key from config
    }
  };

  const renderItem = (item: SettingsItem) => {
    if (item.key === 'profile') {
      return (
        <Pressable
          key={item.key}
          onPress={() => item.route && (navigation as AppNavigationProp).navigate(item.route as any)} // eslint-disable-line @typescript-eslint/no-explicit-any -- route is a dynamic key from config
          style={({ pressed }) => [
            styles.profileCard,
            { backgroundColor: pressed ? colors.systemGray5 : colors.secondarySystemGroupedBackground },
          ]}
          accessibilityRole="button"
          accessibilityLabel={item.title}
        >
          <View style={[styles.profileAvatar, { backgroundColor: colors.systemGray4 }]}>
            <Ionicons name="person-outline" size={28} color={colors.secondaryLabel} />
          </View>
          <View style={styles.profileMeta}>
            <Text style={[typography.headline, { color: colors.label }]}>{item.title}</Text>
            {item.subtitle ? (
              <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: 2 }]} numberOfLines={2}>
                {item.subtitle}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.systemGray3} />
        </Pressable>
      );
    }

    if (item.type === 'switch' && item.settingsKey) {
      const key = item.settingsKey as keyof typeof settings;
      const isSearching = searchQuery.trim().length > 0;
      return (
        <CupertinoListTile
          key={item.key}
          title={item.title}
          subtitle={item.subtitle}
          leading={{
            name: item.icon as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            color: '#FFFFFF',
            backgroundColor: item.iconBg,
          }}
          trailing={
            isSearching ? (
              <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                {settings[key] ? 'On' : 'Off'}
              </Text>
            ) : (
              <CupertinoSwitch
                value={settings[key] as boolean}
                onValueChange={(v: boolean) => update(key, v as any)} // eslint-disable-line @typescript-eslint/no-explicit-any
              />
            )
          }
          showChevron={false}
        />
      );
    }

    const trailing = getTrailing(item);
    return (
      <CupertinoListTile
        key={item.key}
        title={item.title}
        subtitle={item.subtitle}
        leading={{
          name: item.icon as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          color: '#FFFFFF',
          backgroundColor: item.iconBg,
        }}
        trailing={
          trailing ? (
            <Text style={[typography.body, { color: colors.secondaryLabel }]}>
              {trailing}
            </Text>
          ) : undefined
        }
        onPress={() => handleItemPress(item)}
      />
    );
  };

  return (
    <BackEdgeSwipe>
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <CupertinoNavigationBar
        title="Settings"
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        leftButton={
          <Pressable onPress={() => navigation.goBack()} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="chevron-back" size={28} color={colors.systemBlue} />
          </Pressable>
        }
      >
        <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
          <CupertinoSearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search Settings"
          />
        </View>

        {filteredSections.map((section) => (
          <View key={section.section} style={{ paddingHorizontal: spacing.md }}>
            <CupertinoListSection>
              {section.items.map(renderItem)}
            </CupertinoListSection>
          </View>
        ))}

        {!searchQuery.trim() && (
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
                  <CupertinoSwitch value={isDark} onValueChange={toggleTheme} />
                }
                showChevron={false}
              />
            </CupertinoListSection>
          </View>
        )}
      </CupertinoNavigationBar>
    </View>
    </BackEdgeSwipe>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  profileAvatar: {
    width: 50,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileMeta: {
    flex: 1,
  },
});
