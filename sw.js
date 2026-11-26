self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch (_) { payload = {body: e.data?.text() || ''}; }
  const title = payload.title || 'Territory Under Attack';
  const body = payload.body || 'One of your provinces is being attacked.';
  const url = payload.url || './';
  e.waitUntil(self.registration.showNotification(title, {
    body,
    tag: payload.tag || 'eot-attack',
    renotify: true,
    data: {url}
  }));
});

self.addEventListener('message', e => {
  const msg = e.data;
  if (!msg || msg.type !== 'ATTACK_ALERT') return;
  e.waitUntil(self.registration.showNotification(msg.title || 'Territory Under Attack', {
    body: msg.body || 'One of your provinces is being attacked.',
    tag: msg.tag || 'eot-attack',
    renotify: true,
    data: {url: msg.url || './'}
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || './';
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (const client of list) {
      if ('focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  }));
});
