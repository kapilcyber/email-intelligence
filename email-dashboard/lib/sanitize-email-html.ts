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

  return out;
}

/** Light “paper” surface so HTML/plain bodies read correctly in dark mode. */
export const emailBodySurfaceClassName =
  "rounded-lg border border-neutral-200/90 bg-neutral-50 p-4 text-neutral-900 shadow-sm dark:border-neutral-500 dark:bg-neutral-100 dark:text-neutral-900";

/** Prose inside {@link emailBodySurfaceClassName} — no prose-invert (parent is always light). */
export const emailHtmlProseClassName =
  "prose prose-sm prose-neutral max-w-none prose-headings:text-neutral-900 prose-p:text-neutral-800 prose-li:text-neutral-800 prose-td:text-neutral-800 prose-th:text-neutral-900 prose-a:text-blue-700 prose-strong:text-neutral-900 prose-img:rounded-lg [&_*]:max-w-full";
