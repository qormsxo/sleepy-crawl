// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
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
