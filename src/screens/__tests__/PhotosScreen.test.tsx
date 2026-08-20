import React from 'react';
import { FlatList } from 'react-native';
import { render, act, fireEvent } from '../../test-utils';
import { PhotosScreen } from '../PhotosScreen';
import { CupertinoSkeleton } from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mediaLibMock = require('expo-media-library');

jest.mock('expo-media-library', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAssetsAsync: jest.fn(),
  getAlbumsAsync: jest.fn(),
  getAssetInfoAsync: jest.fn(),
  createAlbumAsync: jest.fn(),
  SortBy: { creationTime: 'creationTime' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(false)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

type MediaPage = {
  assets: { id: string; uri: string; creationTime: number }[];
  endCursor: string | undefined;
  hasNextPage: boolean;
};

/**
 * A promise whose settlement is controlled by the test, so the screen can be
 * observed *while* `getAssetsAsync` is still in flight. Asserting only after
 * the promise resolves cannot distinguish "skeleton correctly hidden" from
 * "skeleton never rendered at all" — the defect this suite exists to catch.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Swallow the rejection until the screen's own catch runs, so an unhandled
  // rejection never fails an unrelated test.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

/** Drains the microtask queue so pending effects/awaits settle inside act(). */
async function flush() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function asset(id: string) {
  return { id, uri: `file://photo-${id}.jpg`, creationTime: 1_700_000_000_000 - Number(id) };
}

describe('PhotosScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: permission already granted, library resolves empty.
    mediaLibMock.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mediaLibMock.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mediaLibMock.getAssetsAsync.mockResolvedValue({ assets: [], endCursor: undefined, hasNextPage: false });
    mediaLibMock.getAlbumsAsync.mockResolvedValue([]);
    mediaLibMock.getAssetInfoAsync.mockResolvedValue({ uri: 'file://test.jpg', localUri: null });
    mediaLibMock.createAlbumAsync.mockResolvedValue({ id: '1', title: 'Test', assetCount: 0 });
  });

  it('renders without crashing', async () => {
    const { toJSON } = render(<PhotosScreen navigation={mockNavigation} />);
    await flush();
    expect(toJSON()).toBeTruthy();
  });

  it('renders Photos title', async () => {
    const { getByText } = render(<PhotosScreen navigation={mockNavigation} />);
    await flush();
    expect(getByText('Photos')).toBeTruthy();
  });

  it('renders tab controls', async () => {
    const { getByText } = render(<PhotosScreen navigation={mockNavigation} />);
    await flush();
    expect(getByText('Library')).toBeTruthy();
    expect(getByText('For You')).toBeTruthy();
    expect(getByText('Albums')).toBeTruthy();
  });

  it('shows photo access required when permission is denied', async () => {
    mediaLibMock.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    mediaLibMock.requestPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });

    const { findByText } = render(<PhotosScreen navigation={mockNavigation} />);
    expect(await findByText('Photo Access Required')).toBeTruthy();
  });

  // ------------------------------------------------------------------
  // Skeleton bound to the real load
  // ------------------------------------------------------------------

  it('shows the skeleton while getAssetsAsync is still pending, and swaps it for the grid once it resolves', async () => {
    const page = deferred<MediaPage>();
    mediaLibMock.getAssetsAsync.mockReturnValue(page.promise);

    const { queryByTestId, queryByText, UNSAFE_queryAllByType, UNSAFE_getByType } = render(
      <PhotosScreen navigation={mockNavigation} />,
    );

    // Permission resolves; the asset fetch is deliberately left in flight.
    await flush();

    // While loading: skeleton present, and neither the empty state nor the grid.
    // Asserted by component type first, so a failure here means the loading UI
    // is genuinely wrong rather than a testID being absent.
    expect(UNSAFE_queryAllByType(CupertinoSkeleton).length).toBeGreaterThan(0);
    expect(queryByText('No Photos Yet')).toBeNull();
    expect(UNSAFE_queryAllByType(FlatList)).toHaveLength(0);
    expect(queryByTestId('library-skeleton-loading')).toBeTruthy();

    await act(async () => {
      page.resolve({ assets: [asset('1'), asset('2')], endCursor: 'cursor-1', hasNextPage: true });
      await page.promise;
    });
    await flush();

    // Once loaded: skeleton gone, grid rendered with the assets.
    expect(queryByTestId('library-skeleton-loading')).toBeNull();
    expect(UNSAFE_queryAllByType(CupertinoSkeleton)).toHaveLength(0);
    expect(UNSAFE_getByType(FlatList).props.data).toHaveLength(2);
  });

  it('keeps the empty state hidden while loading and shows it only after an empty page resolves', async () => {
    const page = deferred<MediaPage>();
    mediaLibMock.getAssetsAsync.mockReturnValue(page.promise);

    const { queryByTestId, queryByText, UNSAFE_queryAllByType } = render(
      <PhotosScreen navigation={mockNavigation} />,
    );
    await flush();

    // The inverse of the fix: "No Photos Yet" must NOT be the loading state.
    expect(queryByText('No Photos Yet')).toBeNull();
    expect(UNSAFE_queryAllByType(CupertinoSkeleton).length).toBeGreaterThan(0);
    expect(queryByTestId('library-skeleton-loading')).toBeTruthy();

    await act(async () => {
      page.resolve({ assets: [], endCursor: undefined, hasNextPage: false });
      await page.promise;
    });
    await flush();

    expect(queryByTestId('library-skeleton-loading')).toBeNull();
    expect(queryByText('No Photos Yet')).toBeTruthy();
  });

  it('never shows the library skeleton when permission is denied', async () => {
    mediaLibMock.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });

    const { queryByTestId, getByText } = render(<PhotosScreen navigation={mockNavigation} />);
    await flush();

    expect(getByText('Photo Access Required')).toBeTruthy();
    expect(queryByTestId('library-skeleton-loading')).toBeNull();
    expect(mediaLibMock.getAssetsAsync).not.toHaveBeenCalled();
  });

  it('hides the skeleton when the asset fetch rejects instead of leaving it up forever', async () => {
    const page = deferred<MediaPage>();
    mediaLibMock.getAssetsAsync.mockReturnValue(page.promise);

    const { queryByTestId, queryByText, UNSAFE_queryAllByType } = render(
      <PhotosScreen navigation={mockNavigation} />,
    );
    await flush();

    expect(UNSAFE_queryAllByType(CupertinoSkeleton).length).toBeGreaterThan(0);
    expect(queryByTestId('library-skeleton-loading')).toBeTruthy();

    await act(async () => {
      page.reject(new Error('media library unavailable'));
      await page.promise.catch(() => {});
    });
    await flush();

    expect(queryByTestId('library-skeleton-loading')).toBeNull();
    expect(queryByText('No Photos Yet')).toBeTruthy();
  });

  it('does not re-show the skeleton while a pagination fetch is in flight', async () => {
    const firstPage = deferred<MediaPage>();
    mediaLibMock.getAssetsAsync.mockReturnValue(firstPage.promise);

    const { queryByTestId, UNSAFE_getByType, UNSAFE_queryAllByType } = render(
      <PhotosScreen navigation={mockNavigation} />,
    );
    await flush();

    await act(async () => {
      firstPage.resolve({ assets: [asset('1'), asset('2')], endCursor: 'cursor-1', hasNextPage: true });
      await firstPage.promise;
    });
    await flush();

    expect(queryByTestId('library-skeleton-loading')).toBeNull();

    // Second page: left in flight on purpose. `loadLibraryPhotos` is called with
    // `after`, so it must not touch the initial-load flag.
    const secondPage = deferred<MediaPage>();
    mediaLibMock.getAssetsAsync.mockReturnValue(secondPage.promise);

    await act(async () => {
      UNSAFE_getByType(FlatList).props.onEndReached();
    });
    await flush();

    expect(mediaLibMock.getAssetsAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ after: 'cursor-1' }),
    );
    // Mid-pagination: already-loaded thumbnails stay on screen, no skeleton.
    expect(queryByTestId('library-skeleton-loading')).toBeNull();
    expect(UNSAFE_queryAllByType(CupertinoSkeleton)).toHaveLength(0);
    expect(UNSAFE_getByType(FlatList).props.data).toHaveLength(2);

    await act(async () => {
      secondPage.resolve({ assets: [asset('3')], endCursor: 'cursor-2', hasNextPage: false });
      await secondPage.promise;
    });
    await flush();

    expect(queryByTestId('library-skeleton-loading')).toBeNull();
    expect(UNSAFE_getByType(FlatList).props.data).toHaveLength(3);
  });

  // ------------------------------------------------------------------
  // Full-screen viewer paging
  //
  // The viewer used to hold a single asset, so the only way to reach the
  // next photo was to back out to the grid and tap again. It now carries the
  // list it was opened from and pages sideways through it.
  // ------------------------------------------------------------------

  async function openLibraryAt(index: number) {
    mediaLibMock.getAssetsAsync.mockResolvedValue({
      assets: [asset('1'), asset('2'), asset('3')],
      endCursor: 'cursor-1',
      hasNextPage: false,
    });
    const utils = render(<PhotosScreen navigation={mockNavigation} />);
    await flush();
    await act(async () => {
      fireEvent.press(utils.getAllByLabelText('Photo')[index]);
    });
    await flush();
    return utils;
  }

  it('opens the viewer on the photo that was tapped, not the first one', async () => {
    const { UNSAFE_getByType, getByText } = await openLibraryAt(2);

    // The whole list travels with the viewer, so the neighbours are reachable.
    expect(UNSAFE_getByType(FlatList).props.data).toHaveLength(3);
    // Third thumbnail tapped => opens at index 2, and says so.
    expect(UNSAFE_getByType(FlatList).props.initialScrollIndex).toBe(2);
    expect(getByText('3 of 3')).toBeTruthy();
  });

  it('renders the viewer as a horizontal pager so photos can be swiped', async () => {
    const { UNSAFE_getByType } = await openLibraryAt(0);

    const pager = UNSAFE_getByType(FlatList);
    expect(pager.props.horizontal).toBe(true);
    expect(pager.props.pagingEnabled).toBe(true);
    // Without getItemLayout, initialScrollIndex cannot resolve and the viewer
    // silently opens on the first photo regardless of what was tapped.
    expect(typeof pager.props.getItemLayout).toBe('function');
  });

  it('advances the counter when the pager scrolls to the next photo', async () => {
    const { UNSAFE_getByType, getByText } = await openLibraryAt(0);
    expect(getByText('1 of 3')).toBeTruthy();

    const pager = UNSAFE_getByType(FlatList);
    const pageWidth = pager.props.getItemLayout(null, 1).offset;

    await act(async () => {
      pager.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: pageWidth } } });
    });
    await flush();

    expect(getByText('2 of 3')).toBeTruthy();
  });

  it('does not update state when the asset fetch resolves after unmount', async () => {
    const page = deferred<MediaPage>();
    mediaLibMock.getAssetsAsync.mockReturnValue(page.promise);

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { queryByTestId, UNSAFE_queryAllByType, unmount } = render(<PhotosScreen navigation={mockNavigation} />);
    await flush();

    expect(UNSAFE_queryAllByType(CupertinoSkeleton).length).toBeGreaterThan(0);
    expect(queryByTestId('library-skeleton-loading')).toBeTruthy();

    unmount();

    await act(async () => {
      page.resolve({ assets: [asset('1')], endCursor: 'cursor-1', hasNextPage: false });
      await page.promise;
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
