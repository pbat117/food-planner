// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Stepper } from '@/ui/Stepper';
import { Switch } from '@/ui/Switch';

afterEach(cleanup);

describe('Stepper', () => {
  it('clamps to min and max', () => {
    const onChange = vi.fn();
    render(<Stepper value={10} min={0} max={10} step={2} onChange={onChange} label="Age" />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase Age' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Age' }));
    expect(onChange).toHaveBeenCalledWith(8);
  });
  it('never steps below min', () => {
    const onChange = vi.fn();
    render(<Stepper value={1} min={0} max={10} step={2} onChange={onChange} label="Age" />);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Age' }));
    expect(onChange).toHaveBeenCalledWith(0);
  });
});

describe('Segmented', () => {
  it('calls onChange with the option value and marks the selected one', () => {
    const onChange = vi.fn();
    render(<Segmented label="Sex" options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} value="male" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Male' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Female' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    expect(onChange).toHaveBeenCalledWith('female');
  });
});

describe('Switch', () => {
  it('toggles', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Fruit" />);
    const sw = screen.getByRole('switch', { name: 'Fruit' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Sheet', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="Nutrient report"><p>body</p></Sheet>);
    expect(screen.getByRole('dialog', { name: 'Nutrient report' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
  it('renders nothing when closed', () => {
    render(<Sheet open={false} onClose={() => {}} title="X"><p>body</p></Sheet>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
