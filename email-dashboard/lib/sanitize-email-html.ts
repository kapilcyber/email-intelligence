/**
 * Prepare stored email HTML for embedding: remove leaking styles and common
 * inline colors so content stays readable in dark-themed UI (especially when
 * senders use black text intended for white backgrounds).
 */
function cleanInlineStyle(style: string): string {
  return style
    .replace(/\b-?webkit-text-fill-color\s*:\s*[^;]+;?/gi, "")
    .replace(/\bcolor\s*:\s*[^;]+;?/gi, "")
    .replace(/\bbackground-color\s*:\s*[^;]+;?/gi, "")
    .replace(/\bwhite-space\s*:\s*nowrap;?/gi, "")
    .replace(/\bword-break\s*:\s*keep-all;?/gi, "")
    .replace(/\s*;\s*;/g, ";")
    .replace(/^\s*;\s*|\s*;\s*$/g, "")
    .trim();
}

export function sanitizeEmailHtml(html: string): string {
  let out = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, "");

  out = out.replace(/\bstyle\s*=\s*(["'])(.*?)\1/gi, (_m, q: string, styleContent: string) => {
    const cleaned = cleanInlineStyle(styleContent);
    if (!cleaned) return "";
    return `style=${q}${cleaned}${q}`;
  });

  out = out.replace(/\sbgcolor\s*=\s*["'][^"']*["']/gi, "");
  out = out.replace(/\sbgColor\s*=\s*["'][^"']*["']/gi, "");

  // Legacy <font color="..."> — drop color by normalizing to spans.
  out = out.replace(/<font\b[^>]*>/gi, "<span>").replace(/<\/font>/gi, "</span>");

  // Newsletter tables often use width="600" / fixed px — forces horizontal overflow on phones.
  out = out.replace(/<table\b([^>]*)>/gi, (_, attrs: string) => {
    const next = attrs
      .replace(/\swidth\s*=\s*["'][^"']*["']/gi, "")
      .replace(/\swidth\s*=\s*\d+/gi, "");
    return `<table${next}>`;
  });

  out = out.replace(/\snowrap(?:=["']?nowrap["']?)?/gi, "");

  return out;
}

/** Light “paper” surface so HTML/plain bodies read correctly in dark mode. */
export const emailBodySurfaceClassName =
  "min-w-0 max-w-full overflow-x-auto rounded-lg border border-neutral-200/90 bg-neutral-50 p-3 text-neutral-900 shadow-sm dark:border-neutral-500 dark:bg-neutral-100 dark:text-neutral-900 sm:p-4";

/**
 * Prose inside {@link emailBodySurfaceClassName} — no prose-invert (parent is always light).
 * Tables and nowrap-heavy HTML are constrained for narrow viewports.
 */
export const emailHtmlProseClassName =
  "prose prose-sm prose-neutral min-w-0 w-full max-w-none break-words [overflow-wrap:anywhere] " +
  "prose-headings:text-neutral-900 prose-p:text-neutral-800 prose-li:text-neutral-800 " +
  "prose-td:text-neutral-800 prose-th:text-neutral-900 prose-a:break-words prose-a:text-blue-700 " +
  "prose-strong:text-neutral-900 prose-img:rounded-lg " +
  "[&_*]:max-w-full [&_div]:min-w-0 " +
  "[&_table]:w-full [&_table]:max-w-full [&_table]:table-fixed [&_table]:border-collapse " +
  "[&_td]:break-words [&_th]:break-words [&_td]:align-top [&_th]:align-top " +
  "[&_img]:h-auto [&_img]:max-w-full " +
  "[&_pre]:max-w-full [&_pre]:whitespace-pre-wrap [&_pre]:break-words";
