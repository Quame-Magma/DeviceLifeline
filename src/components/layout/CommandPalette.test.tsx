import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <CommandPalette open={false} onClose={vi.fn()} onNavigate={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('opens and lists navigation commands', () => {
    render(
      <CommandPalette open onClose={vi.fn()} onNavigate={vi.fn()} />,
    );
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Processes')).toBeInTheDocument();
    expect(screen.getByText('Copilot')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <CommandPalette open onClose={onClose} onNavigate={vi.fn()} />,
    );
    fireEvent.keyDown(screen.getByTestId('command-palette'), {
      key: 'Escape',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters commands by query', () => {
    render(
      <CommandPalette open onClose={vi.fn()} onNavigate={vi.fn()} />,
    );
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'storage' } });
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
  });

  it('navigates and closes when a command is chosen', () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    render(
      <CommandPalette open onClose={onClose} onNavigate={onNavigate} />,
    );
    fireEvent.click(screen.getByTestId('command-item-nav-processes'));
    expect(onNavigate).toHaveBeenCalledWith('processes');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports keyboard navigation with ArrowDown and Enter', () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    render(
      <CommandPalette open onClose={onClose} onNavigate={onNavigate} />,
    );
    const dialog = screen.getByTestId('command-palette');
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'Enter' });
    // Second item is Health (Care group)
    expect(onNavigate).toHaveBeenCalledWith('health');
    expect(onClose).toHaveBeenCalled();
  });
});
