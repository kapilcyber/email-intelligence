/** Dispatched when bulk classification finishes and a grouped AI recap is ready (see topbar). */
export const CLASSIFY_BATCH_SUMMARY_EVENT = "email-intelligence:classify-batch-summary";

export type ClassifyBatchSummaryDetail = {
  summary: string;
  count: number;
};
