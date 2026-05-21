import { NavLink } from 'react-router-dom'

const navItems = [
  { path: '/dashboard',   icon: '📊', label: 'Dashboard' },
  { path: '/lifestyle',   icon: '🏃', label: 'Lifestyle Tracking' },
  { path: '/medical',     icon: '🩺', label: 'Medical Monitoring' },
  { path: '/predictions', icon: '🧠', label: 'AI Predictions' },
  { path: '/doctors',     icon: '👨‍⚕️', label: 'Find Doctors', badge: 'NEW' },
  { path: '/chatbot',     icon: '💬', label: 'AI Chatbot' },
]

export default function Sidebar() {
  return (
    <aside className="w-[260px] min-w-[260px] bg-[#111827] border-r border-white/5 flex flex-col py-6">
      <div className="px-5 pb-6 border-b border-white/5 mb-5">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#00d4ff] to-[#a78bfa] flex items-center justify-center text-xl mb-2">
          🫀
        </div>
        <div className="font-bold text-lg text-[#00d4ff]">HealthAI</div>
        <div className="text-[10px] text-white/30 mt-0.5">v2.0 · Smart Health Platform</div>
      </div>

      <div className="px-3 flex-1">
        <p className="text-[10px] font-semibold text-white/25 uppercase px-2 mb-2 tracking-widest">Main</p>
        {navItems.map(item => (
          <NavLink key={item.path} to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-1 text-sm font-medium transition-all
              ${isActive
                ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20'
                : 'text-white/50 hover:bg-white/5 hover:text-white'}`
            }>
            <span className="w-5 text-center">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span className="bg-[#ff8c42] text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}

        <p className="text-[10px] font-semibold text-white/25 uppercase px-2 mb-2 mt-4 tracking-widest">Account</p>
        <NavLink to="/alerts"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-1 text-sm font-medium transition-all
            ${isActive
              ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20'
              : 'text-white/50 hover:bg-white/5 hover:text-white'}`
          }>
          <span className="w-5 text-center">🔔</span>
          <span className="flex-1">Alerts</span>
          <span className="w-2 h-2 bg-[#ff8c42] rounded-full animate-pulse"/>
        </NavLink>

        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white cursor-pointer transition-all">
          <span className="w-5 text-center">⚙️</span>
          <span>Settings</span>
        </div>
      </div>

      <div className="px-5 pt-4 border-t border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00d4ff] to-[#a78bfa] flex items-center justify-center text-xs font-bold">
            DG
          </div>
          <div>
            <div className="text-sm font-semibold">Dhruv Gaur</div>
            <div className="text-[11px] text-[#00d4ff]">Pro Member</div>
          </div>
        </div>
      </div>
    </aside>
  )
}