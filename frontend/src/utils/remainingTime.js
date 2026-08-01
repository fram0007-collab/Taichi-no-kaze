export function formatRemainingTimeLabel(value, now = new Date()) {
  if (!value) return null;

  const targetDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(targetDate.getTime())) return null;

  const diffMs = targetDate.getTime() - now.getTime();
  const totalMinutes = Math.round(diffMs / 60000);

  if (totalMinutes <= 0) return null;

  if (totalMinutes < 60) {
    return `about ${Math.max(1, totalMinutes)} min remaining`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `about ${hours}h remaining`;
  }

  return `about ${hours}h ${minutes}m remaining`;
}
