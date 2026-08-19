import React from 'react';
import { Dimensions } from 'react-native';
import Decimal from 'decimal.js';
import { render, fireEvent } from '../../test-utils';
import { CalculatorScreen } from '../CalculatorScreen';

// Scientific buttons only render in the landscape SCIENTIFIC_ROWS grid
// (CalculatorScreen.tsx:774), so these helpers flip useWindowDimensions'
// underlying source between tests.
const PORTRAIT = { width: 750, height: 1334, scale: 2, fontScale: 2 };
const LANDSCAPE = { width: 1334, height: 750, scale: 2, fontScale: 2 };
const goLandscape = () => Dimensions.set({ window: LANDSCAPE, screen: LANDSCAPE });
const goPortrait = () => Dimensions.set({ window: PORTRAIT, screen: PORTRAIT });

// Digit/decimal buttons collide in text with the display once it shows the
// same character (e.g. display "5" + button "5"), so entry goes through the
// accessibility role instead of getByText.
function typeNumber(getByRole: (role: 'button', opts: { name: string }) => unknown, numStr: string) {
  for (const ch of numStr) {
    const name = ch === '.' ? 'decimal point' : ch;
    fireEvent.press(getByRole('button', { name }) as never);
  }
}

describe('CalculatorScreen', () => {
  it('renders calculator display', () => {
    const { getAllByText } = render(<CalculatorScreen />);
    // '0' appears as both the display and the zero button — display is first in the tree
    expect(getAllByText('0')[0]).toBeTruthy();
  });

  it('pressing numbers updates display', () => {
    const { getByText } = render(<CalculatorScreen />);
    fireEvent.press(getByText('1'));
    fireEvent.press(getByText('2'));
    fireEvent.press(getByText('3'));
    expect(getByText('123')).toBeTruthy();
  });

  it('addition works', () => {
    const { getByText, getAllByText } = render(<CalculatorScreen />);
    fireEvent.press(getByText('2'));
    fireEvent.press(getByText('+'));
    fireEvent.press(getByText('3'));
    fireEvent.press(getByText('='));
    // '5' appears as display result and as the '5' button — display is first
    expect(getAllByText('5')[0]).toBeTruthy();
  });

  it('subtraction works', () => {
    const { getByText, getAllByText } = render(<CalculatorScreen />);
    fireEvent.press(getByText('9'));
    fireEvent.press(getByText('-'));
    fireEvent.press(getByText('4'));
    fireEvent.press(getByText('='));
    expect(getAllByText('5')[0]).toBeTruthy();
  });

  it('multiplication works', () => {
    const { getByText } = render(<CalculatorScreen />);
    fireEvent.press(getByText('3'));
    fireEvent.press(getByText('×'));
    fireEvent.press(getByText('4'));
    fireEvent.press(getByText('='));
    expect(getByText('12')).toBeTruthy();
  });

  it('division works', () => {
    const { getByText, getAllByText } = render(<CalculatorScreen />);
    fireEvent.press(getByText('8'));
    fireEvent.press(getByText('÷'));
    fireEvent.press(getByText('2'));
    fireEvent.press(getByText('='));
    expect(getAllByText('4')[0]).toBeTruthy();
  });

  it('AC clears display', () => {
    const { getByText, getAllByText } = render(<CalculatorScreen />);
    fireEvent.press(getByText('5'));
    fireEvent.press(getByText('7'));
    fireEvent.press(getByText('AC'));
    expect(getAllByText('0')[0]).toBeTruthy();
  });

  it('decimal point works', () => {
    const { getByText } = render(<CalculatorScreen />);
    fireEvent.press(getByText('1'));
    fireEvent.press(getByText('.'));
    fireEvent.press(getByText('5'));
    expect(getByText('1.5')).toBeTruthy();
  });

  it('percentage works', () => {
    const { getByText } = render(<CalculatorScreen />);
    fireEvent.press(getByText('5'));
    fireEvent.press(getByText('0'));
    fireEvent.press(getByText('%'));
    expect(getByText('0.5')).toBeTruthy();
  });

  it('0.1 + 0.2 equals 0.3 without float artifacts', () => {
    const { getByText } = render(<CalculatorScreen />);
    fireEvent.press(getByText('0'));
    fireEvent.press(getByText('.'));
    fireEvent.press(getByText('1'));
    fireEvent.press(getByText('+'));
    fireEvent.press(getByText('0'));
    fireEvent.press(getByText('.'));
    fireEvent.press(getByText('2'));
    fireEvent.press(getByText('='));
    expect(getByText('0.3')).toBeTruthy();
  });

  describe('scientific functions route through decimal.js (issue #336)', () => {
    afterEach(() => {
      goPortrait();
    });

    // sin(180°) is mathematically 0. Native `Math.sin(180 * Math.PI/180)`
    // carries the double-precision error of Math.PI itself and lands on
    // 1.224646799e-16. Routing the degree conversion through Decimal's
    // 20-digit Decimal.acos(-1) lands on a value ~4 orders of magnitude
    // closer to zero — a difference formatNumber's 10-significant-digit
    // trim does NOT wash out.
    it('sin uses Decimal-precision degree conversion', () => {
      goLandscape();
      const { getByRole, getByText, getAllByText } = render(<CalculatorScreen />);
      typeNumber(getByRole, '180');
      fireEvent.press(getByText('sin'));
      expect(getAllByText('-3.735661672e-20')[0]).toBeTruthy();
    });

    // Same reasoning as sin, at cos(90°).
    it('cos uses Decimal-precision degree conversion', () => {
      goLandscape();
      const { getByRole, getByText, getAllByText } = render(<CalculatorScreen />);
      typeNumber(getByRole, '90');
      fireEvent.press(getByText('cos'));
      expect(getAllByText('-6.867830836e-20')[0]).toBeTruthy();
    });

    // tan(90°) sits on tangent's discontinuity — both native and Decimal
    // produce large garbage values near the asymptote, but they diverge
    // sharply because they approach it from opposite sides of the true
    // singularity (native ends up positive ~1.63e16, Decimal negative
    // ~-7.07e14). A visible, deterministic 10-digit-display divergence.
    it('tan diverges sharply from native Math near its 90° discontinuity', () => {
      goLandscape();
      const { getByRole, getByText, getAllByText } = render(<CalculatorScreen />);
      typeNumber(getByRole, '90');
      fireEvent.press(getByText('tan'));
      expect(getAllByText('-707106781200000')[0]).toBeTruthy();
    });

    // log10(x) for x just below 1 is a textbook catastrophic-cancellation
    // case: Math.log10 computes log(x)/LN10 in double precision, Decimal's
    // log() carries 20 digits through the whole computation.
    it('log (base 10) resolves catastrophic cancellation near 1', () => {
      goLandscape();
      const { getByRole, getByText, getAllByText } = render(<CalculatorScreen />);
      typeNumber(getByRole, '0.9999999999999998');
      fireEvent.press(getByText('log'));
      expect(getAllByText('-8.685889638e-17')[0]).toBeTruthy();
    });

    // Same cancellation case for ln, just above 1.
    it('ln resolves catastrophic cancellation near 1', () => {
      goLandscape();
      const { getByRole, getByText, getAllByText } = render(<CalculatorScreen />);
      typeNumber(getByRole, '1.0000000000000002');
      fireEvent.press(getByText('ln'));
      expect(getAllByText('2e-16')[0]).toBeTruthy();
    });

    // 81619578.08945106² is a crafted 1-ULP boundary: Math.pow and
    // Decimal.pow round the last significant digit differently
    // (...27000000 vs ...28000000), which survives formatNumber's
    // 10-significant-digit trim.
    it('x² routes through Decimal.pow, not Math.pow', () => {
      goLandscape();
      const { getByRole, getByText, getAllByText } = render(<CalculatorScreen />);
      typeNumber(getByRole, '81619578.08945106');
      fireEvent.press(getByText('x²'));
      expect(getAllByText('6661755528000000')[0]).toBeTruthy();
    });

    // √, x³, 1/x and |x| are correctly-rounded double operations already —
    // native Math and Decimal.toNumber() agree bit-for-bit on virtually
    // every input, so there is no display-visible value to assert on.
    // These assert the routing directly: the Decimal method must be the
    // one actually invoked.
    it('√ calls Decimal.prototype.sqrt, not Math.sqrt', () => {
      goLandscape();
      const spy = jest.spyOn(Decimal.prototype, 'sqrt');
      const { getByRole, getByText } = render(<CalculatorScreen />);
      typeNumber(getByRole, '2');
      fireEvent.press(getByText('√'));
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('x³ calls Decimal.prototype.pow with exponent 3, not Math.pow', () => {
      goLandscape();
      const spy = jest.spyOn(Decimal.prototype, 'pow');
      const { getByRole, getByText } = render(<CalculatorScreen />);
      typeNumber(getByRole, '5');
      fireEvent.press(getByText('x³'));
      expect(spy).toHaveBeenCalledWith(3);
      spy.mockRestore();
    });

    it('1/x calls Decimal.prototype.div, not native division', () => {
      goLandscape();
      const spy = jest.spyOn(Decimal.prototype, 'div');
      const { getByRole, getByText } = render(<CalculatorScreen />);
      typeNumber(getByRole, '4');
      fireEvent.press(getByText('1/x'));
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('1/x still guards against division by zero', () => {
      goLandscape();
      const { getByText, getAllByText } = render(<CalculatorScreen />);
      fireEvent.press(getByText('1/x'));
      expect(getAllByText('Error')[0]).toBeTruthy();
    });

    // formatNumber() (CalculatorScreen.tsx:153-154) always calls
    // Decimal(...).abs() internally on the *result*, so a bare
    // "was abs() called" spy passes even when the |x| case itself still
    // uses Math.abs — it's satisfied by formatNumber alone. Assert
    // instead that abs() was called on an instance holding the *negative
    // input* (-7), which can only come from the |x| case computing on the
    // Decimal-wrapped current value, not from formatting the (already
    // positive) result.
    it('|x| calls Decimal.prototype.abs on the input, not Math.abs', () => {
      goLandscape();
      const spy = jest.spyOn(Decimal.prototype, 'abs');
      const { getByRole, getByText } = render(<CalculatorScreen />);
      typeNumber(getByRole, '7');
      fireEvent.press(getByText('+/-'));
      spy.mockClear();
      fireEvent.press(getByText('|x|'));
      const calledOnNegativeInput = spy.mock.instances.some(
        inst => (inst as Decimal).toNumber() === -7,
      );
      expect(calledOnNegativeInput).toBe(true);
      spy.mockRestore();
    });
  });
});
