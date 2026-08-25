import React from 'react';
import { render } from '../../test-utils';
import { Stroke, Needle, GradientDisc } from '../appIcons/primitives';

// The design values in appIcons/index.tsx deliberately have no tests — pixel
// geometry belongs to the artwork, and pinning it would make every visual tweak
// a test edit (see the note in appIcons.test.tsx).
//
// These three primitives are different: they do real maths. `Stroke` derives a
// rotated pill's box and angle from two endpoints, and `Needle` builds a
// triangle out of border widths. Getting either wrong is a silent
// mis-rendering, not a crash — the App Store "A" was four mismatched pieces
// that rendered fine and looked like a filled triangle.

const SIZE = 100;

/** The single View a primitive renders, with its style flattened. */
function styleOf(node: ReturnType<typeof render>) {
  const json = node.toJSON() as { props: { style: Record<string, unknown> } };
  return json.props.style;
}

describe('Stroke', () => {
  it('spans the exact distance between the two endpoints', () => {
    // A pure horizontal run: 0.2 -> 0.8 of a 100dp tile is 60dp.
    const s = styleOf(render(<Stroke size={SIZE} x1={0.2} y1={0.5} x2={0.8} y2={0.5} thickness={0.1} color="#FFF" />));
    expect(s.width).toBeCloseTo(60, 5);
    expect(s.height).toBeCloseTo(10, 5);
  });

  it('takes its length along the diagonal, not along either axis', () => {
    // 30dp across, 40dp down -> 50dp of stroke. A bar that used dx or dy would
    // fall short of the endpoint.
    const s = styleOf(render(<Stroke size={SIZE} x1={0.1} y1={0.1} x2={0.4} y2={0.5} thickness={0.08} color="#FFF" />));
    expect(s.width).toBeCloseTo(50, 5);
  });

  it('centres the box on the midpoint of the endpoints', () => {
    // left/top are the box's corner, so the midpoint is left + width/2.
    const s = styleOf(render(<Stroke size={SIZE} x1={0.2} y1={0.4} x2={0.8} y2={0.4} thickness={0.1} color="#FFF" />));
    expect((s.left as number) + (s.width as number) / 2).toBeCloseTo(50, 5);
    expect((s.top as number) + (s.height as number) / 2).toBeCloseTo(40, 5);
  });

  it('rotates to the angle between the endpoints', () => {
    // Down-and-right at 45 degrees. Screen y grows downwards, so this is +45.
    const s = styleOf(render(<Stroke size={SIZE} x1={0.2} y1={0.2} x2={0.6} y2={0.6} thickness={0.08} color="#FFF" />));
    expect(s.transform).toEqual([{ rotate: '45deg' }]);
  });

  it('is symmetric — swapping the endpoints draws the same pill', () => {
    // The App Store legs are authored bottom-to-top; nothing should depend on
    // which end is written first.
    const a = styleOf(render(<Stroke size={SIZE} x1={0.3} y1={0.8} x2={0.6} y2={0.3} thickness={0.08} color="#FFF" />));
    const b = styleOf(render(<Stroke size={SIZE} x1={0.6} y1={0.3} x2={0.3} y2={0.8} thickness={0.08} color="#FFF" />));
    expect(b.width).toBeCloseTo(a.width as number, 5);
    expect(b.left).toBeCloseTo(a.left as number, 5);
    expect(b.top).toBeCloseTo(a.top as number, 5);
  });

  it('defaults to a full pill and honours an explicit radius', () => {
    const pill = styleOf(render(<Stroke size={SIZE} x1={0.2} y1={0.5} x2={0.8} y2={0.5} thickness={0.1} color="#FFF" />));
    expect(pill.borderRadius).toBeCloseTo(5, 5); // half the 10dp thickness

    const squared = styleOf(render(<Stroke size={SIZE} x1={0.2} y1={0.5} x2={0.8} y2={0.5} thickness={0.1} radius={0.02} color="#FFF" />));
    expect(squared.borderRadius).toBeCloseTo(2, 5);
  });
});

describe('Needle', () => {
  /** Needle wraps the triangle in a rotation box, so the shape is the child. */
  function triangleStyle(node: ReturnType<typeof render>) {
    const json = node.toJSON() as { children: { props: { style: Record<string, unknown> } }[] };
    return json.children[0].props.style;
  }

  it('is a triangle: zero-size box, side borders transparent, one filled', () => {
    const t = triangleStyle(
      render(<Needle size={SIZE} cx={0.5} cy={0.5} length={0.3} base={0.16} angle={0} color="#FF3B30" />),
    );
    expect(t.width).toBe(0);
    expect(t.height).toBe(0);
    expect(t.borderLeftColor).toBe('transparent');
    expect(t.borderRightColor).toBe('transparent');
    expect(t.borderBottomColor).toBe('#FF3B30');
  });

  it('is `base` wide at the pivot and `length` long', () => {
    // The two side borders together make the base, so each is half of it.
    const t = triangleStyle(
      render(<Needle size={SIZE} cx={0.5} cy={0.5} length={0.3} base={0.16} angle={0} color="#FFF" />),
    );
    expect(t.borderLeftWidth).toBeCloseTo(8, 5);
    expect(t.borderRightWidth).toBeCloseTo(8, 5);
    expect(t.borderBottomWidth).toBeCloseTo(30, 5);
  });

  it('hangs from the pivot, so opposite angles share one centre', () => {
    // The reason Safari's two halves meet instead of drifting: the box's bottom
    // edge sits on (cx, cy) and rotation happens about that point.
    const outer = (node: ReturnType<typeof render>) => styleOf(node);
    const a = outer(render(<Needle size={SIZE} cx={0.5} cy={0.5} length={0.3} base={0.16} angle={45} color="#FFF" />));
    const b = outer(render(<Needle size={SIZE} cx={0.5} cy={0.5} length={0.3} base={0.16} angle={225} color="#FFF" />));
    expect(a.left).toBeCloseTo(b.left as number, 5);
    expect(a.top).toBeCloseTo(b.top as number, 5);
    expect((a.top as number) + (a.height as number)).toBeCloseTo(50, 5);
  });

  it('rotates about the pivot rather than the box centre', () => {
    const s = styleOf(
      render(<Needle size={SIZE} cx={0.5} cy={0.5} length={0.3} base={0.16} angle={45} color="#FFF" />),
    );
    // translate down by half the height, rotate, translate back — the same
    // trick Hand uses.
    expect(s.transform).toEqual([{ translateY: 15 }, { rotate: '45deg' }, { translateY: -15 }]);
  });
});

describe('GradientDisc', () => {
  it('clips a gradient to a circle centred on (cx, cy)', () => {
    const s = styleOf(
      render(<GradientDisc size={SIZE} cx={0.5} cy={0.5} d={0.9} gradient={['#31CCFF', '#0A62EF']} />),
    );
    expect(s.width).toBeCloseTo(90, 5);
    expect(s.borderRadius).toBeCloseTo(45, 5);
    expect(s.overflow).toBe('hidden');
    expect(s.left).toBeCloseTo(5, 5);
    expect(s.top).toBeCloseTo(5, 5);
  });
});
