import { useState, useCallback, useEffect } from 'react';
import { useSocket } from './useSocket';
import type {
  ClaudeState,
  ClaudeExecuteRequest,
  ClaudeExecuteResponse,
  ExecutionTask,
  ExecutionPlan,
  RalphLoopState
} from '@shared/types';

interface UseClaudeCodeReturn {
  // State
  status: ClaudeState;
  tasks: ExecutionTask[];
  plans: ExecutionPlan[];
  ralphLoop: RalphLoopState | null;
  loading: boolean;
  error: string | null;

  // Actions
  execute: (request: ClaudeExecuteRequest) => Promise<ClaudeExecuteResponse>;
  executeLoop: (prompt: string, options?: { maxIterations?: number; approvalRequired?: boolean }) => Promise<void>;
  cancelExecution: (taskId: string) => Promise<void>;
  createPlan: (plan: Partial<ExecutionPlan>) => Promise<ExecutionPlan>;
  approvePlan: (planId: string) => Promise<void>;
  executePlan: (planId: string) => Promise<void>;
  stopRalphLoop: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshHistory: () => Promise<void>;
}

const API_BASE = '/api/claude';

async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'API call failed');
  }
  
  return data.data;
}

export function useClaudeCode(): UseClaudeCodeReturn {
  const [status, setStatus] = useState<ClaudeState>({ status: 'idle' });
  const [tasks, setTasks] = useState<ExecutionTask[]>([]);
  const [plans, setPlans] = useState<ExecutionPlan[]>([]);
  const [ralphLoop, setRalphLoop] = useState<RalphLoopState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { onClaudeStatus, onExecutionUpdate } = useSocket();

  // Listen for real-time updates
  useEffect(() => {
    const unsubStatus = onClaudeStatus((data) => {
      setStatus(prev => ({ ...prev, ...data }));
    });

    const unsubExecution = onExecutionUpdate((data) => {
      setTasks(prev => {
        const index = prev.findIndex(t => t.id === data.taskId);
        if (index === -1) {
          return [...prev, { 
            id: data.taskId, 
            command: '', 
            status: data.status,
            output: data.output,
            progress: data.progress
          }];
        }
        const updated = [...prev];
        updated[index] = { ...updated[index], ...data, status: data.status };
        return updated;
      });
    });

    return () => {
      unsubStatus();
      unsubExecution();
    };
  }, [onClaudeStatus, onExecutionUpdate]);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await apiCall<ClaudeState>('/status');
      setStatus(data);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const data = await apiCall<ExecutionTask[]>('/history');
      setTasks(data);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const execute = useCallback(async (request: ClaudeExecuteRequest): Promise<ClaudeExecuteResponse> => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await apiCall<ClaudeExecuteResponse>('/execute', {
        method: 'POST',
        body: JSON.stringify(request)
      });
      
      await refreshHistory();
      return result;
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [refreshHistory]);

  const executeLoop = useCallback(async (
    prompt: string,
    options: { maxIterations?: number; approvalRequired?: boolean } = {}
  ) => {
    setLoading(true);
    setError(null);
    
    try {
      await apiCall('/execute-loop', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          maxIterations: options.maxIterations || 10,
          approvalRequired: options.approvalRequired ?? true
        })
      });
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const cancelExecution = useCallback(async (taskId: string) => {
    try {
      await apiCall(`/cancel/${taskId}`, { method: 'POST' });
      await refreshHistory();
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, [refreshHistory]);

  const createPlan = useCallback(async (plan: Partial<ExecutionPlan>): Promise<ExecutionPlan> => {
    try {
      const result = await apiCall<ExecutionPlan>('/plan', {
        method: 'POST',
        body: JSON.stringify(plan)
      });
      setPlans(prev => [...prev, result]);
      return result;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);

  const approvePlan = useCallback(async (planId: string) => {
    try {
      await apiCall(`/plan/${planId}/approve`, { method: 'POST' });
      setPlans(prev => prev.map(p => 
        p.id === planId ? { ...p, approved: true, approvedAt: new Date() } : p
      ));
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);

  const executePlan = useCallback(async (planId: string) => {
    try {
      await apiCall(`/plan/${planId}/execute`, { method: 'POST' });
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);

  const stopRalphLoop = useCallback(async () => {
    try {
      await apiCall('/ralph/stop', { method: 'POST' });
      setRalphLoop(null);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshStatus();
    refreshHistory();
    
    // Load ralph loop status
    apiCall<RalphLoopState>('/ralph/status')
      .then(setRalphLoop)
      .catch(() => {});
    
    // Load plans
    apiCall<ExecutionPlan[]>('/plans')
      .then(setPlans)
      .catch(() => {});
  }, [refreshStatus, refreshHistory]);

  return {
    status,
    tasks,
    plans,
    ralphLoop,
    loading,
    error,
    execute,
    executeLoop,
    cancelExecution,
    createPlan,
    approvePlan,
    executePlan,
    stopRalphLoop,
    refreshStatus,
    refreshHistory
  };
}
