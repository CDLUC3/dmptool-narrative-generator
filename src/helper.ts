import { JwtPayload } from "jsonwebtoken";

/**
 * The JSON web token structure
 */
export interface JWTAccessToken extends JwtPayload {
  id: number,
  email: string,
  givenName: string,
  surName: string,
  role: string,
  affiliationId: string,
  languageId: string,
  jti: string,
  expiresIn: number,
}

/**
 * Helper function to safely convert a string to a number
 *
 * @param value The string to convert
 * @param fallback The fallback value to use if the string cannot be converted to a number
 * @returns The converted number or the fallback value
 */
export function safeNumber(value: string, fallback: number): number {
  if (typeof value === "string" && value?.trim().length === 0) {
    return fallback;
  }
  const num = Number(value);
  return isNaN(num) ? fallback : num;
}

/**
 * Helper function to safely convert a string to a boolean
 *
 * @param value The string to convert
 * @param fallback The fallback value to use if the string cannot be converted to a boolean
 * @returns The converted boolean or the fallback value
 */
export function safeBoolean(value: string, fallback: boolean): boolean | undefined {
  if (["1", "on", "true", "yes"].includes(value?.toLowerCase())) {
    return true;
  } else if (["0", "off", "false", "no"].includes(value?.toLowerCase())) {
    return false;
  } else {
    return fallback;
  }
}

/**
 * Helper function to convert a number of points to a font size in pixels
 *
 * @param points The number of points to convert
 * @returns The converted font size in pixels
 */
export function pointsToFontSize(points: number): string {
  if (!points || points <= 0) return "15px";

  // Convert the pt value to px
  return `${Math.round((points / 72) * 96)}px`;
}

/**
 * Helper function to format a date string into a human-readable format
 *
 * @param date The date string to format
 * @param includeDay Whether to include the day of the month in the formatted date
 * @returns The formatted date string or 'None specified' if the date string is invalid
 */
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

/**
 * Helper function to get the font family from the font parameter
 *
 * @param fontParam The font parameter to get the font family from
 * @returns The font family to use for the PDF document
 */
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
