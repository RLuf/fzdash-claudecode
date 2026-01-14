import { useState } from 'react';
import { useClaudeCode } from '@hooks/useClaudeCode';
import type { ExecutionPlan as ExecutionPlanType } from '@shared/types';
import {
  CheckCircle,
  XCircle,
  Clock,
  Play,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Check
} from 'lucide-react';

interface ExecutionPlanProps {
  plan: ExecutionPlanType;
  compact?: boolean;
}

export default function ExecutionPlan({ plan, compact = false }: ExecutionPlanProps) {
  const [expanded, setExpanded] = useState(!compact);
  const { approvePlan, executePlan, loading } = useClaudeCode();

  const statusIcon = {
    pending: Clock,
    running: Play,
    success: CheckCircle,
    error: XCircle,
    cancelled: XCircle,
    queued: Clock
  };

  const statusColor = {
    pending: 'text-slate-400',
    running: 'text-yellow-400',
    success: 'text-green-400',
    error: 'text-red-400',
    cancelled: 'text-slate-500',
    queued: 'text-blue-400'
  };

  const StatusIcon = statusIcon[plan.status];

  const handleApprove = async () => {
    try {
      await approvePlan(plan.id);
    } catch {
      // Error handled in hook
    }
  };

  const handleExecute = async () => {
    try {
      await executePlan(plan.id);
    } catch {
      // Error handled in hook
    }
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
        <div className="flex items-center gap-3">
          <StatusIcon className={`w-5 h-5 ${statusColor[plan.status]}`} />
          <div>
            <p className="text-slate-200 font-medium">{plan.name}</p>
            <p className="text-xs text-slate-400">{plan.tasks.length} tasks</p>
          </div>
        </div>
        {plan.requiresApproval && !plan.approved && (
          <button onClick={handleApprove} disabled={loading} className="btn-sm btn-primary">
            <Check className="w-3 h-3" />
            Approve
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 bg-slate-800/30 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          )}
          <StatusIcon className={`w-5 h-5 ${statusColor[plan.status]}`} />
          <div>
            <h3 className="text-white font-semibold">{plan.name}</h3>
            {plan.description && (
              <p className="text-sm text-slate-400">{plan.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">
            {plan.tasks.length} tasks
          </span>
          {plan.requiresApproval && (
            <span className={`badge ${plan.approved ? 'badge-success' : 'badge-warning'}`}>
              {plan.approved ? 'Approved' : 'Pending Approval'}
            </span>
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 border-t border-slate-700/50">
          {/* Warning if requires approval */}
          {plan.requiresApproval && !plan.approved && (
            <div className="flex items-center gap-3 p-3 mb-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <p className="text-sm text-yellow-200">
                This plan requires your approval before execution
              </p>
            </div>
          )}

          {/* Tasks List */}
          <div className="space-y-2 mb-4">
            {plan.tasks.map((task, index) => {
              const TaskIcon = statusIcon[task.status];
              return (
                <div
                  key={task.id}
                  className="flex items-start gap-3 p-3 bg-slate-800/30 rounded-lg"
                >
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-xs text-slate-300">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <TaskIcon className={`w-4 h-4 ${statusColor[task.status]}`} />
                      <span className="text-slate-200 font-medium">{task.name}</span>
                    </div>
                    {task.description && (
                      <p className="text-sm text-slate-400 mt-1">{task.description}</p>
                    )}
                    {task.command && (
                      <code className="block mt-2 text-xs text-slate-500 bg-slate-900 p-2 rounded">
                        {task.command}
                      </code>
                    )}
                    {task.output && (
                      <pre className="mt-2 text-xs text-green-400 bg-slate-900 p-2 rounded overflow-x-auto">
                        {task.output}
                      </pre>
                    )}
                    {task.error && (
                      <pre className="mt-2 text-xs text-red-400 bg-red-900/20 p-2 rounded overflow-x-auto">
                        {task.error}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-3 border-t border-slate-700/50">
            {!plan.approved && plan.requiresApproval && (
              <button onClick={handleApprove} disabled={loading} className="btn-primary">
                <Check className="w-4 h-4" />
                Approve Plan
              </button>
            )}
            {(plan.approved || !plan.requiresApproval) && plan.status === 'pending' && (
              <button onClick={handleExecute} disabled={loading} className="btn-primary">
                <Play className="w-4 h-4" />
                Execute Plan
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
