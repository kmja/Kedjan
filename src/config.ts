/**
 * Where a missing-word report goes. A `https://` value is treated as a
 * collector endpoint and receives the day and the pair as query parameters;
 * anything else is treated as an email address.
 */
export const REPORT_ADDRESS: string =
  import.meta.env.VITE_REPORT_URL ?? "hej@kedjan.se";
