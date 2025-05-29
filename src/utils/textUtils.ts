export const cleanText = (text: string): string => {
  return text
    .replace(/[\n\t]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const extractUrlFromHref = (href: string): string | null => {
  const match = href.match(/\/board\/[^']+/);
  return match ? `https://m.dcinside.com${match[0]}` : null;
}; 