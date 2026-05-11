export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Configurações</h1>
      <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">VAPID Keys (Push Notifications)</h2>
          <p className="text-xs text-gray-400 mt-1">Configurar em .env.local: NEXT_PUBLIC_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Feature Flags</h2>
          <pre className="mt-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
{JSON.stringify({
  instagram_dm: false,
  media_support: false,
  realtime_chat: false,
  push_notifications: true,
}, null, 2)}
          </pre>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Admins</h2>
          <p className="text-xs text-gray-400 mt-1">Gerenciamento de admins — disponível pós-MVP. Use o Supabase Dashboard para adicionar super_admins via user_metadata.</p>
        </div>
      </div>
    </div>
  )
}
