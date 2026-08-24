import React from 'react';
import { fireEvent, render } from '../../test-utils';
import { AutomationEditorScreen } from '../AutomationEditorScreen';
import { Automation } from '../types';

// The editor screen owns the When/Do + Sheets UI. We mount it with a known
// Automation (explicit action ids a1/a2/a3) so the per-action testIDs
// ("remove-action-a3" etc.) are deterministic, and assert cards, the add/remove/
// reorder flows and the validation gating.
//
// Note: action labels render inside <TextInput value=...>, so their text is
// queried with getByDisplayValue, not getByText.

function baseAutomation(): Automation {
  return {
    id: 'ed',
    name: 'Start Work',
    enabled: true,
    trigger: { type: 'time', label: 'When: 9:00 AM', payload: { minutes: 540 } },
    actions: [
      { id: 'a1', type: 'setMode', label: 'Set Focus mode' },
      { id: 'a2', type: 'toggleWifi', label: 'Turn on Wi-Fi' },
      { id: 'a3', type: 'openApp', label: 'Open Calendar' },
    ],
  };
}

function renderEditor(automation: Automation = baseAutomation()) {
  return render(<AutomationEditorScreen automation={automation} onClose={jest.fn()} />);
}

describe('AutomationEditorScreen — When/Do structure', () => {
  it('renders a "When" trigger card and the configured actions', () => {
    const { getByText, getByDisplayValue, getAllByText } = renderEditor();
    // "WHEN" section header.
    expect(getByText('WHEN')).toBeTruthy();
    // Trigger label renders as text.
    expect(getByText('When: 9:00 AM')).toBeTruthy();
    // Action labels render inside TextInput values.
    expect(getByDisplayValue('Set Focus mode')).toBeTruthy();
    expect(getByDisplayValue('Turn on Wi-Fi')).toBeTruthy();
    expect(getByDisplayValue('Open Calendar')).toBeTruthy();
    // "Do" section header is rendered.
    expect(getAllByText('DO').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the summary line from the editor logic', () => {
    const { getByText } = renderEditor();
    expect(getByText('When: 9:00 AM · 3 actions')).toBeTruthy();
  });
});

describe('AutomationEditorScreen — editing actions', () => {
  it('adds an action via the Sheet and reflects it', () => {
    const { getByText, getByTestId, getByDisplayValue } = renderEditor();
    // Open the "Add action" flow.
    fireEvent.press(getByTestId('add-action'));
    // Sheet offers catalog entries; pick one.
    fireEvent.press(getByText('Set Brightness'));
    expect(getByDisplayValue('Set Brightness')).toBeTruthy();
  });

  it('removes an action and the card disappears', () => {
    const { getByDisplayValue, queryByDisplayValue, getByTestId } = renderEditor();
    expect(getByDisplayValue('Open Calendar')).toBeTruthy();
    fireEvent.press(getByTestId('remove-action-a3'));
    expect(queryByDisplayValue('Open Calendar')).toBeNull();
  });

  it('reorders an action down and the order updates', () => {
    const { getByTestId, queryAllByTestId } = renderEditor();
    fireEvent.press(getByTestId('move-down-action-a1'));
    // Document order of the action cards must now be a2, a1, a3.
    const order = queryAllByTestId(/^action-card-/).map((n) =>
      (n.props.testID as string).replace('action-card-', ''),
    );
    expect(order).toEqual(['a2', 'a1', 'a3']);
  });

  it('disables Done when the automation is invalid (no actions)', () => {
    const automation = baseAutomation();
    automation.actions = [];
    const { getByTestId } = render(<AutomationEditorScreen automation={automation} onClose={jest.fn()} />);
    const done = getByTestId('editor-done');
    expect(done.props.accessibilityState?.disabled).toBe(true);
  });
});
