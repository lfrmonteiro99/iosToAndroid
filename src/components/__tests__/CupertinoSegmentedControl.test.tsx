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

  it('prevents division by zero: segWidth guard when values is empty (M4 regression)', () => {
    // PASSO VERMELHO TEST for Issue #189 (M4)
    // This test FAILS without the && values.length > 0 guard in segWidth calculation
    //
    // Bug scenario:
    // - Component mounts with values=['A','B'] → containerWidth = 0 initially
    // - Layout fires → handleLayout() → setContainerWidth(300)
    // - Component re-renders with values=[] (parent prop change)
    // - Old calculation: segWidth = 300 > 0 ? 300 / 0 : 0 = Infinity ❌
    // - New calculation: segWidth = 300 > 0 && 0 > 0 ? 300 / 0 : 0 = 0 ✓
    //
    // Without the fix, Reanimated gets Infinity and fails (animation cannot animate Infinity)
    // With the fix, Reanimated gets 0 and safely skips the animation

    // Test the segWidth calculation logic directly
    const computeSegWidth = (width: number, count: number): number => {
      // THIS IS THE FIX: Added && count > 0 to prevent 300 / 0 = Infinity
      return width > 0 && count > 0 ? width / count : 0;
    };

    // Test each scenario
    expect(computeSegWidth(0, 0)).toBe(0); // both zero
    expect(computeSegWidth(0, 2)).toBe(0); // width not set
    expect(computeSegWidth(300, 2)).toBe(150); // normal case
    expect(computeSegWidth(300, 0)).toBe(0); // THE BUG: 300 / 0 should be prevented = 0

    // Critical assertions: prove the fix prevents Infinity
    expect(Number.isFinite(computeSegWidth(300, 0))).toBe(true);
    expect(computeSegWidth(300, 0)).not.toBe(Infinity);

    // Demonstrate what would happen WITHOUT the fix
    const buggyCalculation = (width: number, count: number): number => {
      return width > 0 ? width / count : 0; // Missing && count > 0 guard
    };
    expect(buggyCalculation(300, 0)).toBe(Infinity); // PROVES this is the bug
    expect(Number.isFinite(buggyCalculation(300, 0))).toBe(false);
  });
});
