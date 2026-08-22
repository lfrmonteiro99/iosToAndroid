import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { NAMED_WALLPAPERS } from '../../utils/wallpapers';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSegmentedControl,
  CupertinoSlider,
  useAlert,
} from '../../components';
import { useApps } from '../../store/AppsStore';
import {
  ICON_SHAPES,
  ICON_SHAPE_LABELS,
  ICON_SHAPE_EXPONENT_MIN,
  ICON_SHAPE_EXPONENT_MAX,
  DEFAULT_ICON_SHAPE_EXPONENT,
  normalizeIconShape,
  clampIconShapeExponent,
  previewCornerRatio,
} from '../../utils/iconShape';
import type { AppNavigationProp } from '../../navigation/types';

const CUSTOM_WALLPAPER_KEY = '@iostoandroid/custom_wallpaper';

export function WallpaperScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const [customWallpaper, setCustomWallpaper] = useState<string | null>(null);
  const alert = useAlert();
  const { apps } = useApps();

  // Forma dos ícones (#482). Vive neste ecrã porque é aqui que a aparência do
  // ecrã inicial já se configura — ver o PR para a justificação.
  const iconShape = normalizeIconShape(settings.iconShape);
  const iconShapeExponent = clampIconShapeExponent(settings.iconShapeExponent);
  const shapeIndex = Math.max(0, ICON_SHAPES.indexOf(iconShape));
  // Pré-visualização com um ícone REAL: a primeira app instalada com ícone.
  const previewIcon = apps.find((a) => !!a.icon)?.icon ?? null;
  const previewRadius = PREVIEW_SIZE * previewCornerRatio(iconShape, iconShapeExponent);
  const exponentDisabled = iconShape !== 'squircle';

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

        {/* Forma dos ícones (#482) */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection header="Icon Shape">
            <View style={styles.shapeRow}>
              <CupertinoSegmentedControl
                values={ICON_SHAPE_LABELS as string[]}
                selectedIndex={shapeIndex}
                onChange={(index) => update('iconShape', ICON_SHAPES[index])}
              />
            </View>
            <View style={styles.previewRow}>
              {previewIcon ? (
                <Image
                  source={{ uri: previewIcon }}
                  style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: previewRadius }}
                  accessibilityLabel={`Icon shape preview, ${ICON_SHAPE_LABELS[shapeIndex]}`}
                />
              ) : (
                <View
                  style={{
                    width: PREVIEW_SIZE,
                    height: PREVIEW_SIZE,
                    borderRadius: previewRadius,
                    backgroundColor: colors.systemBlue,
                  }}
                  accessibilityLabel={`Icon shape preview, ${ICON_SHAPE_LABELS[shapeIndex]}`}
                />
              )}
              <Text style={[typography.footnote, { color: colors.secondaryLabel }]}>
                {iconShape === 'original'
                  ? 'Original: system drawable, no mask'
                  : `Exponent: ${iconShapeExponent.toFixed(1)}`}
              </Text>
            </View>
            <View style={styles.sliderRow}>
              <CupertinoSlider
                value={iconShapeExponent}
                minimumValue={ICON_SHAPE_EXPONENT_MIN}
                maximumValue={ICON_SHAPE_EXPONENT_MAX}
                disabled={exponentDisabled}
                onValueChange={(value) =>
                  update('iconShapeExponent', clampIconShapeExponent(value))
                }
              />
            </View>
            <CupertinoListTile
              title="Reset Shape Exponent"
              onPress={() => update('iconShapeExponent', DEFAULT_ICON_SHAPE_EXPONENT)}
            />
          </CupertinoListSection>
        </View>

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
      </ScrollView>
    </View>
  );
}

const PREVIEW_SIZE = 60;

const styles = StyleSheet.create({
  container: { flex: 1 },
  shapeRow: { paddingHorizontal: 16, paddingVertical: 12 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sliderRow: { paddingHorizontal: 16, paddingBottom: 16 },
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
