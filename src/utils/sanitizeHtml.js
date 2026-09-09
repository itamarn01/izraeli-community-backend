// Cleans rich text produced by the admin editor before it is emailed.
//
// The author is an authenticated admin, so this is not a defence against a
// hostile user — it is a guard against pasted markup (a copied newsletter, a
// Word document) dragging scripts, remote styles or event handlers into a mail
// that then lands in hundreds of inboxes and gets the sender flagged as spam.

const BLOCKED_ELEMENTS = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'base', 'title'];

// Attributes carrying executable or fetchable content.
const EVENT_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const SRCDOC_ATTR = /\s+srcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
// javascript:/vbscript:/data: URLs in href or src.
const DANGEROUS_URL = /\s+(href|src)\s*=\s*("\s*(?:javascript|vbscript|data):[^"]*"|'\s*(?:javascript|vbscript|data):[^']*'|(?:javascript|vbscript|data):[^\s>]+)/gi;

function stripElement(html, tag) {
  // Paired form, including anything nested inside.
  const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
  // Unclosed / self-closing form.
  const lone = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  return html.replace(paired, '').replace(lone, '');
}

/**
 * @param {string} html raw HTML from the rich text editor
 * @returns {string} HTML safe to place inside an email body
 */
function sanitizeEmailHtml(html) {
  let out = String(html || '');
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of BLOCKED_ELEMENTS) out = stripElement(out, tag);
  out = out.replace(EVENT_ATTR, '');
  out = out.replace(SRCDOC_ATTR, '');
  out = out.replace(DANGEROUS_URL, '');
  return out.trim();
}

// Plain-text version, used for previews, list summaries and length checks.
function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { sanitizeEmailHtml, htmlToText };
