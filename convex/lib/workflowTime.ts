export function workflowTime(testTime?: number) {
  return process.env.NODE_ENV === "test" && testTime !== undefined ? testTime : Date.now();
}
