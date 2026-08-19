import React from 'react';
import { render, fireEvent, screen } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalendarScreen } from '../CalendarScreen';
import type { AppNavigationProp } from '../../navigation/types';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;

// ---------------------------------------------------------------------------
// Helpers: the modal's time pickers are increment-only Pressables that show
// the current hour/minute as their label text. We drive them by climbing from
// the "Starts"/"Ends" label up to the time-row container and pressing the
// hour/minute button nodes directly.
// ---------------------------------------------------------------------------

// Minimal structural view of the react-test-renderer tree RNTL exposes.
interface TestNode {
  children: (TestNode | string)[];
  parent: TestNode | null;
  props: Record<string, unknown>;
}

function asNode(n: unknown): TestNode {
  return n as TestNode;
}

function getTimePicker(label: string): TestNode {
  let node = asNode(screen.getByText(label));
  while (node.parent) {
    node = node.parent;
    if (node.children && node.children.length >= 2) break;
  }
  return asNode(node.children[1]);
}

function deepestText(node: TestNode): string {
  if (node.children && node.children.length) {
    const first = node.children[0];
    if (typeof first === 'string') return first;
    return deepestText(first);
  }
  return '';
}

// Open the add/edit modal via the "+" button in the navigation bar.
function openAddModal() {
  let node = asNode(screen.getAllByText('Today')[0]);
  while (node.parent) {
    node = node.parent;
    const style = node.props.style;
    const flat = Array.isArray(style) ? style[0] : style;
    const flex = flat && typeof flat === 'object' ? (flat as { flexDirection?: string }).flexDirection : undefined;
    if (flex === 'row') break;
  }
  fireEvent.press(asNode(node.children[1]));
}

function pressTime(label: string, hourTaps: number, minuteTaps: number) {
  const picker = getTimePicker(label);
  const inner = asNode(picker.children[0]);
  const hourBtn = asNode(inner.children[0]);
  const minBtn = asNode(inner.children[2]);
  for (let i = 0; i < hourTaps; i++) fireEvent.press(hourBtn);
  for (let i = 0; i < minuteTaps; i++) fireEvent.press(minBtn);
}

function readTime(label: string) {
  const picker = getTimePicker(label);
  const inner = asNode(picker.children[0]);
  return `${deepestText(asNode(inner.children[0]))}:${deepestText(asNode(inner.children[2]))}`;
}

interface StoredEvent {
  id: string;
  start: number;
  end: number;
}

function lastStoredEvents(): StoredEvent[] {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
  const payload = calls[calls.length - 1][1];
  return JSON.parse(payload) as StoredEvent[];
}

beforeEach(() => {
  (AsyncStorage.setItem as jest.Mock).mockClear();
});

describe('CalendarScreen — end-time auto-correction (issue 202)', () => {
  it('keeps the default add-modal times unchanged (09:00 → 10:00)', async () => {
    render(<CalendarScreen navigation={mockNavigation} />);
    await screen.findByText('No events scheduled');
    openAddModal();
    expect(readTime('Starts')).toBe('09:00');
    expect(readTime('Ends')).toBe('10:00');
  });

  it('auto-bumps the end time shown in the picker when start moves past end (issue scenario)', async () => {
    render(<CalendarScreen navigation={mockNavigation} />);
    await screen.findByText('No events scheduled');
    openAddModal();

    // Set end to 17:15 while start is 09:00 (a valid duration).
    pressTime('Ends', 7, 1);
    expect(readTime('Starts')).toBe('09:00');
    expect(readTime('Ends')).toBe('17:15');

    // Move start to 17:30. The end must be bumped forward in the picker —
    // it must NOT keep showing 17:15 while a later value would be persisted.
    pressTime('Starts', 8, 2);
    expect(readTime('Starts')).toBe('17:30');
    expect(readTime('Ends')).toBe('18:15');
  });

  it('persists exactly the end time shown when Save is tapped', async () => {
    render(<CalendarScreen navigation={mockNavigation} />);
    await screen.findByText('No events scheduled');
    openAddModal();

    pressTime('Ends', 7, 1);
    pressTime('Starts', 8, 2);
    expect(readTime('Starts')).toBe('17:30');
    expect(readTime('Ends')).toBe('18:15');

    fireEvent.changeText(screen.getByPlaceholderText('Event Title'), 'Meeting');
    fireEvent.press(screen.getByText('Add'));

    expect(AsyncStorage.setItem).toHaveBeenCalled();
    const stored = lastStoredEvents();
    expect(stored).toHaveLength(1);
    expect(new Date(stored[0].start).getHours()).toBe(17);
    expect(new Date(stored[0].start).getMinutes()).toBe(30);
    expect(new Date(stored[0].end).getHours()).toBe(18);
    expect(new Date(stored[0].end).getMinutes()).toBe(15);
  });

  it('pushes the end forward when start is moved past it', async () => {
    render(<CalendarScreen navigation={mockNavigation} />);
    await screen.findByText('No events scheduled');
    openAddModal();

    // start 09:45, end 10:00 (still valid)
    pressTime('Starts', 0, 3);
    expect(readTime('Starts')).toBe('09:45');
    expect(readTime('Ends')).toBe('10:00');

    // start hour 09 → 10 would overtake end 10:00 → both jump by one hour
    pressTime('Starts', 1, 0);
    expect(readTime('Starts')).toBe('10:45');
    expect(readTime('Ends')).toBe('11:45');
  });

  it('never shows an hour of 24 in the picker when auto-correction crosses midnight', async () => {
    render(<CalendarScreen navigation={mockNavigation} />);
    await screen.findByText('No events scheduled');
    openAddModal();

    // 09:00 → 23:45; the end is bumped past midnight by the correction.
    pressTime('Starts', 14, 3);
    expect(readTime('Starts')).toBe('23:45');
    expect(readTime('Ends')).toBe('00:00');

    // The event persists with the end on the NEXT day, matching the display.
    fireEvent.changeText(screen.getByPlaceholderText('Event Title'), 'Late');
    fireEvent.press(screen.getByText('Add'));
    const stored = lastStoredEvents();
    expect(new Date(stored[0].start).getHours()).toBe(23);
    expect(new Date(stored[0].start).getMinutes()).toBe(45);
    expect(new Date(stored[0].end).getHours()).toBe(0);
    expect(new Date(stored[0].end).getMinutes()).toBe(0);
  });

  it('normalizes a legacy stored event with end <= start in the edit picker', async () => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const start = new Date(base);
    start.setHours(17, 30, 0, 0);
    const end = new Date(base);
    end.setHours(17, 15, 0, 0); // invalid: end before start

    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify([
        { id: 'user_legacy1', title: 'Legacy', start: start.getTime(), end: end.getTime(), allDay: false, location: '', notes: '', repeat: 'never' },
      ])
    );

    render(<CalendarScreen navigation={mockNavigation} />);
    await screen.findByText('Legacy');

    fireEvent.press(screen.getByLabelText('Edit event Legacy'));

    // The picker shows the corrected end (17:30 → 18:30), not the raw 17:15.
    expect(readTime('Starts')).toBe('17:30');
    expect(readTime('Ends')).toBe('18:30');

    // Saving persists exactly what the picker showed.
    fireEvent.press(screen.getByText('Save'));
    const stored = lastStoredEvents();
    expect(stored).toHaveLength(1);
    expect(new Date(stored[0].end).getHours()).toBe(18);
    expect(new Date(stored[0].end).getMinutes()).toBe(30);
  });

  it('hides the time pickers for all-day events (no correction applies)', async () => {
    render(<CalendarScreen navigation={mockNavigation} />);
    await screen.findByText('No events scheduled');
    openAddModal();

    expect(screen.getByText('Starts')).toBeTruthy();
    expect(screen.getByText('Ends')).toBeTruthy();

    fireEvent.press(screen.getByText('All Day'));
    expect(screen.queryByText('Starts')).toBeNull();
    expect(screen.queryByText('Ends')).toBeNull();
  });
});
