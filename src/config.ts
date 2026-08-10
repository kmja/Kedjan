/**
 * Where a missing-word report goes: an endpoint that counts votes per pair.
 * The default is the serverless function deployed with the site; point
 * `VITE_REPORT_URL` elsewhere to swap the collector without a code change.
 */
export const REPORT_URL: string = import.meta.env.VITE_REPORT_URL ?? "/api/report";
