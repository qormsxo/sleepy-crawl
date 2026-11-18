/**
 * DCInside post URLs, parsed from the string alone. The server never requests DCInside
 * (its terms, art. 16, forbid crawling); submitters type the title/time/excerpt themselves.
 */
export function matchDcinside(url: URL): { externalId: string; canonicalUrl: string } | null {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname;

  if (host === 'gall.dcinside.com') {
    const m = url.pathname.match(/^\/(?:(mgallery|mini)\/)?board\/view\/?$/);
    const id = url.searchParams.get('id');
    const no = url.searchParams.get('no');
    if (!m || !id || !no || !/^\w+$/.test(id) || !/^\d+$/.test(no)) return null;
    return canonical(m[1] ?? 'board', id, no);
  }

  if (host === 'm.dcinside.com') {
    const m = url.pathname.match(/^\/(board|mini)\/(\w+)\/(\d+)\/?$/);
    if (!m) return null;
    return canonical(m[1], m[2], m[3]);
  }
  return null;
}

function canonical(kind: string, id: string, no: string) {
  const prefix = kind === 'board' ? '' : `${kind}/`;
  return { externalId: `${kind}:${id}:${no}`, canonicalUrl: `https://gall.dcinside.com/${prefix}board/view/?id=${id}&no=${no}` };
}
