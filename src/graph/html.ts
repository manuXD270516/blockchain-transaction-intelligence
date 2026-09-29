export const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'";

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;max-width:1100px;color:#1b1b1b}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}
code{word-break:break-all}.executed{color:#2e7d32}.reverted{color:#c62828}.unknown{color:#616161}
.notice{background:#fff8e1;border-left:4px solid #f9a825;padding:6px 10px;margin:4px 0}
section.panel{border:1px solid #ddd;padding:8px 12px;margin:10px 0}section.panel:target{outline:3px solid #1565c0}
nav a{margin-right:12px}
</style></head><body>
${body}
</body></html>
`;
}
