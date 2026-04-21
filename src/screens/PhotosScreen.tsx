import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  Image,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Platform,
  TextInput,
  Modal,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { withAutoLockSuppressed } from '../utils/permissions';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoNavigationBar, CupertinoSegmentedControl, useAlert, CupertinoSkeleton } from '../components';
import type { AppNavigationProp } from '../navigation/types';
import type { CupertinoColors } from '../theme/CupertinoTheme';
import { Typography } from '../theme/CupertinoTheme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GAP = 2;
const COLS = 3;
const THUMB_SIZE = (SCREEN_WIDTH - GRID_GAP * (COLS + 1)) / COLS;
const PAGE_SIZE = 60;

const TABS = ['Library', 'For You', 'Albums'];

// ---------------------------------------------------------------------------
// Memories data
// ---------------------------------------------------------------------------
const MEMORIES = [
  { id: '1', title: 'Last Week', colors: ['#667eea', '#764ba2'] as [string, string] },
  { id: '2', title: 'This Month', colors: ['#f093fb', '#f5576c'] as [string, string] },
  { id: '3', title: 'Summer 2024', colors: ['#4facfe', '#00f2fe'] as [string, string] },
  { id: '4', title: 'Recent Highlights', colors: ['#43e97b', '#38f9d7'] as [string, string] },
];

// ---------------------------------------------------------------------------
// Helper: group assets by date range
// ---------------------------------------------------------------------------
function groupByDateRange(assets: MediaLibrary.Asset[]) {
  const now = Date.now();
  const ONE_DAY = 86400000;
  const last7 = now - 7 * ONE_DAY;
  const last30 = now - 30 * ONE_DAY;
  const lastYear = now - 365 * ONE_DAY;

  const recent: MediaLibrary.Asset[] = [];
  const lastMonth: MediaLibrary.Asset[] = [];
  const lastYearGroup: MediaLibrary.Asset[] = [];
  const older: MediaLibrary.Asset[] = [];

  for (const a of assets) {
    if (a.creationTime >= last7) recent.push(a);
    else if (a.creationTime >= last30) lastMonth.push(a);
    else if (a.creationTime >= lastYear) lastYearGroup.push(a);
    else older.push(a);
  }

  return { recent, lastMonth, lastYear: lastYearGroup, older };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PhotosScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const alert = useAlert();

  // ---- shared state ----
  const [tabIndex, setTabIndex] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedMemory, setSelectedMemory] = useState<{ title: string } | null>(null);

  // ---- Library tab state ----
  const [libraryAssets, setLibraryAssets] = useState<MediaLibrary.Asset[]>([]);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // ---- Full-screen viewer state ----
  const [selectedAsset, setSelectedAsset] = useState<MediaLibrary.Asset | null>(null);

  // ---- For You tab state ----
  const [forYouAssets, setForYouAssets] = useState<MediaLibrary.Asset[]>([]);
  const [forYouLoading, setForYouLoading] = useState(false);

  // ---- Albums tab state ----
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [albumCovers, setAlbumCovers] = useState<Record<string, string>>({});
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<MediaLibrary.Album | null>(null);
  const [albumAssets, setAlbumAssets] = useState<MediaLibrary.Asset[]>([]);
  const [albumEndCursor, setAlbumEndCursor] = useState<string | undefined>(undefined);
  const [albumHasNextPage, setAlbumHasNextPage] = useState(true);
  const [albumAssetsLoading, setAlbumAssetsLoading] = useState(false);
  const [showCreateAlbum, setShowCreateAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');

  // ---- Refs to track cancellation ----
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ------------------------------------------------------------------
  // Permissions
  // ------------------------------------------------------------------
  const requestMediaPermission = useCallback(async () => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
      setPermissionStatus('denied');
      setCanAskAgain(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Check first so we know whether we can still prompt.
      const existing = await MediaLibrary.getPermissionsAsync();
      if (existing.status === 'granted') {
        setPermissionStatus('granted');
        setCanAskAgain(true);
        setLoading(false);
        return;
      }
      if (!existing.canAskAgain) {
        setPermissionStatus('denied');
        setCanAskAgain(false);
        setLoading(false);
        return;
      }
      const result = await withAutoLockSuppressed(() => MediaLibrary.requestPermissionsAsync());
      setPermissionStatus(result.status === 'granted' ? 'granted' : 'denied');
      setCanAskAgain(result.canAskAgain);
    } catch {
      setPermissionStatus('denied');
      setCanAskAgain(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await requestMediaPermission();
    })();
    return () => {
      cancelled = true;
    };
  }, [requestMediaPermission]);

  // ------------------------------------------------------------------
  // Library: load initial page of photos
  // ------------------------------------------------------------------
  const loadLibraryPhotos = useCallback(
    async (after?: string) => {
      if (!mountedRef.current) return;
      try {
        const result = await MediaLibrary.getAssetsAsync({
          first: PAGE_SIZE,
          after,
          mediaType: 'photo',
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
        if (!mountedRef.current) return;

        if (after) {
          setLibraryAssets((prev) => [...prev, ...result.assets]);
        } else {
          setLibraryAssets(result.assets);
        }
        setEndCursor(result.endCursor);
        setHasNextPage(result.hasNextPage);
      } catch {
        // silently handle
      }
    },
    [],
  );

  useEffect(() => {
    if (permissionStatus === 'granted') {
      loadLibraryPhotos();
    }
  }, [permissionStatus, loadLibraryPhotos]);

  const loadMoreLibrary = useCallback(() => {
    if (loadingMore || !hasNextPage || !endCursor) return;
    setLoadingMore(true);
    loadLibraryPhotos(endCursor).finally(() => {
      if (mountedRef.current) setLoadingMore(false);
    });
  }, [loadingMore, hasNextPage, endCursor, loadLibraryPhotos]);

  // ------------------------------------------------------------------
  // For You: load photos for grouping
  // ------------------------------------------------------------------
  useEffect(() => {
    if (tabIndex !== 1 || permissionStatus !== 'granted') return;
    let cancelled = false;

    (async () => {
      setForYouLoading(true);
      try {
        const result = await MediaLibrary.getAssetsAsync({
          first: 200,
          mediaType: 'photo',
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
        if (!cancelled) setForYouAssets(result.assets);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setForYouLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tabIndex, permissionStatus]);

  // ------------------------------------------------------------------
  // Albums: load albums + covers
  // ------------------------------------------------------------------
  useEffect(() => {
    if (tabIndex !== 2 || permissionStatus !== 'granted') return;
    let cancelled = false;

    (async () => {
      setAlbumsLoading(true);
      try {
        const result = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
        if (cancelled) return;
        setAlbums(result);

        // Fetch cover for each album (first asset)
        const covers: Record<string, string> = {};
        await Promise.all(
          result.map(async (album) => {
            try {
              const page = await MediaLibrary.getAssetsAsync({
                album: album.id,
                first: 1,
                mediaType: 'photo',
                sortBy: [MediaLibrary.SortBy.creationTime],
              });
              if (page.assets.length > 0) {
                covers[album.id] = page.assets[0].uri;
              }
            } catch {
              // skip
            }
          }),
        );
        if (!cancelled) setAlbumCovers(covers);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setAlbumsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tabIndex, permissionStatus]);

  // ------------------------------------------------------------------
  // Album detail: load assets for selected album
  // ------------------------------------------------------------------
  const loadAlbumAssets = useCallback(
    async (album: MediaLibrary.Album, after?: string) => {
      try {
        const result = await MediaLibrary.getAssetsAsync({
          album: album.id,
          first: PAGE_SIZE,
          after,
          mediaType: 'photo',
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
        if (!mountedRef.current) return;

        if (after) {
          setAlbumAssets((prev) => [...prev, ...result.assets]);
        } else {
          setAlbumAssets(result.assets);
        }
        setAlbumEndCursor(result.endCursor);
        setAlbumHasNextPage(result.hasNextPage);
      } catch {
        // ignore
      }
    },
    [],
  );

  const openAlbum = useCallback(
    (album: MediaLibrary.Album) => {
      setSelectedAlbum(album);
      setAlbumAssets([]);
      setAlbumEndCursor(undefined);
      setAlbumHasNextPage(true);
      setAlbumAssetsLoading(true);
      loadAlbumAssets(album).finally(() => {
        if (mountedRef.current) setAlbumAssetsLoading(false);
      });
    },
    [loadAlbumAssets],
  );

  const loadMoreAlbumAssets = useCallback(() => {
    if (!selectedAlbum || !albumHasNextPage || !albumEndCursor || albumAssetsLoading) return;
    setAlbumAssetsLoading(true);
    loadAlbumAssets(selectedAlbum, albumEndCursor).finally(() => {
      if (mountedRef.current) setAlbumAssetsLoading(false);
    });
  }, [selectedAlbum, albumHasNextPage, albumEndCursor, albumAssetsLoading, loadAlbumAssets]);

  // ------------------------------------------------------------------
  // Create album
  // ------------------------------------------------------------------
  const handleCreateAlbum = useCallback(async () => {
    const name = newAlbumName.trim();
    if (!name) {
      alert('Error', 'Please enter an album name.');
      return;
    }
    try {
      // On Android we need an asset to create an album; on iOS it works without one.
      // Try without asset first; if that fails, inform the user.
      const album = await MediaLibrary.createAlbumAsync(name);
      setAlbums((prev) => [album, ...prev]);
      setNewAlbumName('');
      setShowCreateAlbum(false);
      alert('Success', `Album "${name}" created.`);
    } catch {
      alert(
        'Cannot Create Album',
        Platform.OS === 'android'
          ? 'On Android, an album needs at least one photo. Add a photo to create the album.'
          : 'Failed to create the album. Please try again.',
      );
    }
  }, [newAlbumName, alert]);

  // ------------------------------------------------------------------
  // Share
  // ------------------------------------------------------------------
  const handleShare = useCallback(async (asset: MediaLibrary.Asset) => {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      const uri = info.localUri || info.uri;
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        alert('Sharing Unavailable', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(uri);
    } catch {
      alert('Error', 'Unable to share this photo.');
    }
  }, [alert]);

  // ==================================================================
  // Full-screen photo viewer
  // ==================================================================
  if (selectedAsset) {
    return (
      <View style={[styles.fullView, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.fullTopBar}>
          <Pressable onPress={() => setSelectedAsset(null)}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </Pressable>
          <Pressable onPress={() => handleShare(selectedAsset)}>
            <Ionicons name="share-outline" size={24} color="#fff" />
          </Pressable>
        </View>
        <Image source={{ uri: selectedAsset.uri }} style={styles.fullImage} resizeMode="contain" />
      </View>
    );
  }

  // ==================================================================
  // Album detail view
  // ==================================================================
  if (selectedAlbum) {
    return (
      <View style={[styles.container, { backgroundColor: colors.systemBackground }]}>
        <CupertinoNavigationBar
          title={selectedAlbum.title}
          leftButton={
            <Pressable
              onPress={() => {
                setSelectedAlbum(null);
                setAlbumAssets([]);
              }}
            >
              <Text style={[typography.body, { color: colors.systemBlue }]}>Back</Text>
            </Pressable>
          }
        />
        {albumAssetsLoading && albumAssets.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.systemBlue} />
          </View>
        ) : albumAssets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="images-outline" size={64} color={colors.systemGray3} />
            <Text style={[typography.headline, { color: colors.label, marginTop: 16 }]}>No Photos</Text>
            <Text style={[typography.body, { color: colors.secondaryLabel, textAlign: 'center', marginTop: 8 }]}>
              This album has no photos yet.
            </Text>
          </View>
        ) : (
          <FlatList
            data={albumAssets}
            keyExtractor={(item) => item.id}
            numColumns={COLS}
            columnWrapperStyle={{ gap: GRID_GAP }}
            contentContainerStyle={{ gap: GRID_GAP, padding: GRID_GAP, paddingBottom: insets.bottom + 90 }}
            renderItem={({ item }) => (
              <Pressable onPress={() => setSelectedAsset(item)}>
                <Image source={{ uri: item.uri }} style={styles.thumb} />
              </Pressable>
            )}
            onEndReached={loadMoreAlbumAssets}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              albumAssetsLoading ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.systemBlue} /> : null
            }
          />
        )}
      </View>
    );
  }

  // ==================================================================
  // Main screen with tabs
  // ==================================================================
  return (
    <View style={[styles.container, { backgroundColor: colors.systemBackground }]}>
      <CupertinoNavigationBar
        title="Photos"
        leftButton={
          <Text style={[typography.body, { color: colors.systemBlue }]} onPress={() => navigation.goBack()}>
            Back
          </Text>
        }
      />

      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <CupertinoSegmentedControl values={TABS} selectedIndex={tabIndex} onChange={setTabIndex} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.systemBlue} />
        </View>
      ) : permissionStatus !== 'granted' ? (
        // Permission denied empty state
        <View style={styles.emptyState}>
          <Ionicons name="images-outline" size={64} color={colors.systemGray3} />
          <Text style={[typography.headline, { color: colors.label, marginTop: 16 }]}>Photo Access Required</Text>
          <Text
            style={[
              typography.body,
              { color: colors.secondaryLabel, textAlign: 'center', marginTop: 8, marginHorizontal: 32 },
            ]}
          >
            {canAskAgain
              ? 'Grant photo library access to browse your photos.'
              : 'Photo access was denied. Enable it for this app in system settings.'}
          </Text>
          <Pressable
            style={[styles.browseBtn, { backgroundColor: colors.systemBlue }]}
            onPress={() => {
              if (canAskAgain) {
                requestMediaPermission();
              } else {
                Linking.openSettings().catch(() => {});
              }
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {canAskAgain ? 'Grant Access' : 'Open Settings'}
            </Text>
          </Pressable>
        </View>
      ) : tabIndex === 0 ? (
        // ============================================================
        // Library Tab
        // ============================================================
        loading ? (
          // Skeleton loading grid
          <ScrollView contentContainerStyle={{ padding: GRID_GAP, paddingBottom: insets.bottom + 90 }}>
            {/* Memories skeleton */}
            <View style={{ marginBottom: 16 }}>
              <CupertinoSkeleton width="40%" height={18} borderRadius={9} style={{ marginBottom: 12 }} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {[0, 1, 2, 3].map((i) => (
                  <CupertinoSkeleton
                    key={i}
                    width={120}
                    height={80}
                    borderRadius={12}
                    style={{ marginRight: 10 }}
                  />
                ))}
              </ScrollView>
            </View>
            {/* Photo grid skeleton */}
            <View style={styles.grid}>
              {Array.from({ length: 12 }).map((_, i) => (
                <CupertinoSkeleton
                  key={i}
                  width={THUMB_SIZE}
                  height={THUMB_SIZE}
                  borderRadius={0}
                />
              ))}
            </View>
          </ScrollView>
        ) : libraryAssets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="images-outline" size={64} color={colors.systemGray3} />
            <Text style={[typography.headline, { color: colors.label, marginTop: 16 }]}>No Photos Yet</Text>
            <Text
              style={[
                typography.body,
                { color: colors.secondaryLabel, textAlign: 'center', marginTop: 8, marginHorizontal: 32 },
              ]}
            >
              Photos you take or import will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={libraryAssets}
            keyExtractor={(item) => item.id}
            numColumns={COLS}
            columnWrapperStyle={{ gap: GRID_GAP }}
            contentContainerStyle={{ gap: GRID_GAP, padding: GRID_GAP, paddingBottom: insets.bottom + 90 }}
            ListHeaderComponent={
              <MemoriesSection
                onSelectMemory={setSelectedMemory}
                colors={colors}
                typography={typography}
              />
            }
            renderItem={({ item }) => (
              <Pressable onPress={() => setSelectedAsset(item)}>
                <Image source={{ uri: item.uri }} style={styles.thumb} />
              </Pressable>
            )}
            onEndReached={loadMoreLibrary}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.systemBlue} /> : null
            }
          />
        )
      ) : tabIndex === 1 ? (
        // ============================================================
        // For You Tab
        // ============================================================
        <ForYouTab
          assets={forYouAssets}
          loading={forYouLoading}
          colors={colors}
          typography={typography}
          insets={insets}
          onSelectAsset={setSelectedAsset}
        />
      ) : (
        // ============================================================
        // Albums Tab
        // ============================================================
        <AlbumsTab
          albums={albums}
          albumCovers={albumCovers}
          loading={albumsLoading}
          colors={colors}
          typography={typography}
          insets={insets}
          showCreateAlbum={showCreateAlbum}
          newAlbumName={newAlbumName}
          onToggleCreate={() => setShowCreateAlbum((v) => !v)}
          onChangeAlbumName={setNewAlbumName}
          onCreateAlbum={handleCreateAlbum}
          onOpenAlbum={openAlbum}
        />
      )}

      {/* Memory detail modal */}
      <Modal
        visible={selectedMemory !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMemory(null)}
      >
        <View style={styles.memoryModalOverlay}>
          <View style={[styles.memoryModalCard, { backgroundColor: colors.secondarySystemGroupedBackground ?? colors.systemBackground }]}>
            <Text style={[typography.title2, { color: colors.label, marginBottom: 8 }]}>
              {selectedMemory?.title}
            </Text>
            <Text style={[typography.body, { color: colors.secondaryLabel, textAlign: 'center' }]}>
              Coming Soon
            </Text>
            <Pressable
              onPress={() => setSelectedMemory(null)}
              style={[styles.memoryModalClose, { backgroundColor: colors.systemBlue }]}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ======================================================================
// Memories Section Component
// ======================================================================
interface MemoriesSectionProps {
  onSelectMemory: (memory: { title: string }) => void;
  colors: CupertinoColors;
  typography: typeof Typography;
}

function MemoriesSection({ onSelectMemory, colors, typography }: MemoriesSectionProps) {
  return (
    <View style={styles.memoriesSection}>
      <Text style={[typography.title3, { color: colors.label, fontWeight: '700', marginBottom: 10, paddingHorizontal: 4 }]}>
        Memories
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4, gap: 10 }}>
        {MEMORIES.map((memory) => (
          <Pressable key={memory.id} onPress={() => onSelectMemory({ title: memory.title })}>
            <LinearGradient
              colors={memory.colors}
              style={styles.memoryCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.memoryCardTitle}>{memory.title}</Text>
            </LinearGradient>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ======================================================================
// For You Tab Component
// ======================================================================
interface ForYouTabProps {
  assets: MediaLibrary.Asset[];
  loading: boolean;
  colors: CupertinoColors;
  typography: typeof Typography;
  insets: { bottom: number };
  onSelectAsset: (asset: MediaLibrary.Asset) => void;
}

function ForYouTab({ assets, loading, colors, typography, insets, onSelectAsset }: ForYouTabProps) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.systemBlue} />
      </View>
    );
  }

  if (assets.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="heart-outline" size={64} color={colors.systemGray3} />
        <Text style={[typography.headline, { color: colors.label, marginTop: 16 }]}>No Memories Yet</Text>
        <Text style={[typography.body, { color: colors.secondaryLabel, textAlign: 'center', marginTop: 8 }]}>
          Take some photos and your memories will appear here.
        </Text>
      </View>
    );
  }

  const { recent, lastMonth, lastYear } = groupByDateRange(assets);

  // Pick featured photos: up to 4 from the most recent
  const featured = assets.slice(0, 4);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 90 }} showsVerticalScrollIndicator={false}>
      {/* Featured / Memories Header */}
      {featured.length > 0 && (
        <View style={styles.sectionContainer}>
          <Text style={[typography.title2, { color: colors.label, marginBottom: 12, paddingHorizontal: 16 }]}>
            Featured Photos
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {featured.map((asset) => (
              <Pressable key={asset.id} onPress={() => onSelectAsset(asset)} style={styles.featuredCard}>
                <Image source={{ uri: asset.uri }} style={styles.featuredImage} />
                <Text style={[typography.caption1, styles.featuredLabel]} numberOfLines={1}>
                  {new Date(asset.creationTime).toLocaleDateString()}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Memories grouped by date */}
      <MemorySection
        title="Last 7 Days"
        assets={recent}
        colors={colors}
        typography={typography}
        onSelectAsset={onSelectAsset}
      />
      <MemorySection
        title="Last Month"
        assets={lastMonth}
        colors={colors}
        typography={typography}
        onSelectAsset={onSelectAsset}
      />
      <MemorySection
        title="Last Year"
        assets={lastYear}
        colors={colors}
        typography={typography}
        onSelectAsset={onSelectAsset}
      />
    </ScrollView>
  );
}

// ======================================================================
// Memory Section Sub-component
// ======================================================================
interface MemorySectionProps {
  title: string;
  assets: MediaLibrary.Asset[];
  colors: CupertinoColors;
  typography: typeof Typography;
  onSelectAsset: (asset: MediaLibrary.Asset) => void;
}

function MemorySection({ title, assets, colors, typography, onSelectAsset }: MemorySectionProps) {
  if (assets.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <Text style={[typography.headline, { color: colors.label, paddingHorizontal: 16, marginBottom: 8 }]}>
        {title}
      </Text>
      <View style={[styles.grid, { paddingHorizontal: GRID_GAP }]}>
        {assets.slice(0, 9).map((asset) => (
          <Pressable key={asset.id} onPress={() => onSelectAsset(asset)}>
            <Image source={{ uri: asset.uri }} style={styles.thumb} />
          </Pressable>
        ))}
      </View>
      {assets.length > 9 && (
        <Text
          style={[
            typography.caption1,
            { color: colors.secondaryLabel, paddingHorizontal: 16, marginTop: 4 },
          ]}
        >
          +{assets.length - 9} more
        </Text>
      )}
    </View>
  );
}

// ======================================================================
// Albums Tab Component
// ======================================================================
interface AlbumsTabProps {
  albums: MediaLibrary.Album[];
  albumCovers: Record<string, string>;
  loading: boolean;
  colors: CupertinoColors;
  typography: typeof Typography;
  insets: { bottom: number };
  showCreateAlbum: boolean;
  newAlbumName: string;
  onToggleCreate: () => void;
  onChangeAlbumName: (name: string) => void;
  onCreateAlbum: () => void;
  onOpenAlbum: (album: MediaLibrary.Album) => void;
}

function AlbumsTab({
  albums,
  albumCovers,
  loading,
  colors,
  typography,
  insets,
  showCreateAlbum,
  newAlbumName,
  onToggleCreate,
  onChangeAlbumName,
  onCreateAlbum,
  onOpenAlbum,
}: AlbumsTabProps) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.systemBlue} />
      </View>
    );
  }

  const ALBUM_COLS = 2;
  const ALBUM_GAP = 12;
  const ALBUM_SIZE = (SCREEN_WIDTH - ALBUM_GAP * (ALBUM_COLS + 1)) / ALBUM_COLS;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 90 }} showsVerticalScrollIndicator={false}>
      {/* Create Album */}
      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <Pressable
          style={[styles.createAlbumBtn, { backgroundColor: colors.systemBlue }]}
          onPress={onToggleCreate}
        >
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16, marginLeft: 8 }}>Create Album</Text>
        </Pressable>

        {showCreateAlbum && (
          <View style={[styles.createAlbumForm, { backgroundColor: colors.systemGray6, borderColor: colors.separator }]}>
            <TextInput
              style={[typography.body, styles.albumInput, { color: colors.label, borderColor: colors.separator }]}
              placeholder="Album name"
              placeholderTextColor={colors.tertiaryLabel}
              value={newAlbumName}
              onChangeText={onChangeAlbumName}
              autoFocus
            />
            <Pressable
              style={[styles.createConfirmBtn, { backgroundColor: colors.systemBlue }]}
              onPress={onCreateAlbum}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Create</Text>
            </Pressable>
          </View>
        )}
      </View>

      {albums.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="folder-outline" size={64} color={colors.systemGray3} />
          <Text style={[typography.headline, { color: colors.label, marginTop: 16 }]}>No Albums</Text>
          <Text style={[typography.body, { color: colors.secondaryLabel, textAlign: 'center', marginTop: 8 }]}>
            Create albums to organize your photos.
          </Text>
        </View>
      ) : (
        <View style={[styles.albumGrid, { gap: ALBUM_GAP, paddingHorizontal: ALBUM_GAP }]}>
          {albums.map((album) => (
            <Pressable
              key={album.id}
              style={{ width: ALBUM_SIZE }}
              onPress={() => onOpenAlbum(album)}
            >
              <View style={[styles.albumCover, { width: ALBUM_SIZE, height: ALBUM_SIZE, backgroundColor: colors.systemGray5 }]}>
                {albumCovers[album.id] ? (
                  <Image source={{ uri: albumCovers[album.id] }} style={StyleSheet.absoluteFill} />
                ) : (
                  <Ionicons name="images-outline" size={40} color={colors.systemGray3} />
                )}
              </View>
              <Text style={[typography.subhead, { color: colors.label, marginTop: 6 }]} numberOfLines={1}>
                {album.title}
              </Text>
              <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                {album.assetCount}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ======================================================================
// Styles
// ======================================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  gridContainer: { flexGrow: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, padding: GRID_GAP },
  thumb: { width: THUMB_SIZE, height: THUMB_SIZE },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60 },
  browseBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },

  // Memories
  memoriesSection: {
    paddingTop: 12,
    paddingBottom: 16,
    marginBottom: GRID_GAP,
  },
  memoryCard: {
    width: 120,
    height: 80,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  memoryCardTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  memoryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryModalCard: {
    width: 280,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  memoryModalClose: {
    marginTop: 20,
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 10,
  },

  fullView: { flex: 1, backgroundColor: '#000' },
  fullTopBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  fullImage: { flex: 1 },

  // For You tab
  sectionContainer: { marginTop: 20 },
  featuredCard: {
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    width: SCREEN_WIDTH * 0.6,
  },
  featuredImage: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.45,
    borderRadius: 12,
  },
  featuredLabel: {
    color: '#fff',
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },

  // Albums tab
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  albumCover: {
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createAlbumBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  createAlbumForm: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  albumInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  createConfirmBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
});
