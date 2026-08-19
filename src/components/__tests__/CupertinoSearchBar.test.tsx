import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { CupertinoSearchBar } from '../CupertinoSearchBar';

describe('CupertinoSearchBar', () => {
  it('renders the search input with the default placeholder', () => {
    const { getByPlaceholderText } = render(
      <CupertinoSearchBar value="" onChangeText={jest.fn()} />,
    );
    expect(getByPlaceholderText('Search')).toBeTruthy();
  });

  it('hides Cancel when not focused and value is empty', () => {
    const { queryByText } = render(
      <CupertinoSearchBar value="" onChangeText={jest.fn()} />,
    );
    expect(queryByText('Cancel')).toBeNull();
  });

  it('shows Cancel when focused even with an empty value', () => {
    const { getByPlaceholderText, getByText } = render(
      <CupertinoSearchBar value="" onChangeText={jest.fn()} />,
    );
    fireEvent(getByPlaceholderText('Search'), 'focus');
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('shows Cancel when value has text even without focus', () => {
    const { getByText } = render(
      <CupertinoSearchBar value="hello" onChangeText={jest.fn()} />,
    );
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('hides Cancel after blur when value is empty', () => {
    const { getByPlaceholderText, queryByText } = render(
      <CupertinoSearchBar value="" onChangeText={jest.fn()} />,
    );
    const input = getByPlaceholderText('Search');
    fireEvent(input, 'focus');
    expect(queryByText('Cancel')).toBeTruthy();
    fireEvent(input, 'blur');
    expect(queryByText('Cancel')).toBeNull();
  });

  it('keeps Cancel visible after blur when value has text', () => {
    const { getByPlaceholderText, getByText } = render(
      <CupertinoSearchBar value="hello" onChangeText={jest.fn()} />,
    );
    fireEvent(getByPlaceholderText('Search'), 'blur');
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('clears the text and calls onCancel when Cancel is pressed', () => {
    const onChangeText = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = render(
      <CupertinoSearchBar
        value="hello"
        onChangeText={onChangeText}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(getByText('Cancel'));
    expect(onChangeText).toHaveBeenCalledWith('');
    expect(onCancel).toHaveBeenCalled();
  });

  it('hides Cancel after pressing it when the parent clears the value', () => {
    const onChangeText = jest.fn();
    const onCancel = jest.fn();
    const { getByText, queryByText, rerender } = render(
      <CupertinoSearchBar
        value="hello"
        onChangeText={onChangeText}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(getByText('Cancel'));
    // Parent updates value in response to onChangeText('')
    rerender(
      <CupertinoSearchBar
        value=""
        onChangeText={onChangeText}
        onCancel={onCancel}
      />,
    );
    expect(queryByText('Cancel')).toBeNull();
  });

  it('calls onFocusChange with true on focus and false on blur', () => {
    const onFocusChange = jest.fn();
    const { getByPlaceholderText } = render(
      <CupertinoSearchBar
        value=""
        onChangeText={jest.fn()}
        onFocusChange={onFocusChange}
      />,
    );
    const input = getByPlaceholderText('Search');
    fireEvent(input, 'focus');
    expect(onFocusChange).toHaveBeenCalledWith(true);
    fireEvent(input, 'blur');
    expect(onFocusChange).toHaveBeenCalledWith(false);
  });

  it('reports focus loss when Cancel is pressed', () => {
    const onFocusChange = jest.fn();
    const { getByText } = render(
      <CupertinoSearchBar
        value="hello"
        onChangeText={jest.fn()}
        onFocusChange={onFocusChange}
      />,
    );
    fireEvent.press(getByText('Cancel'));
    expect(onFocusChange).toHaveBeenCalledWith(false);
  });
});
