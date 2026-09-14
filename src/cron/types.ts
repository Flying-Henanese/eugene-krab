// --- Schedule ---

export type CronScheduleAt = { kind: 'at'; at: string };
export type CronScheduleEvery = { kind: 'every'; everyMs: number; anchorMs?: number };
export type CronScheduleCron = { kind: 'cron'; expr: string; tz?: string };

export type CronSchedule = CronScheduleAt | CronScheduleEvery | CronScheduleCron;

// --- Active Hours ---

export type ActiveHours = {
  start: string;   // "HH:MM" (e.g., "09:30")
  end: string;     // "HH:MM" (e.g., "16:00")
  timezone?: string; // IANA timezone (default: America/New_York)
  daysOfWeek?: number[]; // 0=Sun..6=Sat (default: [1,2,3,4,5])
};

// --- Fulfillment ---

export type FulfillmentMode = 'keep' | 'once' | 'ask';

// --- Ownership, delivery, and execution ---

export type FeishuP2POwner = {
  channel: 'feishu';
  accountId: string;
  chatId: string;
};

export type WhatsAppOwner = {
  channel: 'whatsapp';
  accountId: string;
  to: string;
};

export type CronOwner = FeishuP2POwner | WhatsAppOwner;

export type CronDeliveryTarget =
  | { channel: 'feishu'; accountId: string; chatId: string }
  | { channel: 'whatsapp'; accountId: string; to: string };

/** Trusted gateway context used when a caller creates or manages a job. */
export type CronCallerContext =
  | (FeishuP2POwner & { agentId: string; senderOpenId?: string })
  | (WhatsAppOwner & { agentId: string });

export type AShareSourcePolicy = 'tushare_only' | 'tushare_plus_news';
export type CronNotificationMode = 'always' | 'on_actionable_result';

export type CronExecutionPolicy = {
  sessionMode: 'isolated';
  sourcePolicy?: AShareSourcePolicy;
  notificationMode: CronNotificationMode;
};

export type CronLegacyKind = 'heartbeat' | 'targetless';

// --- Payload ---

export type CronPayload = {
  message: string;
  model?: string;
  modelProvider?: string;
};

// --- Job State ---

export type CronJobState = {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastRunStatus?: 'ok' | 'error' | 'suppressed';
  lastError?: string;
  lastSuppressionReason?: string;
  lastErrorNoticeAtMs?: number;
  lastDurationMs?: number;
  consecutiveErrors: number;
  scheduleErrorCount: number;
};

// --- Job ---

export type CronJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  payload: CronPayload;
  fulfillment: FulfillmentMode;
  activeHours?: ActiveHours;
  /** Absent only for targetless legacy jobs loaded from version 1. */
  owner?: CronOwner;
  /** Absent only for targetless legacy jobs loaded from version 1. */
  deliveryTarget?: CronDeliveryTarget;
  /** Absent only for targetless legacy jobs loaded from version 1. */
  execution?: CronExecutionPolicy;
  /** Explicit compatibility marker for the global heartbeat job. */
  legacy?: { kind: CronLegacyKind };
  state: CronJobState;
};

// --- Store ---

export type CronStore = {
  version: 2;
  jobs: CronJob[];
};
