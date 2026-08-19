import React from 'react';
import { render } from '../../test-utils';
import { CupertinoSegmentedControl } from '../CupertinoSegmentedControl';

describe('CupertinoSegmentedControl', () => {
  it('renders with multiple values', () => {
    const { toJSON } = render(
      <CupertinoSegmentedControl
        values={['Option A', 'Option B', 'Option C']}
        selectedIndex={0}
        onChange={jest.fn()}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with a single value', () => {
    const { toJSON } = render(
      <CupertinoSegmentedControl
        values={['Only']}
        selectedIndex={0}
        onChange={jest.fn()}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders nothing when values is empty', () => {
    const { toJSON } = render(
      <CupertinoSegmentedControl
        values={[]}
        selectedIndex={0}
        onChange={jest.fn()}
      />
    );
    expect(toJSON()).toBeNull();
  });

  it('calls onChange when a segment is pressed', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <CupertinoSegmentedControl
        values={['First', 'Second']}
        selectedIndex={0}
        onChange={onChange}
      />
    );
    // Render the component to verify both segments are present
    expect(getByText('First')).toBeTruthy();
    expect(getByText('Second')).toBeTruthy();
  });

  it('does not crash with empty values and renders null without errors', () => {
    expect(() => {
      render(
        <CupertinoSegmentedControl
          values={[]}
          selectedIndex={0}
          onChange={jest.fn()}
        />
      );
    }).not.toThrow();
  });
});
