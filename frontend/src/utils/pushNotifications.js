const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }

  return output;
};

export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (error) {
    console.warn('[Push] Service worker registration failed:', error);
    return null;
  }
}

export async function getExistingPushSubscription() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }

  const registration = await registerServiceWorker();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(publicKey, apiUrl, preferences) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser.');
  }
  if (!publicKey) {
    throw new Error('A VAPID public key is not configured.');
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    throw new Error('Service worker registration failed.');
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    if (apiUrl) {
      await sendSubscriptionToBackend(existingSubscription, preferences, apiUrl);
    }
    return existingSubscription;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  if (apiUrl) {
    await sendSubscriptionToBackend(subscription, preferences, apiUrl);
  }

  return subscription;
}

export async function unsubscribeFromPush(apiUrl) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  const registration = await registerServiceWorker();
  if (!registration) return false;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;

  const unsubscribed = await subscription.unsubscribe();
  if (apiUrl && unsubscribed) {
    try {
      await fetch(`${apiUrl}/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    } catch (error) {
      console.warn('[Push] Could not remove backend subscription:', error);
    }
  }

  return unsubscribed;
}

export async function sendSubscriptionToBackend(subscription, preferences, apiUrl) {
  if (!subscription || !apiUrl) {
    return null;
  }

  // PushSubscription keys are ArrayBuffers — must be converted to base64url strings
  // JSON.stringify(subscription) serializes keys as empty objects otherwise
  const p256dh = subscription.getKey ? btoa(
    String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))
  ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

  const auth = subscription.getKey ? btoa(
    String.fromCharCode(...new Uint8Array(subscription.getKey('auth')))
  ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

  const payload = {
    subscription: {
      endpoint: subscription.endpoint,
      keys: { p256dh, auth },
    },
    preferences,
  };

  const response = await fetch(`${apiUrl}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Unable to save push subscription.');
  }

  return response.json();
}
