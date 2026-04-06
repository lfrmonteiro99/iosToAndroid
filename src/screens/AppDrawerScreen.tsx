/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  StyleSheet,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useApps, InstalledApp } from '../store/AppsStore';
import { useDevice } from '../store/DeviceStore';
import { useTheme } from '../theme/ThemeContext';
import { StatusBar } from 'expo-status-bar';
import { CupertinoSearchBar } from '../components/CupertinoSearchBar';
import { CupertinoNavigationBar } from '../components/CupertinoNavigationBar';
import { CupertinoActionSheet } from '../components/CupertinoActionSheet';
import { CupertinoActivityIndicator } from '../components/CupertinoActivityIndicator';

interface AppDrawerScreenProps {
  navigation: any;
  route: any;
}

const ICON_SIZE = 56;
const ICON_BORDER_RADIUS = 14;
const NUM_COLUMNS = 4;

const SETTINGS_ITEMS = [
  { name: 'Wi-Fi', route: 'WiFi', icon: 'wifi' as const },
  { name: 'Bluetooth', route: 'Bluetooth', icon: 'bluetooth' as const },
  { name: 'Display & Brightness', route: 'DisplayBrightness', icon: 'sunny' as const },
  { name: 'Wallpaper', route: 'Wallpaper', icon: 'image' as const },
  { name: 'General', route: 'General', icon: 'settings' as const },
  { name: 'Battery', route: 'Battery', icon: 'battery-half' as const },
  { name: 'Privacy', route: 'Privacy', icon: 'shield-checkmark' as const },
  { name: 'Notifications', route: 'Notifications', icon: 'notifications' as const },
];

export function AppDrawerScreen({ navigation, route }: AppDrawerScreenProps) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const { apps, dockApps, launchApp, addToDock, isLoading } = useApps();
  const device = useDevice();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const searchFocused: boolean = route?.params?.searchFocused ?? false;

  const [query, setQuery] = useState('');
  const [autoFocus, setAutoFocus] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedApp, setSelectedApp] = useState<InstalledApp | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);

  const cellWidth = width / NUM_COLUMNS;

  // Defer autoFocus so the nav bar renders first
  useEffect(() => {
    if (searchFocused) {
      const timer = setTimeout(() => setAutoFocus(true), 300);
      return () => clearTimeout(timer);
    }
  }, [searchFocused]);

  // Sort alphabetically and filter by query
  const filteredApps = useMemo(() => {
    const sorted = [...apps].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
    if (!query.trim()) return sorted;
    const q = query.trim().toLowerCase();
    return sorted.filter(app => app.name.toLowerCase().includes(q));
  }, [apps, query]);

  const contactResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return device.contacts.filter(c =>
      (c.firstName + ' ' + c.lastName).toLowerCase().includes(q)
    ).slice(0, 5);
  }, [query, device.contacts]);

  const settingsResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return SETTINGS_ITEMS.filter(s => s.name.toLowerCase().includes(q));
  }, [query]);

  const isSearching = query.trim().length > 0;
  const showSuggestions = isFocused && !query.trim();

  const siriSuggestions = useMemo(() => filteredApps.slice(0, 4), [filteredApps]);
  const recentContacts = useMemo(() => device.contacts.slice(0, 3), [device.contacts]);

  const dockPackageNames = useMemo(
    () => new Set(dockApps.map(a => a.packageName)),
    [dockApps]
  );

  const handleLongPress = useCallback((app: InstalledApp) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedApp(app);
    setActionSheetVisible(true);
  }, []);

  const handleCloseActionSheet = useCallback(() => {
    setActionSheetVisible(false);
    setSelectedApp(null);
  }, []);

  const openAppInfo = useCallback((packageName: string) => {
    Linking.openURL(`package:${packageName}`).catch(() => {
      // Fallback: open general settings if package: scheme fails
      Linking.openSettings();
    });
  }, []);

  const actionSheetOptions = useMemo(() => {
    if (!selectedApp) return [];

    const options: { label: string; onPress: () => void; destructive?: boolean }[] = [
      {
        label: 'Open',
        onPress: () => launchApp(selectedApp.packageName),
      },
    ];

    if (!dockPackageNames.has(selectedApp.packageName)) {
      options.push({
        label: 'Add to Dock',
        onPress: () => addToDock(selectedApp.packageName),
      });
    }

    options.push({
      label: 'App Info',
      onPress: () => openAppInfo(selectedApp.packageName),
    });

    return options;
  }, [selectedApp, dockPackageNames, launchApp, addToDock, openAppInfo]);

  const renderItem = useCallback(
    ({ item }: { item: InstalledApp }) => (
      <Pressable
        style={[styles.gridCell, { width: cellWidth }]}
        onPress={() => launchApp(item.packageName)}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
        android_ripple={null}
      >
        {item.icon ? (
          <Image
            source={{ uri: item.icon }}
            style={styles.appIcon}
            resizeMode="contain"
          />
        ) : (
          <View
            style={[
              styles.appIcon,
              styles.iconFallback,
              { backgroundColor: colors.systemGray3 },
            ]}
          >
            <Ionicons name="apps" size={28} color={colors.label} />
          </View>
        )}
        <Text
          style={[
            typography.caption2,
            styles.appName,
            { color: colors.label },
          ]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
      </Pressable>
    ),
    [cellWidth, colors, launchApp, handleLongPress, typography]
  );

  const keyExtractor = useCallback((item: InstalledApp) => item.packageName, []);

  const ListEmptyComponent = useMemo(() => {
    if (isLoading) {
      return (
        <View style={styles.emptyState}>
          <CupertinoActivityIndicator />
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name="search-outline" size={48} color={colors.secondaryLabel} />
        <Text style={[typography.body, { color: colors.secondaryLabel, marginTop: spacing.md }]}>
          No apps found
        </Text>
      </View>
    );
  }, [isLoading, colors, typography, spacing]);

  const closeButton = (
    <Pressable
      onPress={() => navigation.goBack()}
      hitSlop={12}
      style={styles.closeButton}
    >
      <Ionicons name="chevron-down" size={24} color={colors.systemBlue} />
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <CupertinoNavigationBar
        title="All Apps"
        largeTitle={false}
        leftButton={closeButton}
      />

      <View style={[styles.searchWrapper, { paddingHorizontal: spacing.md }]}>
        <CupertinoSearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search Apps"
          onCancel={() => { setQuery(''); setIsFocused(false); }}
          onFocusChange={setIsFocused}
          autoFocus={autoFocus}
        />
      </View>

      {showSuggestions && (
        <View style={styles.searchSections}>
          {siriSuggestions.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>Siri Suggestions</Text>
              <View style={styles.siriSuggestionsRow}>
                {siriSuggestions.map(app => (
                  <Pressable
                    key={app.packageName}
                    style={[styles.siriSuggestionItem, { width: cellWidth }]}
                    onPress={() => launchApp(app.packageName)}
                  >
                    {app.icon ? (
                      <Image source={{ uri: app.icon }} style={styles.siriSuggestionIcon} resizeMode="contain" />
                    ) : (
                      <View style={[styles.siriSuggestionIcon, styles.iconFallback, { backgroundColor: colors.systemGray3 }]}>
                        <Ionicons name="apps" size={24} color={colors.label} />
                      </View>
                    )}
                    <Text style={[typography.caption2, styles.appName, { color: colors.label }]} numberOfLines={1}>
                      {app.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {recentContacts.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>Recent Contacts</Text>
              {recentContacts.map(contact => (
                <Pressable
                  key={contact.id}
                  style={[styles.contactRow, { backgroundColor: colors.secondarySystemGroupedBackground }]}
                  onPress={() => navigation.navigate('ContactDetail', { contactId: contact.id })}
                >
                  <View style={[styles.contactAvatar, { backgroundColor: colors.systemBlue }]}>
                    <Text style={styles.contactAvatarText}>
                      {(contact.firstName?.[0] ?? '') + (contact.lastName?.[0] ?? '')}
                    </Text>
                  </View>
                  <Text style={[typography.body, { color: colors.label, marginLeft: 12 }]}>
                    {contact.firstName} {contact.lastName}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.tertiaryLabel} style={{ marginLeft: 'auto' }} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {isSearching && (settingsResults.length > 0 || contactResults.length > 0) && (
        <View style={styles.searchSections}>
          {settingsResults.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>Settings</Text>
              {settingsResults.map(item => (
                <Pressable
                  key={item.route}
                  style={[styles.settingsRow, { backgroundColor: colors.secondarySystemGroupedBackground }]}
                  onPress={() => navigation.navigate(item.route)}
                >
                  <View style={[styles.settingsIconWrap, { backgroundColor: colors.systemBlue }]}>
                    <Ionicons name={item.icon} size={18} color="#fff" />
                  </View>
                  <Text style={[typography.body, { color: colors.label, marginLeft: 12 }]}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.tertiaryLabel} style={{ marginLeft: 'auto' }} />
                </Pressable>
              ))}
            </View>
          )}
          {contactResults.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>Contacts</Text>
              {contactResults.map(contact => (
                <Pressable
                  key={contact.id}
                  style={[styles.contactRow, { backgroundColor: colors.secondarySystemGroupedBackground }]}
                  onPress={() => navigation.navigate('ContactDetail', { contactId: contact.id })}
                >
                  <View style={[styles.contactAvatar, { backgroundColor: colors.systemBlue }]}>
                    <Text style={styles.contactAvatarText}>
                      {(contact.firstName?.[0] ?? '') + (contact.lastName?.[0] ?? '')}
                    </Text>
                  </View>
                  <Text style={[typography.body, { color: colors.label, marginLeft: 12 }]}>
                    {contact.firstName} {contact.lastName}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.tertiaryLabel} style={{ marginLeft: 'auto' }} />
                </Pressable>
              ))}
            </View>
          )}
          {filteredApps.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>Apps</Text>
            </View>
          )}
        </View>
      )}

      <FlatList
        data={filteredApps}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={NUM_COLUMNS}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={isSearching && settingsResults.length === 0 && contactResults.length === 0 ? ListEmptyComponent : undefined}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + spacing.lg },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        getItemLayout={(_data, index) => ({
          length: 96, // appIcon(56) + name(~20) + paddingVertical(12*2)
          offset: 96 * Math.floor(index / NUM_COLUMNS),
          index,
        })}
        removeClippedSubviews
        maxToRenderPerBatch={20}
        windowSize={10}
        initialNumToRender={28}
      />

      <CupertinoActionSheet
        visible={actionSheetVisible}
        onClose={handleCloseActionSheet}
        title={selectedApp?.name}
        options={actionSheetOptions}
        cancelLabel="Cancel"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchWrapper: {
    paddingVertical: 8,
  },
  listContent: {
    paddingTop: 4,
  },
  gridCell: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  appIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_BORDER_RADIUS,
  },
  iconFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    marginTop: 4,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  closeButton: {
    padding: 4,
  },
  searchSections: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  sectionBlock: {
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginLeft: 4,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  settingsIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  contactAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  siriSuggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  siriSuggestionItem: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  siriSuggestionIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_BORDER_RADIUS,
  },
});
