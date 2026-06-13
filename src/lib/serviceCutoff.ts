// Atendimento module went live on 2026-05-30 (see /inbox phase 1).
// KPIs for the Atendimento dashboard must ignore events before this date,
// since there was no operational screen tracking them yet.
export const SERVICE_MODULE_START = new Date('2026-05-30T00:00:00-03:00');
export const SERVICE_MODULE_START_ISO = SERVICE_MODULE_START.toISOString();
export const SERVICE_MODULE_START_MS = SERVICE_MODULE_START.getTime();
