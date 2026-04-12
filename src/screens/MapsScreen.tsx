import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Linking,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoSearchBar,
  CupertinoSwipeableRow,
  CupertinoEmptyState,
  useAlert,
} from '../components';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RecentLocation {
  id: string;
  name: string;
  address: string;
  timestamp: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = '@iostoandroid/maps_recents';
const MAPS_ACCENT = '#007AFF';

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function formatRecentDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─── Quick Action Button ────────────────────────────────────────────────────

interface QuickActionProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: any;
  typography: any;
}

const QuickAction = React.memo(function QuickAction({
  icon,
  label,
  onPress,
  colors,
  typography,
}: QuickActionProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        {
          backgroundColor: pressed
            ? colors.systemGray5
            : colors.secondarySystemGroupedBackground,
        },
      ]}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: MAPS_ACCENT }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <Text
        style={[typography.caption1, { color: colors.label, marginTop: 6 }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
});

// ─── Recent Row ─────────────────────────────────────────────────────────────

interface RecentRowProps {
  item: RecentLocation;
  onPress: () => void;
  onDelete: () => void;
  colors: any;
  typography: any;
}

const RecentRow = React.memo(function RecentRow({
  item,
  onPress,
  onDelete,
  colors,
  typography,
}: RecentRowProps) {
  return (
    <CupertinoSwipeableRow
      trailingActions={[
        { label: 'Delete', color: colors.systemRed, onPress: onDelete },
      ]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.recentRow,
          {
            backgroundColor: pressed
              ? colors.systemGray5
              : colors.secondarySystemGroupedBackground,
          },
        ]}
      >
        <View style={[styles.recentIcon, { backgroundColor: colors.systemGray5 }]}>
          <Ionicons name="time-outline" size={18} color={colors.secondaryLabel} />
        </View>
        <View style={[styles.recentContent, { borderBottomColor: colors.separator }]}>
          <View style={styles.recentTextContainer}>
            <Text
              style={[typography.body, { color: colors.label }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <Text
              style={[typography.caption1, { color: colors.secondaryLabel }]}
              numberOfLines={1}
            >
              {item.address}
            </Text>
          </View>
          <Text style={[typography.caption2, { color: colors.tertiaryLabel }]}>
            {formatRecentDate(item.timestamp)}
          </Text>
        </View>
      </Pressable>
    </CupertinoSwipeableRow>
  );
});

// ─── Main Screen ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function MapsScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const alert = useAlert();

  // ── State ───────────────────────────────────────────────────
  const [recents, setRecents] = useState<RecentLocation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationText, setLocationText] = useState('Location unavailable');
  const [locationLoading, setLocationLoading] = useState(false);

  // ── Persistence ─────────────────────────────────────────────

  const loadRecents = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: RecentLocation[] = JSON.parse(raw);
        setRecents(parsed.sort((a, b) => b.timestamp - a.timestamp));
      }
    } catch {
      // silently fail
    }
    setLoaded(true);
  }, []);

  const persistRecents = useCallback(async (updated: RecentLocation[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    loadRecents();
  }, [loadRecents]);

  // ── Location ────────────────────────────────────────────────

  const handleCurrentLocation = useCallback(async () => {
    setLocationLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationText('Location permission denied');
        setLocationLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLocationText(
        `${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`,
      );
    } catch {
      setLocationText('Location not available');
    }
    setLocationLoading(false);
  }, []);

  // ── Search / Open Maps ──────────────────────────────────────

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const query = searchQuery.trim();

    // Save to recents
    const newRecent: RecentLocation = {
      id: generateId(),
      name: query,
      address: 'Searched location',
      timestamp: Date.now(),
    };
    const updated = [newRecent, ...recents].slice(0, 20);
    setRecents(updated);
    persistRecents(updated);

    // Try to open in maps
    const encoded = encodeURIComponent(query);
    const geoUrl = `geo:0,0?q=${encoded}`;
    Linking.canOpenURL(geoUrl).then((supported) => {
      if (supported) {
        Linking.openURL(geoUrl);
      } else {
        Linking.openURL(`https://maps.google.com/?q=${encoded}`);
      }
    });

    setSearchQuery('');
  }, [searchQuery, recents, persistRecents]);

  const openRecentInMaps = useCallback((item: RecentLocation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const encoded = encodeURIComponent(item.name);
    const geoUrl = `geo:0,0?q=${encoded}`;
    Linking.canOpenURL(geoUrl).then((supported) => {
      if (supported) {
        Linking.openURL(geoUrl);
      } else {
        Linking.openURL(`https://maps.google.com/?q=${encoded}`);
      }
    });
  }, []);

  const deleteRecent = useCallback(
    (id: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const updated = recents.filter((r) => r.id !== id);
      setRecents(updated);
      persistRecents(updated);
    },
    [recents, persistRecents],
  );

  // ── Filtered Recents ────────────────────────────────────────

  const filteredRecents = useMemo(() => {
    if (!searchQuery.trim()) return recents;
    const q = searchQuery.toLowerCase();
    return recents.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q),
    );
  }, [recents, searchQuery]);

  // ── Quick Actions ───────────────────────────────────────────

  const handleDirections = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = 'https://maps.google.com/maps/dir/';
    Linking.openURL(url).catch(() => {
      alert('Maps', 'Unable to open maps for directions.');
    });
  }, [alert]);

  const handleSearchNearby = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = 'https://maps.google.com/maps/search/nearby';
    Linking.openURL(url).catch(() => {
      alert('Maps', 'Unable to open maps for nearby search.');
    });
  }, [alert]);

  const handleFavorites = useCallback(() => {
    alert('Favorites', 'Favorites are not available in the emulator.');
  }, [alert]);

  // ── Render ──────────────────────────────────────────────────

  const renderRecentRow = ({ item }: { item: RecentLocation }) => (
    <RecentRow
      item={item}
      onPress={() => openRecentInMaps(item)}
      onDelete={() => deleteRecent(item.id)}
      colors={colors}
      typography={typography}
    />
  );

  const keyExtractor = (item: RecentLocation) => item.id;

  const renderListHeader = () => (
    <View>
      {/* Search bar */}
      <View style={[styles.searchContainer, { paddingHorizontal: spacing.md }]}>
        <CupertinoSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search Maps"
          onSubmitEditing={handleSearch}
        />
      </View>

      {/* Map placeholder */}
      <View style={styles.mapContainer}>
        <LinearGradient
          colors={['#A8D8EA', '#87CEEB', '#6BB3D9', '#4A90D9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.mapGradient}
        >
          {/* Grid lines to simulate map */}
          <View style={styles.mapGridOverlay}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View
                key={`h-${i}`}
                style={[
                  styles.mapGridLineH,
                  { top: `${(i + 1) * 16.6}%`, opacity: 0.15 },
                ]}
              />
            ))}
            {Array.from({ length: 5 }).map((_, i) => (
              <View
                key={`v-${i}`}
                style={[
                  styles.mapGridLineV,
                  { left: `${(i + 1) * 16.6}%`, opacity: 0.15 },
                ]}
              />
            ))}
          </View>

          {/* Center pin */}
          <View style={styles.mapCenterPin}>
            <Ionicons name="location" size={36} color={colors.systemRed} />
          </View>

          {/* Location label */}
          <View style={[styles.mapLocationLabel, { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
            {locationLoading ? (
              <ActivityIndicator size="small" color={MAPS_ACCENT} />
            ) : (
              <Text style={[typography.caption1, { color: colors.label }]}>
                {locationText}
              </Text>
            )}
          </View>

          {/* Current Location FAB */}
          <Pressable
            onPress={handleCurrentLocation}
            style={({ pressed }) => [
              styles.locationButton,
              {
                backgroundColor: pressed ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.95)',
              },
            ]}
          >
            <Ionicons name="navigate" size={20} color={MAPS_ACCENT} />
          </Pressable>
        </LinearGradient>
      </View>

      {/* Quick actions */}
      <View style={styles.quickActionsRow}>
        <QuickAction
          icon="navigate-outline"
          label="Directions"
          onPress={handleDirections}
          colors={colors}
          typography={typography}
        />
        <QuickAction
          icon="search-outline"
          label="Search Nearby"
          onPress={handleSearchNearby}
          colors={colors}
          typography={typography}
        />
        <QuickAction
          icon="heart-outline"
          label="Favorites"
          onPress={handleFavorites}
          colors={colors}
          typography={typography}
        />
      </View>

      {/* Recents header */}
      {filteredRecents.length > 0 && (
        <View style={styles.sectionHeader}>
          <Text
            style={[typography.title3, { color: colors.label, fontWeight: '700' }]}
          >
            Recents
          </Text>
          <Text style={[typography.footnote, { color: colors.secondaryLabel }]}>
            {filteredRecents.length} {filteredRecents.length === 1 ? 'place' : 'places'}
          </Text>
        </View>
      )}
    </View>
  );

  const renderEmptyRecents = () => {
    if (!loaded) return null;
    return (
      <View style={styles.emptyContainer}>
        <CupertinoEmptyState
          icon="map-outline"
          title="No Recent Searches"
          message="Search for a location to see it here."
          iconColor={MAPS_ACCENT}
        />
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Maps"
        largeTitle={false}
        leftButton={
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={MAPS_ACCENT} />
          </Pressable>
        }
      />

      <FlatList
        data={filteredRecents}
        renderItem={renderRecentRow}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyRecents}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 40,
          flexGrow: filteredRecents.length === 0 ? 1 : undefined,
        }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingVertical: 8,
  },

  // Map placeholder
  mapContainer: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    height: 200,
  },
  mapGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapGridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  mapGridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#fff',
  },
  mapGridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#fff',
  },
  mapCenterPin: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLocationLabel: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  locationButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },

  // Quick actions
  quickActionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 20,
    gap: 12,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },

  // Recent rows
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
  },
  recentIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 16,
    marginLeft: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentTextContainer: {
    flex: 1,
  },

  // Empty
  emptyContainer: {
    paddingTop: 40,
    alignItems: 'center',
  },
});
