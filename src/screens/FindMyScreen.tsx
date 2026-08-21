import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CupertinoNavigationBar } from '../components/CupertinoNavigationBar';
import { CupertinoListSection, CupertinoListTile } from '../components/CupertinoListSection';
import { CupertinoButton } from '../components/CupertinoButton';
import { CupertinoTextField } from '../components/CupertinoTextField';
import { CupertinoEmptyState } from '../components/CupertinoEmptyState';
import { CupertinoSwipeableRow } from '../components/CupertinoSwipeableRow';
import { useTheme } from '../theme/ThemeContext';
import { useDevice } from '../store/DeviceStore';
import { useLocation } from '../store/LocationStore';

// ─── Storage / helpers ───────────────────────────────────────────────────────

const ITEMS_KEY = '@iostoandroid/findmy_items';

interface TrackedItem {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  addedAt: number;
}

// Fixed, hand-picked set of icons the user can assign to an item. This is an
// inventory list only — there is no AirTag-equivalent hardware this app can
// range or locate, so icons are purely cosmetic labels, never live trackers.
const ICON_CHOICES: (keyof typeof Ionicons.glyphMap)[] = [
  'key',
  'bag-handle',
  'briefcase',
  'bicycle',
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function formatRelative(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

type TabKey = 'devices' | 'items';

export function FindMyScreen() {
  const { theme, typography, borderRadius } = useTheme();
  const { colors } = theme;
  const { bluetooth } = useDevice();
  const { currentLocation, permissionStatus, requestPermission, refreshLocation } = useLocation();

  const deviceName = bluetooth.name?.trim() ? bluetooth.name : 'This Device';

  const handleGrant = useCallback(() => {
    void requestPermission();
  }, [requestPermission]);

  // When permission is granted, fetch the device's own location once so the
  // "This Device" row shows live coordinates instead of "No location yet".
  useEffect(() => {
    if (permissionStatus === 'granted') {
      void refreshLocation();
    }
  }, [permissionStatus, refreshLocation]);

  const coordinateLabel = currentLocation
    ? `${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}`
    : null;
  const updatedLabel = currentLocation ? `Updated ${formatRelative(currentLocation.timestamp)}` : null;

  // ── Items tab (tracked inventory) ──────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('devices');
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState<keyof typeof Ionicons.glyphMap>(ICON_CHOICES[0]);

  // Hydrate from AsyncStorage on mount (mirrors MapsScreen's recents hydration:
  // a `cancelled` guard so an in-flight read after unmount is ignored).
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ITEMS_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const parsed: TrackedItem[] = JSON.parse(raw);
            if (Array.isArray(parsed)) setItems(parsed);
          } catch {
            // ignore corrupt payloads
          }
        }
      })
      .catch(() => {
        // storage read failed — start empty
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persistItems = useCallback(async (updated: TrackedItem[]) => {
    try {
      await AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(updated));
    } catch {
      // silently fail — same posture as MapsScreen.persistRecents
    }
  }, []);

  const addItem = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const item: TrackedItem = {
      id: generateId(),
      name,
      icon: newIcon,
      addedAt: Date.now(),
    };
    const updated = [...items, item];
    setItems(updated);
    setNewName('');
    setSheetOpen(false);
    void persistItems(updated);
  }, [newName, newIcon, items, persistItems]);

  const deleteItem = useCallback(
    (id: string) => {
      const updated = items.filter((i) => i.id !== id);
      setItems(updated);
      void persistItems(updated);
    },
    [items, persistItems]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar title="Find My" largeTitle>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Tab switcher — Devices | Items */}
          <View style={[styles.tabBar, { marginTop: 8 }]}>
            <Pressable
              onPress={() => setActiveTab('devices')}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'devices' }}
              style={[
                styles.tabPill,
                {
                  backgroundColor:
                    activeTab === 'devices' ? colors.systemBlue : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  typography.subhead,
                  {
                    color: activeTab === 'devices' ? '#FFFFFF' : colors.secondaryLabel,
                    fontWeight: '600',
                  },
                ]}
              >
                Devices
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('items')}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'items' }}
              style={[
                styles.tabPill,
                {
                  backgroundColor:
                    activeTab === 'items' ? colors.systemBlue : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  typography.subhead,
                  {
                    color: activeTab === 'items' ? '#FFFFFF' : colors.secondaryLabel,
                    fontWeight: '600',
                  },
                ]}
              >
                Items
              </Text>
            </Pressable>
          </View>

          {activeTab === 'devices' ? (
            <>
              {/* Map placeholder — gradient box with a center pin (MapsScreen-style). */}
              <View style={[styles.mapContainer, { borderRadius: borderRadius.large }]}>
                <LinearGradient
                  colors={['#A8D8EA', '#87CEEB', '#6BB3D9', '#4A90D9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.mapGradient}
                >
                  <View style={styles.mapCenterPin}>
                    <Ionicons name="location" size={36} color={colors.systemRed} />
                  </View>
                  <View
                    style={[styles.mapLocationLabel, { backgroundColor: 'rgba(255,255,255,0.9)' }]}
                  >
                    <Text style={[typography.caption1, { color: colors.label }]}>
                      {currentLocation ? coordinateLabel : 'Location unavailable'}
                    </Text>
                  </View>
                </LinearGradient>
              </View>

              {permissionStatus !== 'granted' ? (
                <View style={styles.grantContainer}>
                  <CupertinoButton
                    title="Grant Location Permission"
                    variant="filled"
                    onPress={handleGrant}
                  />
                </View>
              ) : (
                <View style={styles.sectionContainer}>
                  <CupertinoListSection header="Devices">
                    <CupertinoListTile
                      title={deviceName}
                      subtitle={
                        currentLocation
                          ? `${coordinateLabel} · ${updatedLabel}`
                          : 'No location yet'
                      }
                      leading={{
                        name: 'phone-portrait-outline',
                        color: '#FFFFFF',
                        backgroundColor: colors.systemBlue,
                      }}
                    />
                  </CupertinoListSection>
                </View>
              )}
            </>
          ) : (
            <View testID="items-tab" style={styles.itemsTab}>
              <View style={styles.itemsHeader}>
                <CupertinoButton
                  title="Add Item"
                  variant="plain"
                  onPress={() => {
                    setNewName('');
                    setSheetOpen(true);
                  }}
                />
              </View>

              {items.length === 0 ? (
                <CupertinoEmptyState
                  icon="paper-plane-outline"
                  title="No Tracked Items"
                  message="A manual inventory of your belongings — not a live tracker. Tap “Add Item” to keep notes on things like keys, bags or your bike."
                />
              ) : (
                <CupertinoListSection header="Tracked Items">
                  {items.map((item) => (
                    <CupertinoSwipeableRow
                      key={item.id}
                      trailingActions={[
                        {
                          label: 'Delete',
                          color: colors.systemRed,
                          onPress: () => deleteItem(item.id),
                        },
                      ]}
                    >
                      <CupertinoListTile
                        title={item.name}
                        subtitle={`Added ${formatRelative(item.addedAt)}`}
                        leading={{
                          name: item.icon,
                          color: '#FFFFFF',
                          backgroundColor: colors.systemBlue,
                        }}
                      />
                    </CupertinoSwipeableRow>
                  ))}
                </CupertinoListSection>
              )}
            </View>
          )}
        </ScrollView>
      </CupertinoNavigationBar>

      {/* Add-item sheet — slide-up modal, same family as MapsScreen's detail sheet. */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => setSheetOpen(false)}
          />
          <View
            style={[
              styles.sheetContent,
              { backgroundColor: colors.secondarySystemGroupedBackground, paddingBottom: 16 },
            ]}
          >
            <View style={styles.sheetHandle} />
            <Text style={[typography.title3, { color: colors.label, fontWeight: '700', alignSelf: 'center' }]}>
              New Tracked Item
            </Text>
            <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
              <CupertinoTextField
                placeholder="Item name"
                value={newName}
                onChangeText={setNewName}
                autoFocus
              />
              <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: 16, marginBottom: 8 }]}>
                ICON
              </Text>
              <View style={styles.iconRow}>
                {ICON_CHOICES.map((ic) => (
                  <Pressable
                    key={ic}
                    accessibilityLabel={`Select ${ic} icon`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: newIcon === ic }}
                    onPress={() => setNewIcon(ic)}
                    style={[
                      styles.iconChoice,
                      {
                        backgroundColor: colors.systemGray6,
                        borderColor: newIcon === ic ? colors.systemBlue : 'transparent',
                      },
                    ]}
                  >
                    <Ionicons name={ic} size={26} color={colors.label} />
                  </Pressable>
                ))}
              </View>
              <View style={styles.sheetActions}>
                <CupertinoButton
                  title="Cancel"
                  variant="plain"
                  onPress={() => setSheetOpen(false)}
                />
                <CupertinoButton
                  title="Add"
                  variant="filled"
                  disabled={!newName.trim()}
                  onPress={addItem}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  tabPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  itemsTab: {
    marginTop: 8,
  },
  itemsHeader: {
    paddingHorizontal: 16,
    alignItems: 'flex-end',
  },
  mapContainer: {
    margin: 16,
    height: 260,
    overflow: 'hidden',
  },
  mapGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCenterPin: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapLocationLabel: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  grantContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  sectionContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#C7C7CC',
    alignSelf: 'center',
    marginBottom: 8,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 12,
  },
  iconChoice: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
});
