import { cleanText, htmlAdapter, resolve, type ListRow } from './html-adapter';
import { parseKstAbsolute, parseKstListTime } from './kst-time';

/*
 * Selectors were taken from the live pages on 2026-11-18 (see docs/sources.md).
 * Every canonical URL below is a robots.txt-allowed form for that site.
 */

const hostIs = (u: URL, ...hosts: string[]) => hosts.includes(u.hostname);

export const todayhumorAdapter = htmlAdapter({
  key: 'todayhumor',
  listTimeUntrusted: true, // list shows when the post reached the best board
  canonicalize(href, base) {
    const u = resolve(href, base);
    if (!u || !hostIs(u, 'www.todayhumor.co.kr', 'm.todayhumor.co.kr', 'todayhumor.co.kr')) return null;
    if (!/\/view\.php$/.test(u.pathname)) return null;
    const table = u.searchParams.get('table');
    const no = u.searchParams.get('no');
    if (!table || !no || !/^\w+$/.test(table) || !/^\d+$/.test(no)) return null;
    return { url: `https://www.todayhumor.co.kr/board/view.php?table=${table}&no=${no}`, externalId: `${table}:${no}` };
  },
  parseList($, now) {
    return $('tr.view')
      .toArray()
      .map((tr): ListRow => {
        const a = $(tr).find('td.subject a').first();
        return { href: a.attr('href') ?? '', title: a.text(), time: parseKstListTime($(tr).find('td.date').text(), now) };
      })
      .filter((r) => r.href);
  },
  parsePost($) {
    const info = $('body').text().match(/원글작성시간\s*:\s*([0-9/: ]+)/);
    return {
      title: $('.viewSubjectDiv').text(),
      body: cleanText($, '.viewContent'),
      postedAt: info ? parseKstAbsolute(info[1]) : null,
      precision: 'exact',
    };
  },
});

export const fmkoreaAdapter = htmlAdapter({
  key: 'fmkorea',
  listTimeUntrusted: true, // "N 시간 전"
  canonicalize(href, base) {
    const u = resolve(href, base);
    if (!u || !hostIs(u, 'www.fmkorea.com', 'm.fmkorea.com', 'fmkorea.com')) return null;
    const srl = u.searchParams.get('document_srl') ?? u.pathname.match(/^\/(?:best\/)?(\d+)$/)?.[1];
    if (!srl || !/^\d+$/.test(srl)) return null;
    return { url: `https://www.fmkorea.com/best/${srl}`, externalId: srl };
  },
  parseList($, now) {
    return $('li.li')
      .toArray()
      .map((li): ListRow => {
        const a = $(li).find('h3.title a').first();
        const title = a.find('.ellipsis-target').text() || a.text().replace(/\[\d+\]\s*$/, '');
        return { href: a.attr('href') ?? '', title, time: parseKstListTime($(li).find('.regdate').text(), now) };
      })
      .filter((r) => r.href);
  },
  parsePost($) {
    return {
      title: $('.top_area h1').text(),
      body: cleanText($, 'article .xe_content'),
      postedAt: parseKstAbsolute($('.top_area .date').first().text()),
      precision: 'minute',
    };
  },
});

export const ruliwebAdapter = htmlAdapter({
  key: 'ruliweb',
  canonicalize(href, base) {
    const u = resolve(href, base);
    if (!u || !hostIs(u, 'bbs.ruliweb.com', 'm.ruliweb.com')) return null;
    const m = u.pathname.match(/^\/(?:best\/)?board\/(\d+)\/read\/(\d+)/) ?? u.pathname.match(/^\/[\w/]*\/board\/(\d+)\/read\/(\d+)/);
    if (!m) return null;
    return { url: `https://bbs.ruliweb.com/best/board/${m[1]}/read/${m[2]}`, externalId: `${m[1]}/${m[2]}` };
  },
  parseList($, now) {
    return $('tr.table_body')
      .not('.notice')
      .toArray()
      .map((tr): ListRow => {
        const a = $(tr).find('a.subject_link').first();
        const title = a.find('.text_over').text() || a.text().replace(/^\s*\d+\s+/, '');
        return { href: a.attr('href') ?? '', title, time: parseKstListTime($(tr).find('td.time').text(), now) };
      })
      .filter((r) => r.href);
  },
  parsePost($) {
    return {
      title: $('.subject_inner_text').first().text(),
      body: cleanText($, '.view_content'),
      postedAt: parseKstAbsolute($('.regdate').first().text()),
      precision: 'exact',
    };
  },
});

export const invenAdapter = htmlAdapter({
  key: 'inven',
  canonicalize(href, base) {
    const u = resolve(href, base);
    if (!u || !hostIs(u, 'www.inven.co.kr', 'm.inven.co.kr')) return null;
    const m = u.pathname.match(/^\/board\/(\w+)\/(\d+)\/(\d+)$/);
    if (!m) return null;
    return { url: `https://www.inven.co.kr/board/${m[1]}/${m[2]}/${m[3]}`, externalId: `${m[1]}/${m[2]}/${m[3]}` };
  },
  parseList($, now) {
    return $('table tbody tr')
      .not('.notice')
      .toArray()
      .map((tr): ListRow => {
        const a = $(tr).find('a.subject-link').first().clone();
        a.find('.category').remove();
        return { href: a.attr('href') ?? '', title: a.text(), time: parseKstListTime($(tr).find('td.date').text(), now) };
      })
      .filter((r) => r.href);
  },
  parsePost($) {
    return {
      title: $('.articleTitle h1').first().text(),
      body: cleanText($, '#powerbbsContent'),
      postedAt: parseKstAbsolute($('.articleDate').first().text()),
      precision: 'minute',
    };
  },
});

export const clienAdapter = htmlAdapter({
  key: 'clien',
  canonicalize(href, base) {
    const u = resolve(href, base);
    if (!u || !hostIs(u, 'www.clien.net', 'm.clien.net', 'clien.net')) return null;
    const m = u.pathname.match(/^\/service\/board\/(\w+)\/(\d+)$/);
    if (!m) return null;
    // No query string: clien's robots.txt intends to exclude every "?..." URL.
    return { url: `https://www.clien.net/service/board/${m[1]}/${m[2]}`, externalId: `${m[1]}/${m[2]}` };
  },
  parseList($, now) {
    return $('.list_item.symph_row')
      .not('.notice')
      .toArray()
      .map((row): ListRow => {
        const a = $(row).find('a.list_subject').first();
        return {
          href: a.attr('href') ?? '',
          title: $(row).find('.subject_fixed').first().text(),
          time: parseKstListTime($(row).find('.list_time .timestamp').first().text(), now),
        };
      })
      .filter((r) => r.href);
  },
  parsePost($) {
    const dt = $('article.post time[datetime]').first().attr('datetime');
    const at = dt ? new Date(dt) : null;
    return {
      title: $('article.post h1').first().text(),
      body: cleanText($, 'article.post .content'),
      postedAt: at && !Number.isNaN(at.getTime()) ? at : null,
      precision: 'exact',
    };
  },
});

export const humorunivAdapter = htmlAdapter({
  key: 'humoruniv',
  listTimeUntrusted: true, // list shows when the post moved to 웃긴자료
  canonicalize(href, base) {
    const u = resolve(href, base);
    if (!u || !hostIs(u, 'web.humoruniv.com', 'm.humoruniv.com', 'humoruniv.com')) return null;
    if (!/\/read\.html$/.test(u.pathname)) return null;
    const table = u.searchParams.get('table');
    const n = u.searchParams.get('number');
    if (!table || !n || !/^\w+$/.test(table) || !/^\d+$/.test(n)) return null;
    return { url: `https://web.humoruniv.com/board/humor/read.html?table=${table}&number=${n}`, externalId: `${table}:${n}` };
  },
  parseList($, now) {
    return $('table#post_list tr')
      .toArray()
      .filter((tr) => $(tr).find('span[id^="title_chk_"]').length > 0)
      .map((tr): ListRow => {
        const a = $(tr).find('td.li_sbj a').first();
        const when = `${$(tr).find('.w_date').text()} ${$(tr).find('.w_time').text()}`;
        return { href: a.attr('href') ?? '', title: $(tr).find('span[id^="title_chk_"]').text(), time: parseKstListTime(when, now) };
      })
      .filter((r) => r.href);
  },
  parsePost($) {
    const written = $('body').text().match(/작성\s*:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    return {
      title: $('#ai_cm_title').first().text(),
      body: cleanText($, '#wrap_copy'),
      postedAt: written ? parseKstAbsolute(written[1]) : null,
      precision: 'exact',
    };
  },
});
