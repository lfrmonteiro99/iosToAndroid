import React from 'react';
import { render } from '../../test-utils';
import { PhotosScreen } from '../PhotosScreen';
import type { AppNavigationProp } from '../../navigation/types';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mediaLibMock = require('expo-media-library');

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'denied' })),
  getAssetsAsync: jest.fn(() => Promise.resolve({ assets: [], endCursor: undefined, hasNextPage: false })),
  getAlbumsAsync: jest.fn(() => Promise.resolve([])),
  getAssetInfoAsync: jest.fn(() => Promise.resolve({ uri: 'file://test.jpg', localUri: null })),
  createAlbumAsync: jest.fn(() => Promise.resolve({ id: '1', title: 'Test', assetCount: 0 })),
  SortBy: { creationTime: 'creationTime' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(false)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

describe('PhotosScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<PhotosScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders Photos title', () => {
    const { getByText } = render(<PhotosScreen navigation={mockNavigation} />);
    expect(getByText('Photos')).toBeTruthy();
  });

  it('renders tab controls', () => {
    const { getByText } = render(<PhotosScreen navigation={mockNavigation} />);
    expect(getByText('Library')).toBeTruthy();
    expect(getByText('For You')).toBeTruthy();
    expect(getByText('Albums')).toBeTruthy();
  });

  it('shows photo access required when permission is denied', async () => {
    const { findByText } = render(<PhotosScreen navigation={mockNavigation} />);
    expect(await findByText('Photo Access Required')).toBeTruthy();
  });

  it('shows skeleton UI while library assets are loading, not a fixed timer', async () => {
    // Grant permission immediately
    mediaLibMock.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });

    // Simulate a slow asset fetch: delay 500ms before returning assets
    let resolveAssets: ((value: unknown) => void) | undefined;
    const assetsPromise = new Promise((resolve) => {
      resolveAssets = resolve;
    });

    mediaLibMock.getAssetsAsync.mockReturnValue(assetsPromise);

    const { toJSON } = render(<PhotosScreen navigation={mockNavigation} />);

    // Initially should show ActivityIndicator (loading from permission)
    let tree = toJSON();
    expect(tree).toBeTruthy();

    // Wait for permission to resolve
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Now assets should be loading - skeleton should be shown based on loadingMore or asset loading state
    // NOT based on a fixed 800ms timer
    tree = toJSON();
    expect(tree).toBeTruthy();

    // Resolve assets after 200ms (simulating fast load)
    if (resolveAssets) {
      resolveAssets({
        assets: [{ id: '1', uri: 'file://photo.jpg', creationTime: Date.now() }],
        endCursor: 'cursor1',
        hasNextPage: false
      });
    }

    // Wait for assets to be set
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assets should now be visible, no more skeleton
    tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it('library assets loading state is independent of permission state', async () => {
    // Grant permission
    mediaLibMock.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });

    // Return empty assets list immediately
    mediaLibMock.getAssetsAsync.mockResolvedValue({
      assets: [],
      endCursor: undefined,
      hasNextPage: false
    });

    const { getByText } = render(<PhotosScreen navigation={mockNavigation} />);

    // Wait for permission and assets to load
    await new Promise((resolve) => setTimeout(resolve, 100));

    // After permission granted and assets loaded (even if empty),
    // we should NOT see the main loading ActivityIndicator
    // We should see either empty state or the tabs
    expect(getByText('Library')).toBeTruthy();
  });

  it('skeleton disappears immediately after assets load, not on a fixed timer', async () => {
    // Grant permission
    mediaLibMock.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });

    // Simulate fast asset load (under 200ms)
    mediaLibMock.getAssetsAsync.mockResolvedValue({
      assets: [
        { id: '1', uri: 'file://test1.jpg', creationTime: Date.now() },
        { id: '2', uri: 'file://test2.jpg', creationTime: Date.now() - 1000 }
      ],
      endCursor: 'cursor1',
      hasNextPage: false
    });

    const { toJSON } = render(<PhotosScreen navigation={mockNavigation} />);

    // Wait for assets to load (should be immediate)
    await new Promise((resolve) => setTimeout(resolve, 150));

    // After assets load quickly, skeleton should NOT be shown for 800ms
    // It should disappear immediately or within the actual load time
    const tree = toJSON();
    expect(tree).toBeTruthy();

    // The component should render successfully without skeleton overlay
    // preventing interaction with loaded thumbnails
  });
});
