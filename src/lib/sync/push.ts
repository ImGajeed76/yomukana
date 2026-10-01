// Push notifications on this device: turning them on and off, the reader's
// settings for them, and nudging friends. The server sends; this only
// subscribes the browser and passes the subscription on. See
// functions/api/notifications.ts and src/service-worker for the rest.

import { getLocale } from "$lib/paraglide/runtime";
import { callApi } from "./api";

export interface NotificationSettings {
  readonly isReminderOn: boolean;
  /** Minutes after midnight, local time. */
  readonly reminderMinute: number;
  readonly canBeNudged: boolean;
  readonly showsNudges: boolean;
}

/** Someone the reader follows who could do with a nudge right now. */
export interface Nudgeable {
  readonly username: string;
  readonly displayName: string | null;
  readonly cardColor: string;
  readonly streak: number;
}

/** Whether this browser can take push messages at all. */
export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** This device's subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** A VAPID key as the browser wants it: the bytes of its URL-safe base64. */
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = (key + "=".repeat((4 - (key.length % 4)) % 4))
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * How turning on went: on; permission refused; the browser's own push service
 * refused (Brave has it off by default); or the server could not be reached.
 */
export type TurnOnOutcome = "on" | "denied" | "service" | "failed";

/**
 * Asks the browser for permission, subscribes this device, and tells the
 * server where to reach it, in which time zone and language.
 */
export async function turnOnPush(): Promise<TurnOnOutcome> {
  if (!isPushSupported()) return "failed";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "failed";

  const keyResponse = await callApi("/push/key");
  if (keyResponse?.ok !== true) return "failed";
  const { publicKey } = (await keyResponse.json()) as { publicKey: string };

  const registration = await navigator.serviceWorker.ready;
  // The browser's push service can refuse, be switched off, or be
  // unreachable. Nothing on this side can prevent any of them, so it is
  // caught, logged for whoever is looking, and told to the reader.
  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    });
  } catch (error) {
    console.warn("push subscription refused by the browser", error);
    return "service";
  }

  const saved = await callApi("/push/subscription", {
    method: "PUT",
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: getLocale(),
    }),
  });
  return saved?.ok === true ? "on" : "failed";
}

/** Stops pushes to this device, here and on the server. */
export async function turnOffPush(): Promise<boolean> {
  const subscription = await currentSubscription();
  if (subscription === null) return true;
  const removed = await callApi("/push/subscription", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
  return removed?.ok === true;
}

export async function loadNotificationSettings(): Promise<NotificationSettings | null> {
  const response = await callApi("/notifications");
  if (response?.ok !== true) return null;
  return (await response.json()) as NotificationSettings;
}

/** Changes some of the settings. The server's answer, or null when it could not be saved. */
export async function saveNotificationSettings(
  change: Partial<NotificationSettings>,
): Promise<NotificationSettings | null> {
  const response = await callApi("/notifications", {
    method: "PATCH",
    body: JSON.stringify(change),
  });
  if (response?.ok !== true) return null;
  return (await response.json()) as NotificationSettings;
}

/** Friends to nudge now, or none when the server could not be reached. */
export async function loadNudgeable(): Promise<Nudgeable[]> {
  const response = await callApi("/nudgeable");
  if (response?.ok !== true) return [];
  return (await response.json()) as Nudgeable[];
}

/** Nudges one of them. Whether it went. */
export async function nudge(username: string): Promise<boolean> {
  const response = await callApi("/nudge", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
  return response?.ok === true;
}
