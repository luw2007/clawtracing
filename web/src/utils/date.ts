/**
 * 格式化日期时间
 * 格式: YYYY/MM/DD HH:mm:ss.SSS
 */
export function formatDateTime(timestamp: string | number | Date): string {
  const date = new Date(timestamp);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

/**
 * 仅格式化时间
 * 格式: HH:mm:ss.SSS
 */
export function formatTimeOnly(timestamp: string | number | Date): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}
