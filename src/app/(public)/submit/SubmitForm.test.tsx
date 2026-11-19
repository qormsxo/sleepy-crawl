// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { SubmitForm, type SubmitState } from './SubmitForm';

afterEach(cleanup);

const noop = async (s: SubmitState) => s;
const initial: SubmitState = { status: 'idle' };

describe('SubmitForm', () => {
  it('shows only the URL, note and category fields for ordinary links', () => {
    const { container } = render(<SubmitForm action={noop} initialState={initial} siteKey="k" />);
    expect(container.querySelector('input[name="url"]')).not.toBeNull();
    expect(container.querySelector('textarea[name="note"]')).not.toBeNull();
    expect(container.querySelector('select[name="suggestedCategory"]')).not.toBeNull();
    expect(container.querySelector('[name="manualTitle"]')).toBeNull();
  });

  it('asks for title, time and excerpt when the link is a DCInside post', () => {
    const { container, getByText } = render(<SubmitForm action={noop} initialState={initial} siteKey="k" />);
    fireEvent.change(container.querySelector('input[name="url"]')!, {
      target: { value: 'https://gall.dcinside.com/board/view/?id=programming&no=1' },
    });
    expect(container.querySelector('input[name="manualTitle"]')).not.toBeNull();
    expect(container.querySelector('input[name="manualPostedAt"]')).not.toBeNull();
    expect(container.querySelector('textarea[name="manualExcerpt"]')).not.toBeNull();
    getByText(/직접 입력/);
  });

  it('shows a Korean error next to the failing field', () => {
    const { getByText } = render(
      <SubmitForm action={noop} initialState={{ status: 'error', error: 'unsupported_site', field: 'url' }} siteKey="k" />,
    );
    getByText(/지원하지 않는 사이트/);
  });

  it('shows the received message after success', () => {
    const { getByText } = render(<SubmitForm action={noop} initialState={{ status: 'ok' }} siteKey="k" />);
    getByText(/접수됐어요/);
  });

  it('renders the Turnstile widget with the site key', () => {
    const { container } = render(<SubmitForm action={noop} initialState={initial} siteKey="site-123" />);
    expect(container.querySelector('.cf-turnstile')?.getAttribute('data-sitekey')).toBe('site-123');
  });
});

describe('SubmitForm after an error (review fixes)', () => {
  it('keeps what the user typed', () => {
    const values = { url: 'https://gall.dcinside.com/board/view/?id=a&no=1', manualTitle: '제목', manualPostedAt: '2026-11-19 01:30', manualExcerpt: '내용이 짧음', note: '메모' };
    const { container } = render(
      <SubmitForm action={noop} initialState={{ status: 'error', error: 'invalid_field', field: 'manualExcerpt', values }} siteKey="k" />,
    );
    const v = (n: string) => (container.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value;
    expect(v('url')).toBe(values.url);
    expect(v('manualTitle')).toBe('제목');
    expect(v('manualPostedAt')).toBe('2026-11-19 01:30');
    expect(v('manualExcerpt')).toBe('내용이 짧음');
    expect(v('note')).toBe('메모');
  });

  it('renders Turnstile explicitly and resets it when the action returns an error (tokens are single-use)', async () => {
    const calls: string[] = [];
    (window as unknown as { turnstile: unknown }).turnstile = {
      render: (_el: unknown, opts: { sitekey: string }) => { calls.push(`render:${opts.sitekey}`); return 'w1'; },
      reset: (id: string) => calls.push(`reset:${id}`),
      remove: () => calls.push('remove'),
    };
    try {
      const failing = async (): Promise<SubmitState> => ({ status: 'error', error: 'rate_limited' });
      const { container, findByText } = render(<SubmitForm action={failing} initialState={initial} siteKey="k" />);
      expect(calls).toContain('render:k');
      await act(async () => {
        fireEvent.submit(container.querySelector('form')!);
      });
      await findByText(/제보가 너무 많아요/);
      expect(calls).toContain('reset:w1');
    } finally {
      delete (window as unknown as { turnstile?: unknown }).turnstile;
    }
  });
});
