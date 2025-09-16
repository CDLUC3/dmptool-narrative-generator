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
  if (!points || points <= 0) return "15px";

  // Convert the pt value to px
  return `${Math.round((points / 72) * 96)}px`;
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
  } catch {
    return 'None specified';
  }
}

export function getFontFamily(fontParam: string): string {
  // Define available fonts with their CSS declarations
  const availableFonts = {
    'tinos': 'Tinos, serif',
    'roboto': 'Roboto, sans-serif'
  };

  // Will convert to lowercase, trim whitespace, and remove quotes
  const selectedFont = fontParam?.toLowerCase().trim().replace(/['"]/g, '') || 'tinos';

  return availableFonts[selectedFont] || availableFonts['tinos'];
}
