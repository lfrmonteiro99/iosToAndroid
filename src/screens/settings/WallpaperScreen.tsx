import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
} from '../../components';

const CUSTOM_WALLPAPER_KEY = '@iostoandroid/custom_wallpaper';

const WALLPAPERS = [
  { color: '#667eea', name: 'Lavender' },
  { color: '#f093fb', name: 'Pink' },
  { color: '#4facfe', name: 'Sky' },
  { color: '#43e97b', name: 'Green' },
  { color: '#fa709a', name: 'Coral' },
  { color: '#1C1C1E', name: 'Dark' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function WallpaperScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const [customWallpaper, setCustomWallpaper] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CUSTOM_WALLPAPER_KEY).then((uri) => {
      if (uri) setCustomWallpaper(uri);
    });
  }, []);

  const selectedIndex = settings.wallpaperIndex ?? 0;
  const isCustomSelected = selectedIndex === 6;
  const selectedWallpaper = isCustomSelected
    ? { color: '', name: 'Custom' }
    : (WALLPAPERS[selectedIndex] ?? WALLPAPERS[0]);

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
            {WALLPAPERS.map((wp, index) => {
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
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Set Home Screen"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {selectedWallpaper.name}
                </Text>
              }
              showChevron
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
