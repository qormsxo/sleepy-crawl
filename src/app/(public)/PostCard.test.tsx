// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PostCard } from './PostCard';
import type { FeedItem } from '@/feed/query';

afterEach(cleanup);

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  id: 1,
  title: '새벽에 냉장고 문 열었는데',
  preview: '계란이랑 눈 마주침',
  sourceName: '샘플 커뮤니티',
  postedAt: '2026-11-18T15:30:00.000Z',
  timezone: 'Asia/Seoul',
  categories: ['ABSURD', 'OVERTHINKING'],
  score: 82,
  reason: '독특한 전개',
  url: 'https://fixture.local/p/1',
  ...over,
});

describe('PostCard', () => {
  it('renders every required field', () => {
    const { container, getByText } = render(<PostCard item={item()} />);
    getByText('새벽에 냉장고 문 열었는데');
    getByText('샘플 커뮤니티');
    getByText('82');
    getByText('독특한 전개');
    expect(container.textContent).toContain('00:30'); // KST
    expect(container.textContent).toContain('황당');
    const a = container.querySelector('a[href="https://fixture.local/p/1"]')!;
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener nofollow');
  });

  it('renders HTML in titles as text only', () => {
    const { container } = render(<PostCard item={item({ title: '<script>alert(1)</script> 해킹?' })} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script> 해킹?');
  });

  it('falls back to the preview when there is no title', () => {
    const { container } = render(<PostCard item={item({ title: '' })} />);
    expect(container.querySelector('h2')?.textContent).toBe('계란이랑 눈 마주침');
  });

  it('labels non-Korean sources with local time', () => {
    const { container } = render(<PostCard item={item({ timezone: 'America/New_York', postedAt: '2026-11-19T06:20:00.000Z' })} />);
    expect(container.textContent).toContain('현지');
    expect(container.textContent).toContain('01:20');
  });
});
