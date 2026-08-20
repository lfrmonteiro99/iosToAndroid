import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import { MapsScreen } from '../MapsScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('MapsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(() => Promise.resolve(null));
  });

  it('renders without crashing', async () => {
    const { toJSON } = render(<MapsScreen navigation={navigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows demo banner when not dismissed', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === '@iostoandroid/maps_demo_dismissed' ? Promise.resolve(null) : Promise.resolve(null)
    );
    const { findByText } = render(<MapsScreen navigation={navigation} />);
    await findByText(/Demo Mode/i, {}, { timeout: 5000 });
  });

  it('hides demo banner when already dismissed', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === '@iostoandroid/maps_demo_dismissed' ? Promise.resolve('true') : Promise.resolve(null)
    );
    const { queryByText } = render(<MapsScreen navigation={navigation} />);
    await waitFor(() => {}, { timeout: 500 });
    expect(queryByText(/Demo Mode/i)).toBeNull();
  });

  it('dismisses banner on close press', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === '@iostoandroid/maps_demo_dismissed' ? Promise.resolve(null) : Promise.resolve(null)
    );
    const { findByLabelText, queryByText } = render(<MapsScreen navigation={navigation} />);
    const closeBtn = await findByLabelText('Dismiss demo banner', {}, { timeout: 5000 });
    fireEvent.press(closeBtn);
    await waitFor(() => {
      expect(queryByText(/Demo Mode/i)).toBeNull();
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@iostoandroid/maps_demo_dismissed', 'true');
  });
});
