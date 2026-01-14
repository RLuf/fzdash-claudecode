import { useEffect, useState } from 'react';
import { useClaudeCode } from '@hooks/useClaudeCode';
import { useSocket } from '@hooks/useSocket';
import {
  Activity,
  Cpu,
  HardDrive,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  Terminal,
  GitBranch,
  Database
} from 'lucide-react';
import ExecutionPlan from '@components/ExecutionPlan';
import RealTimeOutput from '@components/RealTimeOutput';

interface SystemHealth {
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
}

export default function Dashboard() {
  const { status, tasks, plans, ralphLoop, loading } = useClaudeCode();
  const { connected } = useSocket();
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        if (data.success) {
          setSystemHealth(data.data);
        }
      } catch {
        // Ignore errors
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatBytes = (bytes: number): string => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const recentTasks = tasks.slice(-5).reverse();

  const handleExecute = async () => {
    if (!prompt.trim()) return;
    // TODO: Execute via hook
    setPrompt('');
  };

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400">Monitor and control Claude Code executions</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`badge ${
              status.status === 'idle'
                ? 'badge-info'
                : status.status === 'executing'
                ? 'badge-warning'
                : status.status === 'error'
                ? 'badge-error'
                : 'badge-success'
            }`}
          >
            {status.status}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label="Status"
          value={connected ? 'Online' : 'Offline'}
          status={connected ? 'success' : 'error'}
        />
        <StatCard
          icon={Clock}
          label="Uptime"
          value={systemHealth ? formatUptime(systemHealth.uptime) : '-'}
        />
        <StatCard
          icon={Cpu}
          label="Memory"
          value={systemHealth ? formatBytes(systemHealth.memory.heapUsed) : '-'}
        />
        <StatCard
          icon={HardDrive}
          label="Tasks"
          value={tasks.length.toString()}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Quick Execute */}
        <div className="col-span-2 card p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Play className="w-5 h-5 text-sky-400" />
            Quick Execute
          </h2>
          <div className="space-y-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt for Claude Code..."
              className="input min-h-[120px] resize-none"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" />
                  <span>Use Ralph Loop</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" defaultChecked />
                  <span>Require Approval</span>
                </label>
              </div>
              <button
                onClick={handleExecute}
                disabled={!prompt.trim() || loading}
                className="btn-primary"
              >
                <Play className="w-4 h-4" />
                Execute
              </button>
            </div>
          </div>
        </div>

        {/* Ralph Loop Status */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-400" />
            Ralph Loop
          </h2>
          {ralphLoop?.active ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Iteration</span>
                <span className="text-white">
                  {ralphLoop.iteration} / {ralphLoop.maxIterations}
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${(ralphLoop.iteration / ralphLoop.maxIterations) * 100}%`
                  }}
                />
              </div>
              {ralphLoop.errors.length > 0 && (
                <div className="text-red-400 text-sm">
                  {ralphLoop.errors.length} error(s)
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-400">No active loop</p>
          )}
        </div>
      </div>

      {/* Recent Tasks & Pending Plans */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recent Tasks */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-green-400" />
            Recent Tasks
          </h2>
          {recentTasks.length > 0 ? (
            <div className="space-y-3">
              {recentTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {task.status === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : task.status === 'error' ? (
                      <XCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-400" />
                    )}
                    <span className="text-slate-200 truncate max-w-[200px]">
                      {task.command || task.prompt || task.id}
                    </span>
                  </div>
                  <span className={`badge badge-${
                    task.status === 'success' ? 'success' :
                    task.status === 'error' ? 'error' : 'warning'
                  }`}>
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400">No recent tasks</p>
          )}
        </div>

        {/* Pending Plans */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-orange-400" />
            Execution Plans
          </h2>
          {plans.filter(p => !p.approved).length > 0 ? (
            <div className="space-y-3">
              {plans
                .filter(p => !p.approved)
                .slice(0, 3)
                .map((plan) => (
                  <ExecutionPlan key={plan.id} plan={plan} compact />
                ))}
            </div>
          ) : (
            <p className="text-slate-400">No pending plans</p>
          )}
        </div>
      </div>

      {/* Real-time Output */}
      {status.status === 'executing' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            Live Output
          </h2>
          <RealTimeOutput />
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  status
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  status?: 'success' | 'error' | 'warning';
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div
          className={`p-2 rounded-lg ${
            status === 'success'
              ? 'bg-green-500/20 text-green-400'
              : status === 'error'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-slate-700/50 text-slate-400'
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="text-lg font-semibold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}
