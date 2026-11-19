/**
 * What this device can do with Web Push (SPEC-v2 §10 "This phone").
 * Pure detection is separated from the browser calls so it can be tested.
 */
export type PushDeviceState =
  | "demo"
  | "unsupported"
  | "ios_tab"
  | "ios_old"
  | "not_configured"
  | "blocked"
  | "not_asked"
  | "on";

export interface PushEnvironment {
  userAgent: string;
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  vapidConfigured: boolean;
  demo: boolean;
}

/** iOS/iPadOS version, or null when not iOS. iPadOS reports a Mac UA; `maxTouchPoints` is checked by the caller. */
export function iosVersion(userAgent: string, touchMac = false): number | null {
  const m = /(?:iPhone|iPad|iPod).*? OS (\d+)[._](\d+)/.exec(userAgent);
  if (m) return Number(m[1]) + Number(m[2]) / 100;
  if (touchMac) {
    const v = /Version\/(\d+)\.(\d+)/.exec(userAgent);
    return v ? Number(v[1]) + Number(v[2]) / 100 : 16.4;
  }
  return null;
}

export function pushDeviceState(env: PushEnvironment, touchMac = false): PushDeviceState {
  if (env.demo) return "demo";
  const ios = iosVersion(env.userAgent, touchMac);
  if (ios !== null && ios < 16.04) return "ios_old";
  if (ios !== null && !env.standalone) return "ios_tab";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "unsupported";
  if (!env.vapidConfigured) return "not_configured";
  if (env.permission === "denied") return "blocked";
  if (env.permission === "granted" && env.subscribed) return "on";
  return "not_asked";
}
