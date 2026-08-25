import React, { useEffect, useRef } from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '../../test-utils';
import { ShortcutsProvider, useShortcuts, ShortcutAction } from '../../store/ShortcutsStore';
import { useApps } from '../../store/AppsStore';
import { ShortcutsEditor } from '../ShortcutsEditor';
import launcherModule from '../../../modules/launcher-module/src';

const NATIVE_APPS = [
  { name: 'Camera', packageName: 'com.example.camera', icon: '', isSystem: false, category: 'undefined' },
  { name: 'Notes', packageName: 'com.example.notes', icon: '', isSystem: false, category: 'undefined' },
] as never;

// Reads the shortcut being edited directly from the global ShortcutsStore —
// proves the editor's "Add Action" flow reached the store, not just local
// screen state (issue #506's exact symptom, the reason this pipeline demands
// the test exercise the real unit).
function StoreReader() {
  const { shortcuts } = useShortcuts();
  const actions: ShortcutAction[] = shortcuts[0]?.actions ?? [];
  return <Text testID="store-actions">{JSON.stringify(actions)}</Text>;
}

// Exposes AppsStore's load state so tests can wait for the async
// getInstalledApps() to resolve before opening the Open App picker.
function AppsCountReader() {
  const { apps } = useApps();
  return <Text testID="apps-count">{apps.length}</Text>;
}

// Creates one shortcut on mount (so the provider has something to edit) and
// renders the editor against either that shortcut's id or a forced bogus id.
function EditorWithStore({ forceId }: { forceId?: string }) {
  const { shortcuts, createShortcut } = useShortcuts();
  const created = useRef(false);
  useEffect(() => {
    if (!created.current) {
      created.current = true;
      createShortcut('My Shortcut', 'star.fill', []);
    }
  }, [createShortcut]);
  const id = forceId ?? shortcuts[0]?.id;
  if (!id) return null;
  return <ShortcutsEditor shortcutId={id} onClose={jest.fn()} />;
}

function mount(forceId?: string) {
  return render(
    <ShortcutsProvider>
      <EditorWithStore forceId={forceId} />
      <AppsCountReader />
      <StoreReader />
    </ShortcutsProvider>,
  );
}

function parseActions(getByTestId: (id: string) => { props: { children: string } }) {
  return JSON.parse(getByTestId('store-actions').props.children) as ShortcutAction[];
}

beforeEach(() => {
  jest.clearAllMocks();
  (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue(NATIVE_APPS);
});

describe('ShortcutsEditor — action picker (PAI #783)', () => {
  // Core acceptance criterion from the issue.
  it('choosing "Open App" + an app appends a launchApp ShortcutAction of the right type', async () => {
    const { getByTestId, getByText, queryByText } = mount();

    // Wait for apps to load and the editor (with its created shortcut) to mount.
    await waitFor(() => expect(getByTestId('apps-count').props.children).toBe(2));
    await waitFor(() => expect(getByTestId('editor-cancel')).toBeTruthy());

    // 1) Open the type picker.
    fireEvent.press(getByTestId('add-action'));
    // Only primitives with a real dispatcher are offered (#781): NOT
    // timer / sendMessage / deepLink (those stay in separate issues).
    expect(getByText('Open App')).toBeTruthy();
    expect(getByText('Set Focus Mode')).toBeTruthy();
    expect(queryByText('Timer')).toBeNull();
    expect(queryByText('Send Message')).toBeNull();
    expect(queryByText('Deep Link')).toBeNull();

    // 2) Pick the launchApp primitive → app picker opens.
    fireEvent.press(getByText('Open App'));
    expect(getByText('Choose App')).toBeTruthy();

    // 3) Pick an installed app.
    fireEvent.press(getByText('Camera'));

    // 4) The store now holds exactly one action, of the right type + payload.
    await waitFor(() =>
      expect(parseActions(getByTestId)).toEqual([
        { type: 'launchApp', payload: { packageName: 'com.example.camera' } },
      ]),
    );
  });

  it('choosing "Set Focus Mode" + a mode appends a setFocusMode ShortcutAction', async () => {
    const { getByTestId, getByText } = mount();

    await waitFor(() => expect(getByTestId('apps-count').props.children).toBe(2));
    await waitFor(() => expect(getByTestId('editor-cancel')).toBeTruthy());

    fireEvent.press(getByTestId('add-action'));
    fireEvent.press(getByText('Set Focus Mode'));
    expect(getByText('Work')).toBeTruthy();

    fireEvent.press(getByText('Work'));

    await waitFor(() =>
      expect(parseActions(getByTestId)).toEqual([
        { type: 'setFocusMode', payload: { mode: 'work' } },
      ]),
    );
  });

  // Repetition edge case: a second press adds a SECOND action (no silent
  // dedupe) — the editor is an append-only list, not a set.
  it('adding the same app twice appends two launchApp actions', async () => {
    const { getByTestId, getByText } = mount();

    await waitFor(() => expect(getByTestId('apps-count').props.children).toBe(2));
    await waitFor(() => expect(getByTestId('editor-cancel')).toBeTruthy());

    fireEvent.press(getByTestId('add-action'));
    fireEvent.press(getByText('Open App'));
    fireEvent.press(getByText('Camera'));
    await waitFor(() => expect(parseActions(getByTestId)).toHaveLength(1));

    fireEvent.press(getByTestId('add-action'));
    fireEvent.press(getByText('Open App'));
    fireEvent.press(getByText('Camera'));

    await waitFor(() => expect(parseActions(getByTestId)).toHaveLength(2));
    const actions = parseActions(getByTestId);
    expect(actions.every((a) => a.type === 'launchApp' && a.payload.packageName === 'com.example.camera')).toBe(true);
  });

  // Inverse of the fix: cancelling the type picker adds nothing.
  it('cancelling the type picker adds no action', async () => {
    const { getByTestId, getAllByText } = mount();

    await waitFor(() => expect(getByTestId('apps-count').props.children).toBe(2));
    await waitFor(() => expect(getByTestId('editor-cancel')).toBeTruthy());

    fireEvent.press(getByTestId('add-action'));
    // The sheet's cancel label closes without selecting. All sheets share the
    // "Cancel" label, so target the first (the type picker, mounted first).
    fireEvent.press(getAllByText('Cancel')[0]);

    expect(parseActions(getByTestId)).toEqual([]);
  });

  // Boundary: with zero installed apps, "Open App" must NOT open an unusable
  // empty picker and must NOT add anything (mirrors the Back Tap guard).
  it('"Open App" with zero installed apps adds no action and opens no picker', async () => {
    (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue([]);
    const { getByTestId, getByText, queryByText } = mount();

    await waitFor(() => expect(getByTestId('apps-count').props.children).toBe(0));
    await waitFor(() => expect(getByTestId('editor-cancel')).toBeTruthy());

    fireEvent.press(getByTestId('add-action'));
    fireEvent.press(getByText('Open App'));

    expect(queryByText('Choose App')).toBeNull();
    expect(parseActions(getByTestId)).toEqual([]);
  });

  // Robustness: an editor bound to a non-existent shortcut id must not crash
  // and must not mutate the (only) real shortcut.
  it('an unknown shortcutId does not crash and adds nothing to the real shortcut', async () => {
    const { getByTestId, getByText } = mount('does-not-exist');

    await waitFor(() => expect(getByTestId('apps-count').props.children).toBe(2));
    await waitFor(() => expect(getByTestId('editor-cancel')).toBeTruthy());

    fireEvent.press(getByTestId('add-action'));
    fireEvent.press(getByText('Open App'));
    fireEvent.press(getByText('Camera'));

    // The real (created) shortcut is untouched.
    await new Promise((r) => setTimeout(r, 20));
    expect(parseActions(getByTestId)).toEqual([]);
  });
});
