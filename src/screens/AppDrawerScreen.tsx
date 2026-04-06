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
import { useTheme } from '../theme/ThemeContext';
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

export function AppDrawerScreen({ navigation, route }: AppDrawerScreenProps) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const { apps, dockApps, launchApp, addToDock, isLoading } = useApps();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const searchFocused: boolean = route?.params?.searchFocused ?? false;

  const [query, setQuery] = useState('');
  const [autoFocus, setAutoFocus] = useState(false);
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
          onCancel={() => setQuery('')}
          autoFocus={autoFocus}
        />
      </View>

      <FlatList
        data={filteredApps}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={NUM_COLUMNS}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={ListEmptyComponent}
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
});
