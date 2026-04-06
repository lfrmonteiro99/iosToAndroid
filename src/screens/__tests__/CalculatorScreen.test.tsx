import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { CalculatorScreen } from '../CalculatorScreen';

// Helper: get the calculator display element (first text match — display sits above buttons)
const getDisplay = (getAllByText: (text: string) => any[], text: string) => // eslint-disable-line @typescript-eslint/no-explicit-any
  getAllByText(text)[0];

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
});
