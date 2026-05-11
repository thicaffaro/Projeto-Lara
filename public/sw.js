// /public/sw.js
// Service Worker para notificações push no PWA da Lara.
// Backup principal: notificação via WhatsApp (notifyProfessionalIfAllowed).

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  event.waitUntil(
    self.registration.showNotification(data.title || '🔔 Nova mensagem', {
      body:  data.body  || 'Você recebeu uma mensagem no painel',
      icon:  '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data:  { url: data.url || '/dashboard/conversations' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})

// Cache básico para instalação rápida (add-to-homescreen)
self.addEventListener('install', (event) => {
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})
