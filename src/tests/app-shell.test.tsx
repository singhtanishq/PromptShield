import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { parseHash, routeHref } from '../app/router';

describe('router', () => {
  it('parses known hash routes', () => {
    expect(parseHash('#/sanitizer')).toBe('sanitizer');
    expect(parseHash('#/privacy')).toBe('privacy');
    expect(parseHash('#/rules')).toBe('rules');
  });

  it('falls back to sanitizer for unknown or empty hashes', () => {
    expect(parseHash('')).toBe('sanitizer');
    expect(parseHash('#/does-not-exist')).toBe('sanitizer');
    expect(parseHash('#nope')).toBe('sanitizer');
  });

  it('builds hrefs', () => {
    expect(routeHref('about')).toBe('#/about');
  });
});

describe('App shell', () => {
  it('renders the sanitizer workspace as the default view', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Sanitize a prompt' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('navigates between views via hash links', async () => {
    const user = userEvent.setup();
    render(<App />);
    // Desktop primary nav (footer/mobile nav also contain these labels).
    const nav = within(screen.getByRole('navigation', { name: 'Primary' }));
    await user.click(nav.getByRole('link', { name: /Privacy/ }));
    expect(screen.getByRole('heading', { name: 'Privacy center' })).toBeInTheDocument();
    await user.click(nav.getByRole('link', { name: /Guides/ }));
    expect(screen.getByRole('heading', { name: 'Guides' })).toBeInTheDocument();
    await user.click(nav.getByRole('link', { name: /About/ }));
    expect(screen.getByRole('heading', { name: /About PromptShield/ })).toBeInTheDocument();
  });

  it('shows the first-run privacy explanation in the empty editor state', () => {
    render(<App />);
    expect(
      screen.getByText(
        /analyzed in this browser. PromptShield does not send prompt content to a server/,
      ),
    ).toBeInTheDocument();
  });

  it('loads a synthetic sample via the Samples menu', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Samples' }));
    await user.click(screen.getByRole('menuitem', { name: /Developer bug report/ }));
    const editor = screen.getByLabelText('Prompt text to inspect') as HTMLTextAreaElement;
    expect(editor.value).toContain('AKIAIOSFODNN7EXAMPLE');
    expect(editor.value.length).toBeGreaterThan(200);
  });

  it('counts characters and words after typing', async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = screen.getByLabelText('Prompt text to inspect') as HTMLTextAreaElement;
    await user.type(editor, 'hello brave new world');
    expect(screen.getByText(/21 characters · 4 words/)).toBeInTheDocument();
  });

  it('confirms before clearing non-empty input', async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = screen.getByLabelText('Prompt text to inspect');
    await user.type(editor, 'some content');
    await user.click(screen.getByRole('button', { name: /Clear/ }));
    expect(screen.getByRole('dialog', { name: 'Clear the prompt?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear prompt' }));
    expect((editor as HTMLTextAreaElement).value).toBe('');
  });
});
