import React from 'react';
import { render } from '@testing-library/react-native';
import launcherModule from '../../../modules/launcher-module/src';
import { useLiveActivity, LiveActivityContent } from '../useLiveActivity';

// #626: Android equivalent of iOS Live Activities — an ongoing notification
// that a screen (e.g. a delivery/ride tracker) keeps in sync via this hook.

function Probe({
  id,
  active,
  content,
}: {
  id: string;
  active: boolean;
  content: LiveActivityContent;
}) {
  useLiveActivity({ id, active, content });
  return null;
}

const CONTENT: LiveActivityContent = {
  title: 'Driver arriving',
  text: '2 min away',
  progress: 8,
  maxProgress: 10,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useLiveActivity (#626)', () => {
  it('posts the activity on mount when active', () => {
    render(<Probe id="ride-1" active content={CONTENT} />);

    expect(launcherModule.postLiveActivity).toHaveBeenCalledWith(
      'ride-1',
      'Driver arriving',
      '2 min away',
      8,
      10,
    );
  });

  it('does nothing when active is false', () => {
    render(<Probe id="ride-1" active={false} content={CONTENT} />);

    expect(launcherModule.postLiveActivity).not.toHaveBeenCalled();
    expect(launcherModule.cancelLiveActivity).not.toHaveBeenCalled();
  });

  it('does nothing when id is empty, even if active', () => {
    render(<Probe id="" active content={CONTENT} />);

    expect(launcherModule.postLiveActivity).not.toHaveBeenCalled();
  });

  it('re-posts (updates in place) when content changes, without cancelling first', () => {
    const { rerender } = render(<Probe id="ride-1" active content={CONTENT} />);
    (launcherModule.postLiveActivity as jest.Mock).mockClear();

    rerender(<Probe id="ride-1" active content={{ ...CONTENT, progress: 9, text: '1 min away' }} />);

    expect(launcherModule.postLiveActivity).toHaveBeenCalledWith(
      'ride-1',
      'Driver arriving',
      '1 min away',
      9,
      10,
    );
    // The whole point of an ongoing notification is an in-place update — it
    // must never be cancelled just because its content changed.
    expect(launcherModule.cancelLiveActivity).not.toHaveBeenCalled();
  });

  it('cancels when active flips from true to false', () => {
    const { rerender } = render(<Probe id="ride-1" active content={CONTENT} />);

    rerender(<Probe id="ride-1" active={false} content={CONTENT} />);

    expect(launcherModule.cancelLiveActivity).toHaveBeenCalledWith('ride-1');
  });

  it('cancels on unmount while still active (inverse of the fix: nothing lingers)', () => {
    const { unmount } = render(<Probe id="ride-1" active content={CONTENT} />);

    unmount();

    expect(launcherModule.cancelLiveActivity).toHaveBeenCalledWith('ride-1');
  });

  it('does not cancel on unmount when it was never active', () => {
    const { unmount } = render(<Probe id="ride-1" active={false} content={CONTENT} />);

    unmount();

    expect(launcherModule.cancelLiveActivity).not.toHaveBeenCalled();
  });

  it('toggling active twice (double toggle) leaves it posted, not stuck cancelled', () => {
    const { rerender } = render(<Probe id="ride-1" active content={CONTENT} />);

    rerender(<Probe id="ride-1" active={false} content={CONTENT} />);
    expect(launcherModule.cancelLiveActivity).toHaveBeenCalledTimes(1);

    rerender(<Probe id="ride-1" active content={CONTENT} />);
    expect(launcherModule.postLiveActivity).toHaveBeenCalledTimes(2); // initial mount + re-activation
    expect(launcherModule.cancelLiveActivity).toHaveBeenCalledTimes(1); // still just the one cancel
  });
});
