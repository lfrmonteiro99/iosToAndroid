import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
} from '../../components';

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

  const selectedIndex = settings.wallpaperIndex ?? 0;
  const selectedWallpaper = WALLPAPERS[selectedIndex] ?? WALLPAPERS[0];

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
  selectedLabel: {
    textAlign: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
});
