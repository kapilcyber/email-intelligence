/**
 * Strip quoted/replied content from email bodies so the thread view shows only
 * the new content of each message (Original = full; Reply 1 = only new text; Reply 2 = only new text).
 * Handles Outlook-style "From:/Sent:/To:/Subject:" blocks and common quote markers.
 */

/** Strip quoted content from plain-text body (e.g. "From: ... Sent: ..." block). */
function stripQuotedPlainText(text: string): string {
  if (!text || !text.trim()) return text;
  const lines = text.split(/\r?\n/);
  let cutIndex = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Outlook-style quoted header block
    if (/^(From|Sent|To|Subject|Date)\s*:/i.test(trimmed) && trimmed.length < 200) {
      cutIndex = i;
      break;
    }
    // "On ... wrote:" or "____" / "-----" separator before quote
    if (/^On\s+.+wrote\s*:$/i.test(trimmed) || /^_{3,}$/.test(trimmed) || /^-{3,}$/.test(trimmed)) {
      cutIndex = i;
      break;
    }
    // Line of only ">" (quoted line)
    if (/^>\s*$/.test(trimmed) && i > 0) {
      cutIndex = i;
      break;
    }
  }
  return lines.slice(0, cutIndex).join("\n").trim();
}

/** Strip quoted content from HTML body (Outlook reply divs, blockquotes, content after <hr>). */
function stripQuotedHtml(html: string): string {
  if (!html || !html.trim()) return html;
  let h = html;

  // Outlook reply/forward wrapper (OWA, desktop)
  const outlookRe = /id\s*=\s*["']?divRplyFwdMsg["']?/i;
  const om = outlookRe.exec(h);
  if (om) {
    h = h.slice(0, om.index);
  }

  // Gmail quote block
  const gmailQuote = h.indexOf('class="gmail_quote"');
  if (gmailQuote !== -1) h = h.slice(0, gmailQuote);

  // Blockquote (common in many clients)
  const blockquoteIdx = h.indexOf("<blockquote");
  if (blockquoteIdx !== -1) h = h.slice(0, blockquoteIdx);

  // Horizontal rule then look for "From:" / "Sent:" within next chunk (Outlook inline quote)
  const hrIdx = h.indexOf("<hr");
  if (hrIdx !== -1) {
    const afterHr = h.slice(hrIdx, hrIdx + 8000);
    const fromMatch = /(From|Sent|To|Subject|Date)\s*:/i.exec(afterHr);
    if (fromMatch) {
      h = h.slice(0, hrIdx);
    }
  }

  // Fallback: find "From:" or "Sent:" in HTML text (e.g. in a div)
  const fromSentRe = /<[^>]*>[\s\S]*?(From|Sent|To|Subject)\s*:\s*[^<\n]+/i;
  const match = h.match(fromSentRe);
  if (match) {
    const idx = h.indexOf(match[0]);
    const beforeTag = h.lastIndexOf("<", idx);
    if (beforeTag !== -1) {
      const tagStart = h.slice(beforeTag).match(/^<(\w+)/);
      if (tagStart) h = h.slice(0, beforeTag);
    }
  }

  return h.trim();
}

/**
 * Return body with quoted content removed when this is a reply (so thread shows only new content).
 * For the first message (original), returns body unchanged.
 */
export function stripQuotedContentForThread(
  body: string,
  contentType: string | null | undefined,
  isReply: boolean
): string {
  if (!body?.trim()) return body ?? "";
  if (!isReply) return body;

  const ct = (contentType || "").toLowerCase();
  if (ct.includes("html")) return stripQuotedHtml(body);
  return stripQuotedPlainText(body);
}
