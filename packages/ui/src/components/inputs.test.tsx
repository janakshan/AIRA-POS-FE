import type { Money } from '@rbp/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MoneyInput, toDecimalString } from './money-input';
import { clampInteger, NumberInput } from './number-input';

function MoneyHarness({ onValue }: { onValue: (m: Money | null) => void }) {
  const [value, setValue] = useState<Money | null>(null);
  return (
    <MoneyInput
      aria-label="price"
      currency="LKR"
      value={value}
      onChange={(m) => {
        setValue(m);
        onValue(m);
      }}
    />
  );
}

describe('MoneyInput', () => {
  it('parses typed decimals into integer minor units', async () => {
    const onValue = vi.fn();
    render(<MoneyHarness onValue={onValue} />);
    await userEvent.type(screen.getByLabelText('price'), '1250.5');
    expect(onValue).toHaveBeenLastCalledWith({ amount: 125050, currency: 'LKR' });
  });

  it('rejects a third decimal place and letters', async () => {
    const onValue = vi.fn();
    render(<MoneyHarness onValue={onValue} />);
    const input = screen.getByLabelText('price');
    await userEvent.type(input, '0.105x');
    expect(input).toHaveValue('0.10');
    expect(onValue).toHaveBeenLastCalledWith({ amount: 10, currency: 'LKR' });
  });

  it('formats minor units for editing without float math', () => {
    expect(toDecimalString({ amount: 125050, currency: 'LKR' })).toBe('1250.50');
    expect(toDecimalString({ amount: 5, currency: 'LKR' })).toBe('0.05');
    expect(toDecimalString(null)).toBe('');
  });
});

describe('NumberInput', () => {
  function Harness() {
    const [value, setValue] = useState<number | null>(5);
    return <NumberInput aria-label="qty" min={1} max={10} value={value} onChange={setValue} />;
  }

  it('clamps to bounds on blur and via stepper', async () => {
    render(<Harness />);
    const input = screen.getByLabelText('qty');
    await userEvent.clear(input);
    await userEvent.type(input, '42');
    await userEvent.tab();
    expect(input).toHaveValue('10');
    await userEvent.click(screen.getByLabelText('Increase'));
    expect(input).toHaveValue('10');
    expect(screen.getByLabelText('Increase')).toBeDisabled();
  });

  it('supports arrow keys', async () => {
    render(<Harness />);
    const input = screen.getByLabelText('qty');
    input.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveValue('3');
  });

  it('clampInteger truncates and bounds', () => {
    expect(clampInteger(3.9, 0, 10)).toBe(3);
    expect(clampInteger(-4, 0, 10)).toBe(0);
  });
});
