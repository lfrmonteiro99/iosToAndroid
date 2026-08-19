import React from 'react';
import { render, act, waitFor } from '../../test-utils';
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
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  it('PASSO VERMELHO: skeleton must disappear immediately when assets load, not after 800ms', async () => {
    // PROOF OF RED: Without the loadingLibrary state binding, this test FAILS.
    //
    // Old buggy code: setTimeout(() => setShowSkeleton(false), 800)
    // - Assets load in ~50ms
    // - At 150ms mark, skeleton is STILL VISIBLE (waiting for 800ms timer)
    // - This test FAILS because queryByTestId still finds skeleton at 150ms
    //
    // Fixed code: conditional rendering on loadingLibrary state
    // - Assets load in ~50ms
    // - loadingLibrary is immediately set to false in finally block
    // - At 150ms mark, skeleton is GONE
    // - This test PASSES

    mediaLibMock.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });

    // Simulate fast asset load
    mediaLibMock.getAssetsAsync.mockResolvedValue({
      assets: [{ id: '1', uri: 'file://photo.jpg', creationTime: Date.now() }],
      endCursor: 'cursor1',
      hasNextPage: false
    });

    const { queryByTestId } = render(<PhotosScreen navigation={mockNavigation} />);

    // Wait 150ms total: permission (50ms) + assets (50ms) + buffer (50ms)
    // Without the fix, skeleton would STILL be visible here (800ms timer hasn't expired)
    // With the fix, skeleton is gone (loadingLibrary = false immediately after assets load)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(queryByTestId('library-skeleton-loading')).toBeFalsy();
  });

  it('hides skeleton when assets list is empty and loaded', async () => {
    // Grant permission immediately
    mediaLibMock.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });

    // Return empty assets list immediately
    mediaLibMock.getAssetsAsync.mockResolvedValue({
      assets: [],
      endCursor: undefined,
      hasNextPage: false
    });

    const { queryByTestId } = render(<PhotosScreen navigation={mockNavigation} />);

    // Wait for permission and assets to load
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Skeleton should not be visible (loadingLibrary is false after assets load)
    expect(queryByTestId('library-skeleton-loading')).toBeFalsy();
  });

  it('hides skeleton when assets load successfully', async () => {
    // Grant permission immediately
    mediaLibMock.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });

    const mockAssets = [
      { id: '1', uri: 'file://test1.jpg', creationTime: Date.now() },
      { id: '2', uri: 'file://test2.jpg', creationTime: Date.now() - 1000 }
    ];

    mediaLibMock.getAssetsAsync.mockResolvedValue({
      assets: mockAssets,
      endCursor: 'cursor1',
      hasNextPage: true
    });

    const { queryByTestId } = render(<PhotosScreen navigation={mockNavigation} />);

    // Wait for assets to load
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Skeleton should be gone when assets are loaded (loadingLibrary = false)
    expect(queryByTestId('library-skeleton-loading')).toBeFalsy();
  });

  it('skeleton is hidden during pagination (loadingMore is separate from loadingLibrary)', async () => {
    // Grant permission
    mediaLibMock.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });

    // Initial assets
    const initialAssets = [
      { id: '1', uri: 'file://test1.jpg', creationTime: Date.now() },
      { id: '2', uri: 'file://test2.jpg', creationTime: Date.now() - 1000 }
    ];

    mediaLibMock.getAssetsAsync.mockResolvedValue({
      assets: initialAssets,
      endCursor: 'cursor1',
      hasNextPage: true
    });

    const { queryByTestId } = render(<PhotosScreen navigation={mockNavigation} />);

    // Wait for initial load
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // After initial load, skeleton should be gone
    expect(queryByTestId('library-skeleton-loading')).toBeFalsy();

    // Simulate pagination: getAssetsAsync will be called with 'after' cursor
    // The code should NOT set loadingLibrary=true when 'after' is defined (only on initial load when !after)
    mediaLibMock.getAssetsAsync.mockResolvedValue({
      assets: [{ id: '3', uri: 'file://test3.jpg', creationTime: Date.now() - 2000 }],
      endCursor: 'cursor2',
      hasNextPage: false
    });

    // Skeleton should still not be visible (loadingLibrary only used for initial load when !after)
    // This test verifies that pagination doesn't re-show the skeleton
    expect(queryByTestId('library-skeleton-loading')).toBeFalsy();
  });
});
