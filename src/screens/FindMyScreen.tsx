import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CupertinoNavigationBar } from '../components/CupertinoNavigationBar';
import { CupertinoListSection, CupertinoListTile } from '../components/CupertinoListSection';
import { CupertinoButton } from '../components/CupertinoButton';
import { CupertinoSegmentedControl } from '../components/CupertinoSegmentedControl';
import { CupertinoEmptyState } from '../components/CupertinoEmptyState';
import { CupertinoSwitch } from '../components/CupertinoSwitch';
import { CupertinoTextField } from '../components/CupertinoTextField';
import { CupertinoSwipeableRow } from '../components/CupertinoSwipeableRow';
import { useAlert } from '../components';
import { withAutoLockSuppressed } from '../utils/permissions';
import { hapticSelection } from '../utils/haptics';
import { useTheme } from '../theme/ThemeContext';
import { useDevice } from '../store/DeviceStore';
import { useLocation } from '../store/LocationStore';
import { useContacts } from '../store/ContactsStore';

const LOST_MODE_KEY = '@iostoandroid/findmy_lost_mode';

interface LostModeState {
  active: boolean;
  message: string; // shown on the overlay, e.g. a contact phone number
}

const DEFAULT_LOST_MODE: LostModeState = { active: false, message: '' };

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

type FindMyTab = 'devices' | 'people' | 'items';
const TAB_VALUES: FindMyTab[] = ['devices', 'people', 'items'];

// ─── Play Sound on this device (issue #266) ──────────────────────────────────
// Honest scoping: with no backend and no companion device, the only hardware
// this app can make a noise on is the one it is running on. The alert is a local
// notification with `sound: true`, following ClockScreen / RemindersScreen's
// permission + immediate-trigger shape.

async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await withAutoLockSuppressed(() => Notifications.requestPermissionsAsync());
  return status === 'granted';
}

export async function playSoundOnThisDevice(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Find My',
      body: 'Playing sound on This Device',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      repeats: false,
    },
  });
}

export function FindMyScreen() {
  const { theme, typography, borderRadius } = useTheme();
  const { colors } = theme;
  const { bluetooth } = useDevice();
  const { currentLocation, permissionStatus, requestPermission, refreshLocation } = useLocation();
  const { favorites } = useContacts();

  const [selectedTab, setSelectedTab] = useState<FindMyTab>('devices');
  const selectedIndex = TAB_VALUES.indexOf(selectedTab);

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

  // ── Lost mode (issue #267) ──────────────────────────────────────────────
  // In-app-only simulation: an unprivileged launcher cannot lock the device,
  // so "Mark as Lost" is confined to this screen. The flag is persisted and
  // hydrated on mount so it survives navigation away and back (and restart).
  const [lostMode, setLostMode] = useState<LostModeState>(DEFAULT_LOST_MODE);
  const [showMessagePrompt, setShowMessagePrompt] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');

  const persistLostMode = useCallback(async (next: LostModeState) => {
    try {
      await AsyncStorage.setItem(LOST_MODE_KEY, JSON.stringify(next));
    } catch {
      // silently fail — storage is best-effort for a cosmetic overlay
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(LOST_MODE_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<LostModeState>;
          setLostMode({
            active: parsed.active === true,
            message: typeof parsed.message === 'string' ? parsed.message : '',
          });
        } catch {
          /* ignore corrupt storage */
        }
      }
    }).catch(() => {
      /* ignore */
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleLostMode = useCallback(
    (value: boolean) => {
      hapticSelection().catch(() => {});
      if (value) {
        // Toggling on opens a prompt to capture an optional contact message
        // before activating.
        setPendingMessage(lostMode.message);
        setShowMessagePrompt(true);
      } else {
        // Toggling off directly disables and persists.
        const next: LostModeState = { active: false, message: '' };
        setLostMode(next);
        void persistLostMode(next);
      }
    },
    [lostMode.message, persistLostMode],
  );

  const confirmMessagePrompt = useCallback(() => {
    const next: LostModeState = { active: true, message: pendingMessage };
    setLostMode(next);
    void persistLostMode(next);
    setShowMessagePrompt(false);
  }, [pendingMessage, persistLostMode]);

  const cancelMessagePrompt = useCallback(() => {
    // User dismissed the prompt without activating — leave the switch off.
    setShowMessagePrompt(false);
    setLostMode((prev) => ({ ...prev, active: false }));
  }, []);

  const turnOffLostMode = useCallback(() => {
    const next: LostModeState = { active: false, message: '' };
    setLostMode(next);
    void persistLostMode(next);
  }, [persistLostMode]);

  // ── Play Sound (issue #266) ────────────────────────────────────────────────
  // `playingSound` is a ref, not state: the guard has to be effective inside the
  // same tick as a second press (a double tap fires both handlers before any
  // re-render), and it must not itself trigger a render.
  const alert = useAlert();
  const playingSound = React.useRef(false);

  const handlePlaySound = useCallback(() => {
    if (playingSound.current) return;
    playingSound.current = true;
    void (async () => {
      try {
        const granted = await requestNotificationPermission();
        if (!granted) {
          alert(
            'Notifications Are Off',
            'Find My plays the sound as a notification on this device. Enable notifications for this app in Android Settings to use it.',
          );
          return;
        }
        await playSoundOnThisDevice();
        alert('Playing Sound', 'This device will play a sound now.');
      } catch {
        // Never swallow the failure: a silent no-op looks identical to success.
        alert('Could Not Play Sound', 'The notification could not be scheduled on this device.');
      } finally {
        playingSound.current = false;
      }
    })();
  }, [alert]);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar title="Find My" largeTitle>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.segmentedContainer}>
            <CupertinoSegmentedControl
              values={['Devices', 'People', 'Items']}
              selectedIndex={selectedIndex}
              onChange={(index: number) => setSelectedTab(TAB_VALUES[index])}
            />
          </View>

          {selectedTab === 'devices' && (
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
                  <View style={[styles.mapLocationLabel, { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
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
                      subtitle={currentLocation ? `${coordinateLabel} · ${updatedLabel}` : 'No location yet'}
                      leading={{
                        name: 'phone-portrait-outline',
                        color: '#FFFFFF',
                        backgroundColor: colors.systemBlue,
                      }}
                    />
                    <CupertinoListTile
                      title="Play Sound"
                      subtitle="Alerts this device only"
                      leading={{
                        name: 'volume-high',
                        color: '#FFFFFF',
                        backgroundColor: colors.systemBlue,
                      }}
                      onPress={handlePlaySound}
                      showChevron={false}
                    />
                    <CupertinoListTile
                      title="Mark as Lost"
                      subtitle={
                        lostMode.active && lostMode.message
                          ? lostMode.message
                          : undefined
                      }
                      leading={{
                        name: 'alert-circle',
                        color: '#FFFFFF',
                        backgroundColor: colors.systemRed,
                      }}
                      trailing={
                        <CupertinoSwitch
                          value={lostMode.active}
                          onValueChange={handleToggleLostMode}
                        />
                      }
                      showChevron={false}
                    />
                  </CupertinoListSection>
                </View>
              )}
            </>
          )}

          {selectedTab === 'people' && (
            favorites.length === 0 ? (
              <CupertinoEmptyState
                icon="people-outline"
                iconColor={colors.systemGray}
                title="No One Is Sharing Their Location"
                message="When a contact is marked as a favorite in Contacts, they'll appear here. This app has no backend, so live location can't be fetched — only real contact data is shown."
              />
            ) : (
              <View style={styles.sectionContainer}>
                <CupertinoListSection header="People">
                  {favorites.map((c) => (
                    <CupertinoListTile
                      key={c.id}
                      title={`${c.firstName} ${c.lastName}`}
                      subtitle="Location Sharing Unavailable"
                      leading={{
                        name: 'location-outline',
                        color: '#FFFFFF',
                        backgroundColor: colors.systemGray,
                      }}
                    />
                  ))}
                </CupertinoListSection>
              </View>
            )
          )}

          {selectedTab === 'items' && (
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
                // Zero-items case: the placeholder from #264 stays — it makes
                // clear this app cannot detect tracking hardware.
                <CupertinoEmptyState
                  icon="cube-outline"
                  iconColor={colors.systemGray}
                  title="No Items"
                  message="Item tracking requires hardware like AirTags, which this app can't detect."
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

      {/* Message prompt — inline Modal capturing the optional contact note. */}
      <Modal
        visible={showMessagePrompt}
        transparent
        animationType="fade"
        onRequestClose={cancelMessagePrompt}
      >
        <View style={styles.promptBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.promptSheet}
          >
            <View
              style={[
                styles.promptContent,
                { backgroundColor: colors.secondarySystemGroupedBackground },
              ]}
            >
              <Text style={[typography.title3, { color: colors.label, fontWeight: '700' }]}>
                Lost Mode
              </Text>
              <Text
                style={[
                  typography.footnote,
                  { color: colors.secondaryLabel, marginTop: 6, marginBottom: 12 },
                ]}
              >
                Add an optional contact message so someone who finds this device knows how to
                reach you.
              </Text>
              <CupertinoTextField
                value={pendingMessage}
                onChangeText={setPendingMessage}
                placeholder="Contact message (optional)"
              />
              <View style={styles.promptActions}>
                <CupertinoButton
                  title="Cancel"
                  variant="plain"
                  onPress={cancelMessagePrompt}
                />
                <CupertinoButton
                  title="Save"
                  variant="filled"
                  onPress={confirmMessagePrompt}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Full-screen lost-mode overlay — only rendered while FindMyScreen is
          mounted and lostMode.active is true. It never blocks navigation away
          and never shows on any other screen. */}
      <Modal
        visible={lostMode.active}
        animationType="fade"
        onRequestClose={turnOffLostMode}
      >
        <View style={[styles.overlay, { backgroundColor: colors.systemBackground }]}>
          <Ionicons name="alert-circle" size={64} color={colors.systemRed} style={styles.overlayIcon} />
          <Text style={[typography.largeTitle, { color: colors.label, textAlign: 'center' }]}>
            This Device Is Marked as Lost
          </Text>
          {lostMode.message ? (
            <Text style={[typography.title3, { color: colors.secondaryLabel, textAlign: 'center', marginTop: 12 }]}>
              {`Reach me: ${lostMode.message}`}
            </Text>
          ) : null}
          <Text style={[typography.footnote, { color: colors.tertiaryLabel, textAlign: 'center', marginTop: 20 }]}>
            This does not lock your device
          </Text>
          <View style={styles.overlayButton}>
            <CupertinoButton
              title="Turn Off Lost Mode"
              variant="filled"
              onPress={turnOffLostMode}
            />
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
  segmentedContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
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
  // Add-item sheet
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
  // Message prompt sheet
  promptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  promptSheet: {
    width: '100%',
  },
  promptContent: {
    borderRadius: 14,
    padding: 20,
  },
  promptActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 16,
  },
  // Lost-mode overlay
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  overlayIcon: {
    marginBottom: 20,
  },
  overlayButton: {
    marginTop: 32,
    width: '100%',
  },
});
