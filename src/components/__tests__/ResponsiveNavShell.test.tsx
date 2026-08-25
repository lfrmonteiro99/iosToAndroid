import React from 'react';
import { Text, Dimensions } from 'react-native';
import { render, fireEvent, act } from '../../test-utils';
import {
  useRegularWidth,
  REGULAR_WIDTH_BREAKPOINT,
} from '../../hooks/useRegularWidth';
import { TABLET_NAV_ITEMS } from '../navigation/navItems';
import { CupertinoSidebar } from '../CupertinoSidebar';
import { CupertinoTabBar } from '../CupertinoTabBar';
import { ResponsiveNavShell } from '../ResponsiveNavShell';

const PHONE = {
  window: { width: 390, height: 844, scale: 2, fontScale: 1 },
  screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
};
const TABLET = {
  window: { width: 1024, height: 768, scale: 2, fontScale: 1 },
  screen: { width: 1024, height: 768, scale: 2, fontScale: 1 },
};
const BOUNDARY_UP = {
  window: { width: REGULAR_WIDTH_BREAKPOINT, height: 800, scale: 2, fontScale: 1 },
  screen: { width: REGULAR_WIDTH_BREAKPOINT, height: 800, scale: 2, fontScale: 1 },
};
const BOUNDARY_DOWN = {
  window: { width: REGULAR_WIDTH_BREAKPOINT - 1, height: 800, scale: 2, fontScale: 1 },
  screen: { width: REGULAR_WIDTH_BREAKPOINT - 1, height: 800, scale: 2, fontScale: 1 },
};

function setWidth(kind: 'phone' | 'tablet' | 'boundaryUp' | 'boundaryDown') {
  const map = {
    phone: PHONE,
    tablet: TABLET,
    boundaryUp: BOUNDARY_UP,
    boundaryDown: BOUNDARY_DOWN,
  };
  Dimensions.set(map[kind]);
}

beforeEach(() => {
  // Default to a phone so each test starts from a known state.
  setWidth('phone');
});

// ── Breakpoint detection ────────────────────────────────────────────────────

function WidthProbe() {
  const isRegular = useRegularWidth();
  return <Text testID="width-probe">{String(isRegular)}</Text>;
}

describe('useRegularWidth', () => {
  it('exposes the breakpoint constant at 700pt', () => {
    expect(REGULAR_WIDTH_BREAKPOINT).toBe(700);
  });

  it('returns false on phone width', () => {
    setWidth('phone');
    const { getByTestId } = render(<WidthProbe />);
    expect(getByTestId('width-probe').props.children).toBe('false');
  });

  it('returns true on tablet width', () => {
    setWidth('tablet');
    const { getByTestId } = render(<WidthProbe />);
    expect(getByTestId('width-probe').props.children).toBe('true');
  });

  it('returns true at exactly the breakpoint and false one pt below it', () => {
    setWidth('boundaryUp');
    const up = render(<WidthProbe />);
    expect(up.getByTestId('width-probe').props.children).toBe('true');

    setWidth('boundaryDown');
    const down = render(<WidthProbe />);
    expect(down.getByTestId('width-probe').props.children).toBe('false');
  });

  it('updates when the window is resized across the breakpoint', () => {
    setWidth('phone');
    const { getByTestId } = render(<WidthProbe />);
    expect(getByTestId('width-probe').props.children).toBe('false');
    act(() => {
      setWidth('tablet');
    });
    expect(getByTestId('width-probe').props.children).toBe('true');
  });
});

// ── Sidebar (tablet) ────────────────────────────────────────────────────────

describe('CupertinoSidebar', () => {
  it('renders one tappable item per nav item', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <CupertinoSidebar items={TABLET_NAV_ITEMS} activeId="Home" onSelect={onSelect} />,
    );
    TABLET_NAV_ITEMS.forEach((it) => {
      expect(getByTestId(`side-bar-item-${it.id}`)).toBeTruthy();
    });
  });

  it('marks the active item as selected and the others as not selected', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <CupertinoSidebar items={TABLET_NAV_ITEMS} activeId="Messages" onSelect={onSelect} />,
    );
    expect(getByTestId('side-bar-item-Messages').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('side-bar-item-Home').props.accessibilityState.selected).toBe(false);
  });

  it('calls onSelect with the item id when a non-active item is pressed', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <CupertinoSidebar items={TABLET_NAV_ITEMS} activeId="Home" onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId('side-bar-item-Settings'));
    expect(onSelect).toHaveBeenCalledWith('Settings');
  });

  it('does NOT call onSelect when the already-active item is pressed (double-tap safety)', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <CupertinoSidebar items={TABLET_NAV_ITEMS} activeId="Home" onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId('side-bar-item-Home'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks nothing as selected when activeId is not in the item set', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <CupertinoSidebar items={TABLET_NAV_ITEMS} activeId="Nowhere" onSelect={onSelect} />,
    );
    TABLET_NAV_ITEMS.forEach((it) => {
      expect(getByTestId(`side-bar-item-${it.id}`).props.accessibilityState.selected).toBe(false);
    });
  });

  it('renders no items when the list is empty', () => {
    const onSelect = jest.fn();
    const { queryByTestId } = render(
      <CupertinoSidebar items={[]} activeId="Home" onSelect={onSelect} />,
    );
    expect(queryByTestId('side-bar-item-Home')).toBeNull();
  });
});

// ── Tab bar (controlled, still-shipped component) ──────────────────────────
//
// NOTE for #651-A: the phone `ResponsiveNavShell` no longer renders a tab bar
// (the launcher dock is the navigation on phone), but the standalone controlled
// `CupertinoTabBar` component still exists and is covered here independently.

describe('CupertinoTabBar (controlled)', () => {
  it('renders one tappable item per nav item', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <CupertinoTabBar items={TABLET_NAV_ITEMS} activeId="Home" onSelect={onSelect} />,
    );
    TABLET_NAV_ITEMS.forEach((it) => {
      expect(getByTestId(`tab-bar-item-${it.id}`)).toBeTruthy();
    });
  });

  it('marks the active item as selected', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <CupertinoTabBar items={TABLET_NAV_ITEMS} activeId="Contacts" onSelect={onSelect} />,
    );
    expect(getByTestId('tab-bar-item-Contacts').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('tab-bar-item-Home').props.accessibilityState.selected).toBe(false);
  });

  it('calls onSelect with the item id when a non-active item is pressed', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <CupertinoTabBar items={TABLET_NAV_ITEMS} activeId="Home" onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId('tab-bar-item-Phone'));
    expect(onSelect).toHaveBeenCalledWith('Phone');
  });

  it('does NOT call onSelect when the already-active item is pressed (double-tap safety)', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <CupertinoTabBar items={TABLET_NAV_ITEMS} activeId="Home" onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId('tab-bar-item-Home'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

// ── Responsive shell ────────────────────────────────────────────────────────

function Shell({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ResponsiveNavShell
      navItems={TABLET_NAV_ITEMS}
      activeId={activeId}
      onSelect={onSelect}
    >
      <Text testID="content">active: {activeId}</Text>
    </ResponsiveNavShell>
  );
}

describe('ResponsiveNavShell', () => {
  it('shows NO tab bar and only content on phone width (the launcher dock is the navigation)', () => {
    setWidth('phone');
    const onSelect = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <Shell activeId="Home" onSelect={onSelect} />,
    );
    // The phone form factor relies on the dock for navigation; reintroducing a
    // tab bar here was the regression this subissue removes.
    expect(queryByTestId('cupertino-tabbar')).toBeNull();
    expect(queryByTestId('cupertino-sidebar')).toBeNull();
    // Content still renders, just without the tab-bar chrome below it.
    expect(getByTestId('content').props.children).toContain('Home');
  });

  it('shows the sidebar (no tab bar) on tablet width and keeps content', () => {
    setWidth('tablet');
    const onSelect = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <Shell activeId="Home" onSelect={onSelect} />,
    );
    expect(getByTestId('cupertino-sidebar')).toBeTruthy();
    expect(queryByTestId('cupertino-tabbar')).toBeNull();
    expect(getByTestId('content').props.children).toContain('Home');
  });

  it('never renders a tab bar at any width after the refactor', () => {
    const onSelect = jest.fn();
    setWidth('phone');
    const { queryByTestId } = render(<Shell activeId="Home" onSelect={onSelect} />);
    expect(queryByTestId('cupertino-tabbar')).toBeNull();

    act(() => {
      setWidth('tablet');
    });
    expect(queryByTestId('cupertino-tabbar')).toBeNull();

    act(() => {
      setWidth('boundaryDown');
    });
    expect(queryByTestId('cupertino-tabbar')).toBeNull();
  });

  it('switches content-only -> sidebar live when width crosses into tablet range', () => {
    setWidth('phone');
    const onSelect = jest.fn();
    const { queryByTestId } = render(<Shell activeId="Home" onSelect={onSelect} />);
    expect(queryByTestId('cupertino-sidebar')).toBeNull();

    act(() => {
      setWidth('tablet');
    });

    expect(queryByTestId('cupertino-sidebar')).toBeTruthy();
    expect(queryByTestId('cupertino-tabbar')).toBeNull();
  });

  it('reflects a sidebar selection back into the rendered content', () => {
    setWidth('tablet');
    const onSelect = jest.fn();
    const { getByTestId } = render(<Shell activeId="Home" onSelect={onSelect} />);
    fireEvent.press(getByTestId('side-bar-item-Messages'));
    expect(onSelect).toHaveBeenCalledWith('Messages');
  });
});
