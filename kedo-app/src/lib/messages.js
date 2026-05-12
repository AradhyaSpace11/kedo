export function apiMessage(payload, fallback = 'Something went wrong. Please try again.') {
  const source = payload?.response?.data || payload;
  if (!source) return fallback;
  if (typeof source === 'string') return source;

  const base =
    source.message ||
    source.detail ||
    (typeof source.error === 'string' ? source.error : '') ||
    source.error?.message ||
    source.error?.detail ||
    source.message;

  const invalidItems = Array.isArray(source.invalid_items)
    ? source.invalid_items
    : Array.isArray(source.error?.invalid_items)
      ? source.error.invalid_items
      : [];

  const invalidText = invalidItems.length ? `\n\nNot accepted: ${invalidItems.join(', ')}` : '';
  return `${base || source.message || payload?.message || fallback}${invalidText}`;
}
