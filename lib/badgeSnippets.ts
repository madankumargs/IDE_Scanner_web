export function badgeMarkdown(badgeUrl: string, reportUrl: string): string {
  return `[![GuardRails analysis](${badgeUrl})](${reportUrl})`;
}

export function badgeHtml(badgeUrl: string, reportUrl: string): string {
  return `<a href="${reportUrl}"><img src="${badgeUrl}" alt="Analyzed by GuardRails" width="240" height="20"></a>`;
}
