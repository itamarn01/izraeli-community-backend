// Escape user-controlled values before embedding them in HTML email templates.
// Prevents HTML/script injection (e.g. an applicant message or business name that
// contains markup from breaking out of the template or injecting content).
function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };
