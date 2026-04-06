import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoSearchBar,
} from '../components';

interface SettingsItem {
  key: string;
  title: string;
  subtitle?: string;
  icon: string;
  iconBg: string;
  type: 'navigate' | 'switch';
  route?: string;
  trailing?: string;
}

const ALL_SETTINGS: { section: string; items: SettingsItem[] }[] = [
  {
    section: 'profile',
    items: [
      {
        key: 'profile',
        title: 'John Appleseed',
        subtitle: 'Apple ID, iCloud+, Media & Purchases',
        icon: 'person-circle',
        iconBg: '#8E8E93',
        type: 'navigate',
      },
    ],
  },
  {
    section: 'connectivity',
    items: [
      { key: 'airplane', title: 'Airplane Mode', icon: 'airplane', iconBg: '#FF9500', type: 'switch' },
      { key: 'wifi', title: 'Wi-Fi', icon: 'wifi', iconBg: '#007AFF', type: 'navigate', route: 'WiFi', trailing: 'Home' },
      { key: 'bluetooth', title: 'Bluetooth', icon: 'bluetooth', iconBg: '#007AFF', type: 'navigate', trailing: 'On' },
      { key: 'cellular', title: 'Cellular', icon: 'cellular', iconBg: '#34C759', type: 'navigate' },
      { key: 'hotspot', title: 'Personal Hotspot', icon: 'link', iconBg: '#34C759', type: 'navigate', trailing: 'Off' },
    ],
  },
  {
    section: 'notifications',
    items: [
      { key: 'notifications', title: 'Notifications', icon: 'notifications', iconBg: '#FF3B30', type: 'switch' },
      { key: 'sounds', title: 'Sounds & Haptics', icon: 'volume-high', iconBg: '#FF2D55', type: 'navigate' },
      { key: 'focus', title: 'Focus', icon: 'moon', iconBg: '#5856D6', type: 'navigate' },
      { key: 'screentime', title: 'Screen Time', icon: 'hourglass', iconBg: '#5856D6', type: 'navigate' },
    ],
  },
  {
    section: 'general',
    items: [
      { key: 'general', title: 'General', icon: 'settings', iconBg: '#8E8E93', type: 'navigate', route: 'General' },
      { key: 'display', title: 'Display & Brightness', icon: 'sunny', iconBg: '#007AFF', type: 'navigate', route: 'DisplayBrightness' },
      { key: 'wallpaper', title: 'Wallpaper', icon: 'image', iconBg: '#5AC8FA', type: 'navigate' },
      { key: 'accessibility', title: 'Accessibility', icon: 'accessibility', iconBg: '#007AFF', type: 'navigate' },
    ],
  },
];

export function SettingsScreen() {
  const { theme, typography, spacing, isDark, toggleTheme } = useTheme();
  const { colors } = theme;
  const navigation = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const insets = useSafeAreaInsets();

  const [airplaneMode, setAirplaneMode] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const switchStates: Record<string, { value: boolean; onChange: (v: boolean) => void }> = {
    airplane: { value: airplaneMode, onChange: setAirplaneMode },
    notifications: { value: notifications, onChange: setNotifications },
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
  }, [searchQuery]);

  const handleItemPress = (item: SettingsItem) => {
    if (item.route) {
      navigation.navigate(item.route);
    }
  };

  const renderItem = (item: SettingsItem) => {
    if (item.type === 'switch') {
      const state = switchStates[item.key];
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
            state ? (
              <CupertinoSwitch value={state.value} onValueChange={state.onChange} />
            ) : undefined
          }
          showChevron={false}
        />
      );
    }

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
          item.trailing ? (
            <Text style={[typography.body, { color: colors.secondaryLabel }]}>
              {item.trailing}
            </Text>
          ) : undefined
        }
        onPress={() => handleItemPress(item)}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Settings"
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      >
        {/* Search Bar */}
        <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
          <CupertinoSearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search Settings"
          />
        </View>

        {/* Filtered sections */}
        {filteredSections.map((section) => (
          <View key={section.section} style={{ paddingHorizontal: spacing.md }}>
            <CupertinoListSection>
              {section.items.map(renderItem)}
            </CupertinoListSection>
          </View>
        ))}

        {/* Dark Mode (always shown) */}
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
                  <CupertinoSwitch
                    value={isDark}
                    onValueChange={toggleTheme}
                  />
                }
                showChevron={false}
              />
            </CupertinoListSection>
          </View>
        )}
      </CupertinoNavigationBar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
