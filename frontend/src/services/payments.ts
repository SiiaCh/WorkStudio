export function checkoutKey(storage: Pick<Storage,"getItem"|"setItem">, bookingId: string, failedAttemptId?: string) {
  const key = "ws-liqpay-key-" + bookingId;
  const failedKey = key + "-failed-attempt";
  let value = storage.getItem(key);
  if (!value || failedAttemptId && storage.getItem(failedKey) !== failedAttemptId) {
    value = crypto.randomUUID(); storage.setItem(key,value);
    if(failedAttemptId) storage.setItem(failedKey,failedAttemptId);
  }
  return value;
}
