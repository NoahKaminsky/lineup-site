// LineUp push service worker. Plain JS on purpose — this runs in its own
// worker context outside the Next.js app bundle, served as a static file
// straight from /sw.js.

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "LineUp", body: event.data.text() };
  }

  const title = payload.title || "LineUp";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.url || "/" },
    // Macs/Android show these as grouped by tag so a flurry of alerts (e.g.
    // several matching requests at once) doesn't stack into a wall of
    // separate notifications.
    tag: payload.tag || "lineup-notification",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clicking the notification focuses an already-open LineUp tab if there is
// one, instead of always opening a new tab.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
