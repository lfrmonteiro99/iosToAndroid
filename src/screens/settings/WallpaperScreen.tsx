import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings, type SettingsState } from '../../store/SettingsStore';
import { useApps } from '../../store/AppsStore';
import { NAMED_WALLPAPERS } from '../../utils/wallpapers';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSegmentedControl,
  CupertinoProgressBar,
  useAlert,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

const CUSTOM_WALLPAPER_KEY = '@iostoandroid/custom_wallpaper';

// Order drives the segmented control's left-to-right layout.
const ICON_TREATMENT_OPTIONS: SettingsState['iconTreatment'][] = [
  'mask-all',
  'mask-adaptive-only',
  'none',
];

const ICON_TREATMENT_LABELS: Record<SettingsState['iconTreatment'], string> = {
  'mask-all': 'All Icons',
  'mask-adaptive-only': 'Adaptive Only',
  none: 'None',
};

/** "0 B" / "3.2 KB" / "1.4 MB" — never a bare byte count above a few KB. */
export function formatIconCacheSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function WallpaperScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const {
    iconCacheSizeBytes,
    isRebuildingIconCache,
    iconCacheRebuildProgress,
    rebuildIconCache,
  } = useApps();
  const [customWallpaper, setCustomWallpaper] = useState<string | null>(null);
  const alert = useAlert();

  useEffect(() => {
    AsyncStorage.getItem(CUSTOM_WALLPAPER_KEY).then((uri) => {
      if (uri) setCustomWallpaper(uri);
    });
  }, []);

  const selectedIndex = settings.wallpaperIndex ?? 0;
  const isCustomSelected = selectedIndex === 6;
  const selectedWallpaper = isCustomSelected
    ? { color: '', name: 'Custom' }
    : (NAMED_WALLPAPERS[selectedIndex] ?? NAMED_WALLPAPERS[0]);

  const iconTreatment = settings.iconTreatment ?? 'mask-adaptive-only';
  const iconTreatmentIndex = ICON_TREATMENT_OPTIONS.indexOf(iconTreatment);

  const handleRebuildIconCache = useCallback(() => {
    if (isRebuildingIconCache) return;
    rebuildIconCache();
  }, [isRebuildingIconCache, rebuildIconCache]);

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsEditing: true,
      aspect: [9, 16] as [number, number],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setCustomWallpaper(uri);
      await AsyncStorage.setItem(CUSTOM_WALLPAPER_KEY, uri);
      update('wallpaperIndex', 6);
    }
  }, [update]);

  const takePhoto = useCallback(async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsEditing: true,
      aspect: [9, 16] as [number, number],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setCustomWallpaper(uri);
      await AsyncStorage.setItem(CUSTOM_WALLPAPER_KEY, uri);
      update('wallpaperIndex', 6);
    }
  }, [update]);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Wallpaper"
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            Settings
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Photo source tiles */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Choose from Photos"
              leading={{ name: 'image-outline', color: '#FFFFFF', backgroundColor: colors.systemBlue }}
              showChevron
              onPress={pickImage}
            />
            <CupertinoListTile
              title="Take Photo"
              leading={{ name: 'camera-outline', color: '#FFFFFF', backgroundColor: colors.systemGray }}
              showChevron
              onPress={takePhoto}
            />
          </CupertinoListSection>
        </View>

        {/* Wallpaper grid */}
        <View style={[styles.gridContainer, { paddingHorizontal: spacing.md, marginTop: spacing.md }]}>
          <View style={styles.grid}>
            {NAMED_WALLPAPERS.map((wp, index) => {
              const isSelected = index === selectedIndex;
              return (
                <Pressable
                  key={index}
                  style={[
                    styles.wallpaperCell,
                    { backgroundColor: wp.color },
                    isSelected && styles.wallpaperCellSelected,
                  ]}
                  onPress={() => update('wallpaperIndex', index)}
                  accessibilityLabel={`${wp.name} wallpaper${isSelected ? ', selected' : ''}`}
                  accessibilityRole="button"
                >
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={32} color="#FFFFFF" />
                  )}
                </Pressable>
              );
            })}
            {customWallpaper ? (
              <Pressable
                style={[
                  styles.wallpaperCell,
                  isCustomSelected && styles.wallpaperCellSelected,
                ]}
                onPress={() => update('wallpaperIndex', 6)}
                accessibilityLabel={`Custom wallpaper${isCustomSelected ? ', selected' : ''}`}
                accessibilityRole="button"
              >
                <Image source={{ uri: customWallpaper }} style={styles.wallpaperImage} />
                {isCustomSelected && (
                  <View style={styles.wallpaperOverlay}>
                    <Ionicons name="checkmark-circle" size={32} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Selected label */}
        <Text style={[typography.footnote, styles.selectedLabel, { color: colors.secondaryLabel }]}>
          Selected: {selectedWallpaper.name}
        </Text>

        {/* Set section */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Set Wallpaper">
            <CupertinoListTile
              title="Set Lock Screen"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {selectedWallpaper.name}
                </Text>
              }
              showChevron
              onPress={() => alert('Set Lock Screen', 'Wallpaper applied to lock screen within the app. To change your Android wallpaper, use your device settings.')}
            />
            <CupertinoListTile
              title="Set Home Screen"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {selectedWallpaper.name}
                </Text>
              }
              showChevron
              onPress={() => alert('Set Home Screen', 'Wallpaper applied to home screen within the app. To change your Android wallpaper, use your device settings.')}
            />
          </CupertinoListSection>
        </View>

        {/* Icon Treatment (#486) */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Icon Treatment"
            footer="Adaptive Only masks icons with a clean background/foreground split and leaves already-round or custom-shaped icons untouched. All Icons matches the classic iOS look; None shows icons exactly as the app provides them."
          >
            <View style={styles.segmentedRow}>
              <CupertinoSegmentedControl
                values={ICON_TREATMENT_OPTIONS.map((option) => ICON_TREATMENT_LABELS[option])}
                selectedIndex={iconTreatmentIndex}
                onChange={(index) => update('iconTreatment', ICON_TREATMENT_OPTIONS[index])}
              />
            </View>
            <CupertinoListTile
              title="Cache Size"
              trailing={
                <Text
                  accessibilityLabel={`Icon cache size: ${formatIconCacheSize(iconCacheSizeBytes)}`}
                  style={[typography.body, { color: colors.secondaryLabel }]}
                >
                  {formatIconCacheSize(iconCacheSizeBytes)}
                </Text>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Rebuild Icon Cache"
              subtitle={
                isRebuildingIconCache && iconCacheRebuildProgress
                  ? `Rebuilding… ${iconCacheRebuildProgress.done} of ${iconCacheRebuildProgress.total}`
                  : undefined
              }
              trailing={isRebuildingIconCache ? <CupertinoProgressBar
                progress={
                  iconCacheRebuildProgress && iconCacheRebuildProgress.total > 0
                    ? iconCacheRebuildProgress.done / iconCacheRebuildProgress.total
                    : 0
                }
                style={styles.rebuildProgressBar}
              /> : undefined}
              showChevron={!isRebuildingIconCache}
              isLast
              onPress={isRebuildingIconCache ? undefined : handleRebuildIconCache}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  segmentedRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rebuildProgressBar: {
    width: 80,
  },
  gridContainer: {
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  wallpaperCell: {
    width: 100,
    height: 140,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wallpaperCellSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  wallpaperImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  wallpaperOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedLabel: {
    textAlign: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
});
