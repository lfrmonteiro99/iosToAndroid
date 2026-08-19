import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { CalculatorScreen } from '../CalculatorScreen';

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
    const { getByText, getAllByText } = render(<CalculatorScreen />);
    // The initial display and the '0' digit button both render the text '0' —
    // getAllByText('0')[0] is the display (see 'renders calculator display'
    // above), [1] is the actual pressable button.
    fireEvent.press(getAllByText('0')[1]);
    fireEvent.press(getByText('.'));
    fireEvent.press(getByText('1'));
    fireEvent.press(getByText('+'));
    // Display now reads '0.1', so the '0' button is unambiguous again.
    fireEvent.press(getByText('0'));
    fireEvent.press(getByText('.'));
    fireEvent.press(getByText('2'));
    fireEvent.press(getByText('='));
    expect(getByText('0.3')).toBeTruthy();
  });

  it('large multiplication stays in plain notation under 1e16', () => {
    const { getByText } = render(<CalculatorScreen />);
    // Query the '9' button once — after the first press the display itself
    // reads '9' too, which would make later getByText('9') calls ambiguous.
    const nineButton = getByText('9');
    for (let i = 0; i < 9; i++) fireEvent.press(nineButton);
    fireEvent.press(getByText('×'));
    fireEvent.press(getByText('1'));
    fireEvent.press(getByText('0'));
    fireEvent.press(getByText('0'));
    fireEvent.press(getByText('0'));
    fireEvent.press(getByText('='));
    // 999999999 × 1000 = 999999999000 — must not fall back to scientific
    // notation or lose digits.
    expect(getByText('999999999000')).toBeTruthy();
  });

  it('1e20 × 1e20 = 1e+40 switches to scientific notation', () => {
    const { getByText, getAllByText } = render(<CalculatorScreen />);
    // The calculator has no exponent-entry key, so 1e20 is built digit by
    // digit: '1' followed by twenty '0' presses. At the very start the
    // display and the '0' button both show '0' (see 'renders calculator
    // display' above), so the '0' button must be queried via getAllByText —
    // '1' has no such ambiguity since the display still reads '0'.
    const oneButton = getByText('1');
    const zeroButton = getAllByText('0')[1];

    const enterOneE20 = () => {
      fireEvent.press(oneButton);
      for (let i = 0; i < 20; i++) fireEvent.press(zeroButton);
    };

    enterOneE20();
    fireEvent.press(getByText('×'));
    enterOneE20();
    fireEvent.press(getByText('='));

    expect(getByText('1e+40')).toBeTruthy();
  });

  it('subtracting nearly equal operands keeps the exact decimal difference', () => {
    const { getByText, getAllByText } = render(<CalculatorScreen />);
    // Catastrophic cancellation: in IEEE-754 doubles
    // 100000000.30000001 - 100000000.3 === 1.4901161193847656e-8, and the
    // relative error survives formatNumber's 10-significant-digit rounding
    // ('1.490116119e-8'). Only exact decimal arithmetic yields '1e-8'.
    // Buttons are captured before the first press: once the display echoes a
    // digit, getByText for that digit becomes ambiguous.
    const one = getByText('1');
    const zero = getAllByText('0')[1];
    const three = getByText('3');
    const dot = getByText('.');

    const enterHundredMillionPointThree = () => {
      fireEvent.press(one);
      for (let i = 0; i < 8; i++) fireEvent.press(zero);
      fireEvent.press(dot);
      fireEvent.press(three);
    };

    enterHundredMillionPointThree();
    for (let i = 0; i < 6; i++) fireEvent.press(zero);
    fireEvent.press(one); // 100000000.30000001
    fireEvent.press(getByText('-'));
    enterHundredMillionPointThree(); // 100000000.3
    fireEvent.press(getByText('='));

    expect(getByText('1e-8')).toBeTruthy();
  });

  it('memory add/subtract keeps the exact decimal difference', () => {
    const { getByText, getAllByText } = render(<CalculatorScreen />);
    // Same cancellation, but routed through M+/M- instead of the '=' key —
    // memory must accumulate with the same decimal arithmetic as performOp.
    const one = getByText('1');
    const zero = getAllByText('0')[1];
    const three = getByText('3');
    const dot = getByText('.');

    const enterHundredMillionPointThree = () => {
      fireEvent.press(one);
      for (let i = 0; i < 8; i++) fireEvent.press(zero);
      fireEvent.press(dot);
      fireEvent.press(three);
    };

    enterHundredMillionPointThree();
    for (let i = 0; i < 6; i++) fireEvent.press(zero);
    fireEvent.press(one); // 100000000.30000001
    fireEvent.press(getByText('M+'));
    enterHundredMillionPointThree(); // 100000000.3
    fireEvent.press(getByText('M-'));
    fireEvent.press(getByText('MR'));

    expect(getByText('1e-8')).toBeTruthy();
  });

  it('pressing M+ twice adds the displayed value twice', () => {
    const { getByText } = render(<CalculatorScreen />);
    const five = getByText('5');
    fireEvent.press(five);
    const memoryAdd = getByText('M+');
    fireEvent.press(memoryAdd);
    fireEvent.press(memoryAdd);
    fireEvent.press(getByText('MR'));
    expect(getByText('10')).toBeTruthy();
  });

  it('MC empties memory so MR recalls zero', () => {
    const { getByText, queryByText } = render(<CalculatorScreen />);
    // Memorize '123' — a value no keyboard button can ever render (every
    // button label is a single character: '0'-'9', an operator, or a
    // function name), so its presence/absence in the tree unambiguously
    // reflects the display, unlike '0' which the digit button also renders.
    fireEvent.press(getByText('1'));
    fireEvent.press(getByText('2'));
    fireEvent.press(getByText('3'));
    fireEvent.press(getByText('M+')); // memory = 123
    fireEvent.press(getByText('MC'));
    fireEvent.press(getByText('MR'));
    // If MC failed to clear memory, MR would recall 123 and '123' would
    // still be findable in the tree.
    expect(queryByText('123')).toBeNull();
  });

  it('dividing by zero shows Error instead of a numeric result', () => {
    const { getByText } = render(<CalculatorScreen />);
    fireEvent.press(getByText('5'));
    fireEvent.press(getByText('÷'));
    fireEvent.press(getByText('0'));
    fireEvent.press(getByText('='));
    expect(getByText('Error')).toBeTruthy();
  });
});
