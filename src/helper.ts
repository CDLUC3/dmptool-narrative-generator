export function safeNumber(value: string, fallback: number): number {
  if (typeof value === "string" && value?.trim().length === 0) {
    return fallback;
  }
  const num = Number(value);
  return isNaN(num) ? fallback : num;
}

export function safeBoolean(value: string, fallback: boolean): boolean | undefined {
  if (["1", "on", "true", "yes"].includes(value?.toLowerCase())) {
    return true;
  } else if (["0", "off", "false", "no"].includes(value?.toLowerCase())) {
    return false;
  } else {
    return fallback;
  }
}

export function pointsToFontSize(points: number): string {
  switch (points) {
    case 8:
      return '11px';
    case 9:
      return '12px';
    case 10:
      return '13px';
    case 12:
      return '16px';
    case 13:
      return '17px';
    case 14:
      return '19px';

    default:
      return '15px';
  }
}

// ---------------- Format ISO dates ----------------
export function formatDate(date: string, includeDay = true): string {
  let dateOut: string;

  // Note: A date without a time will always be assumed to be at 00:00:00 UTC
  try {
    if (includeDay) {
      dateOut = new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } else {
      dateOut = new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      })
    }
    return dateOut === 'Invalid Date' ? 'None specified' : dateOut;
  } catch (err) {
    return 'None specified';
  }
}
