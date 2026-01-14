import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Terminal,
  FolderTree,
  GitBranch,
  Database,
  Settings,
  Wifi,
  WifiOff
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  connected: boolean;
  systemStatus: 'loading' | 'healthy' | 'error';
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/terminal', icon: Terminal, label: 'Terminal' },
  { to: '/files', icon: FolderTree, label: 'Files' },
  { to: '/git', icon: GitBranch, label: 'Git' },
  { to: '/qdrant', icon: Database, label: 'Qdrant' }
];

export default function Layout({ children, connected, systemStatus }: LayoutProps) {
  return (
    <div className="flex h-screen bg-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800/50 border-r border-slate-700/50 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-purple-600 flex items-center justify-center">
              <span className="text-xl font-bold text-white">FZ</span>
            </div>
            <div>
              <h1 className="font-bold text-white">FZDash</h1>
              <p className="text-xs text-slate-400">Claude Code Dashboard</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'nav-link-active' : ''}`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Status */}
        <div className="p-4 border-t border-slate-700/50">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {connected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-400" />
                  <span className="text-red-400">Disconnected</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`status-dot ${
                  systemStatus === 'healthy'
                    ? 'status-online'
                    : systemStatus === 'error'
                    ? 'status-error'
                    : 'status-warning'
                }`}
              />
              <span className="text-slate-400 capitalize">{systemStatus}</span>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="p-3 border-t border-slate-700/50">
          <button className="nav-link w-full">
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
