// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { LoginForm, type LoginState } from './LoginForm';

afterEach(cleanup);
const noop = async (s: LoginState) => s;

describe('LoginForm', () => {
  it('has email and password fields with password autocomplete', () => {
    const { container } = render(<LoginForm action={noop} />);
    expect(container.querySelector('input[name="email"][type="email"]')).not.toBeNull();
    expect(container.querySelector('input[name="password"][type="password"]')?.getAttribute('autocomplete')).toBe('current-password');
  });

  it('does not reveal whether the email exists', () => {
    const { getByText } = render(<LoginForm action={noop} initialState={{ status: 'error', error: 'invalid' }} />);
    getByText('이메일 또는 비밀번호가 맞지 않아요.');
  });

  it('explains the lockout', () => {
    const { getByText } = render(<LoginForm action={noop} initialState={{ status: 'error', error: 'locked' }} />);
    getByText(/15분 뒤/);
  });
});
