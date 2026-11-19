// @vitest-environment node
import { expect, it } from "vitest";
import { iosVersion, pushDeviceState, type PushEnvironment } from "../../src/lib/pushDevice";

const chrome: PushEnvironment = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36",
  standalone: false, hasServiceWorker: true, hasPushManager: true, hasNotification: true,
  permission: "default", subscribed: false, vapidConfigured: true, demo: false,
};
const iphone = (version: string, standalone: boolean): PushEnvironment => ({
  ...chrome, standalone, userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS ${version} like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1`,
});

it("names each 'This phone' state from the device's real capabilities", () => {
  expect(pushDeviceState({ ...chrome, demo: true })).toBe("demo");
  expect(pushDeviceState(chrome)).toBe("not_asked");
  expect(pushDeviceState({ ...chrome, permission: "granted", subscribed: true })).toBe("on");
  expect(pushDeviceState({ ...chrome, permission: "denied" })).toBe("blocked");
  expect(pushDeviceState({ ...chrome, hasPushManager: false })).toBe("unsupported");
  expect(pushDeviceState({ ...chrome, vapidConfigured: false })).toBe("not_configured");
});

it("requires the Home Screen app on iOS 16.4+ and an update below it", () => {
  expect(pushDeviceState(iphone("17_2", false))).toBe("ios_tab");
  expect(pushDeviceState(iphone("17_2", true))).toBe("not_asked");
  expect(pushDeviceState(iphone("16_3", true))).toBe("ios_old");
  expect(pushDeviceState(iphone("16_4", true))).toBe("not_asked");
  expect(iosVersion(chrome.userAgent)).toBeNull();
  expect(iosVersion("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.1 Safari/605.1.15", true)).toBeCloseTo(17.01);
});
