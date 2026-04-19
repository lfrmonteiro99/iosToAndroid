import React from 'react';
import { render } from '../../test-utils';
import { PhotosScreen } from '../PhotosScreen';
import type { AppNavigationProp } from '../../navigation/types';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;


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
});
