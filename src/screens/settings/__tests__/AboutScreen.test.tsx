import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { AboutScreen } from '../AboutScreen';
import { AlertProvider } from '../../../components/AlertProvider';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

describe('AboutScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<AboutScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the app identity and version rows', () => {
    const { getByText } = render(<AboutScreen navigation={mockNavigation as never} />);
    expect(getByText('Name')).toBeTruthy();
    expect(getByText('iosToAndroid')).toBeTruthy();
    expect(getByText('Software Version')).toBeTruthy();
    expect(getByText('Legal & Regulatory')).toBeTruthy();
  });

  // Real interaction: the header back button calls navigation.goBack().
  it('navigates back when the Settings back button is pressed', () => {
    const { getByText } = render(<AboutScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('General'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  // Real interaction: tapping the "Legal & Regulatory" action row fires the
  // alert. The row renders inside a real AlertProvider so the dialog actually
  // mounts; the default no-op context would otherwise swallow the call.
  it('opens the Legal & Regulatory alert when the row is tapped', () => {
    const { getByText } = render(
      <AlertProvider>
        <AboutScreen navigation={mockNavigation as never} />
      </AlertProvider>,
    );
    const legalRow = getByText('Legal & Regulatory');
    fireEvent.press(legalRow);
    expect(getByText('Legal')).toBeTruthy();
    expect(getByText(/not affiliated with Apple/i)).toBeTruthy();
  });
});
