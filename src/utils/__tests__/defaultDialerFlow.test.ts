import {
  defaultDialerFlowReducer,
  runDefaultDialerFlow,
  type DefaultDialerFlowState,
  type DefaultDialerFlowDeps,
} from '../defaultDialerFlow';

function makeDeps(overrides: Partial<DefaultDialerFlowDeps> = {}): DefaultDialerFlowDeps & {
  setDeclined: jest.Mock;
  requestDefaultDialer: jest.Mock;
  isDefaultDialer: jest.Mock;
} {
  return {
    isDefaultDialer: jest.fn(() => Promise.resolve(false)),
    requestDefaultDialer: jest.fn(() => Promise.resolve(true)),
    getDeclined: () => false,
    setDeclined: jest.fn(),
    ...overrides,
  } as DefaultDialerFlowDeps & {
    setDeclined: jest.Mock;
    requestDefaultDialer: jest.Mock;
    isDefaultDialer: jest.Mock;
  };
}

describe('defaultDialerFlowReducer', () => {
  it('CHECKED with isDefault true always lands on "default"', () => {
    expect(defaultDialerFlowReducer('unknown', { type: 'CHECKED', isDefault: true, previouslyDeclined: false }))
      .toBe('default');
    expect(defaultDialerFlowReducer('declined', { type: 'CHECKED', isDefault: true, previouslyDeclined: true }))
      .toBe('default');
  });

  it('CHECKED with isDefault false and previouslyDeclined true lands on "declined"', () => {
    expect(defaultDialerFlowReducer('unknown', { type: 'CHECKED', isDefault: false, previouslyDeclined: true }))
      .toBe('declined');
  });

  it('CHECKED with isDefault false and previouslyDeclined false lands on "eligible"', () => {
    expect(defaultDialerFlowReducer('unknown', { type: 'CHECKED', isDefault: false, previouslyDeclined: false }))
      .toBe('eligible');
  });

  it('CALL_CONTEXT_ENTERED moves "eligible" to "prompting"', () => {
    expect(defaultDialerFlowReducer('eligible', { type: 'CALL_CONTEXT_ENTERED' })).toBe('prompting');
  });

  const inertStates: DefaultDialerFlowState[] = ['unknown', 'default', 'prompting', 'declined'];
  it.each(inertStates)('CALL_CONTEXT_ENTERED is a no-op from "%s" (never prompts at startup, never repeats)', (state) => {
    expect(defaultDialerFlowReducer(state, { type: 'CALL_CONTEXT_ENTERED' })).toBe(state);
  });

  it('REQUEST_LAUNCHED moves "prompting" to "declined" (treated as asked until the next check)', () => {
    expect(defaultDialerFlowReducer('prompting', { type: 'REQUEST_LAUNCHED' })).toBe('declined');
  });

  it('REQUEST_LAUNCHED is a no-op outside "prompting"', () => {
    expect(defaultDialerFlowReducer('eligible', { type: 'REQUEST_LAUNCHED' })).toBe('eligible');
  });

  it('REQUEST_FAILED moves "prompting" back to "eligible" (retriable)', () => {
    expect(defaultDialerFlowReducer('prompting', { type: 'REQUEST_FAILED' })).toBe('eligible');
  });

  it('REQUEST_FAILED is a no-op outside "prompting"', () => {
    expect(defaultDialerFlowReducer('declined', { type: 'REQUEST_FAILED' })).toBe('declined');
  });

  it('BECAME_DEFAULT always lands on "default"', () => {
    expect(defaultDialerFlowReducer('prompting', { type: 'BECAME_DEFAULT' })).toBe('default');
  });
});

describe('runDefaultDialerFlow', () => {
  it('does nothing and never prompts when the app is already the default dialer', async () => {
    const deps = makeDeps({ isDefaultDialer: jest.fn(() => Promise.resolve(true)) });

    const result = await runDefaultDialerFlow(deps);

    expect(result).toBe('default');
    expect(deps.requestDefaultDialer).not.toHaveBeenCalled();
    expect(deps.setDeclined).not.toHaveBeenCalled();
  });

  it('does nothing and never re-prompts once the user has declined before', async () => {
    const deps = makeDeps({ getDeclined: () => true });

    const result = await runDefaultDialerFlow(deps);

    expect(result).toBe('declined');
    expect(deps.requestDefaultDialer).not.toHaveBeenCalled();
    expect(deps.setDeclined).not.toHaveBeenCalled();
  });

  it('prompts and records the decline when eligible and the request launches', async () => {
    const deps = makeDeps();

    const result = await runDefaultDialerFlow(deps);

    expect(deps.requestDefaultDialer).toHaveBeenCalledTimes(1);
    expect(result).toBe('declined');
    expect(deps.setDeclined).toHaveBeenCalledWith(true);
  });

  it('stays eligible (retriable) and does not record a decline when the request fails to launch', async () => {
    const deps = makeDeps({ requestDefaultDialer: jest.fn(() => Promise.resolve(false)) });

    const result = await runDefaultDialerFlow(deps);

    expect(result).toBe('eligible');
    expect(deps.setDeclined).not.toHaveBeenCalled();
  });

  it('stays eligible when requestDefaultDialer throws, instead of crashing the call flow', async () => {
    const deps = makeDeps({ requestDefaultDialer: jest.fn(() => Promise.reject(new Error('no activity'))) });

    const result = await runDefaultDialerFlow(deps);

    expect(result).toBe('eligible');
    expect(deps.setDeclined).not.toHaveBeenCalled();
  });

  it('resolves to "unknown" and never prompts when isDefaultDialer itself throws', async () => {
    const deps = makeDeps({ isDefaultDialer: jest.fn(() => Promise.reject(new Error('bridge error'))) });

    const result = await runDefaultDialerFlow(deps);

    expect(result).toBe('unknown');
    expect(deps.requestDefaultDialer).not.toHaveBeenCalled();
    expect(deps.setDeclined).not.toHaveBeenCalled();
  });

  it('calling the flow twice in a row after a decline never launches the request the second time', async () => {
    const declined = { value: false };
    const deps = makeDeps({
      getDeclined: () => declined.value,
      setDeclined: jest.fn((v: boolean) => { declined.value = v; }),
    });

    await runDefaultDialerFlow(deps);
    expect(deps.requestDefaultDialer).toHaveBeenCalledTimes(1);

    const second = await runDefaultDialerFlow(deps);

    expect(second).toBe('declined');
    expect(deps.requestDefaultDialer).toHaveBeenCalledTimes(1);
  });
});
