import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, fireEvent } from '../../test-utils';
import { AlertProvider, useAlert } from '../AlertProvider';

/** Opens an alert whose only action opens a second alert. */
function NestedAlertTrigger() {
  const alert = useAlert();
  return (
    <Pressable
      accessibilityLabel="open"
      onPress={() =>
        alert('First', undefined, [
          { text: 'Go deeper', onPress: () => alert('Second', 'Opened from an action') },
        ])
      }
    >
      <Text>trigger</Text>
    </Pressable>
  );
}

describe('AlertProvider', () => {
  it('keeps an alert opened from inside another alert action visible', () => {
    const { getByLabelText, getByText, queryByText } = render(
      <AlertProvider>
        <NestedAlertTrigger />
      </AlertProvider>,
    );

    fireEvent.press(getByLabelText('open'));
    expect(getByText('First')).toBeTruthy();

    // Dismissal and the follow-up alert land in the same React batch; if the
    // dismissal wins, the second alert never reaches the screen.
    fireEvent.press(getByText('Go deeper'));
    expect(getByText('Second')).toBeTruthy();
    expect(queryByText('First')).toBeNull();
  });
});
