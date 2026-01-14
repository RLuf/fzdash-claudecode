/**
 * Claude Code Service
 * Integrates with Claude Code CLI for agentic operations
 */

import { spawn, ChildProcess } from 'child_process';
import { Socket } from 'socket.io';
import { SocketService } from './socket.js';
import { EventEmitter } from 'events';

export interface ClaudeTask {
  id: string;
  prompt: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled';
  iterations: number;
  maxIterations: number;
  output: string[];
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface ExecutionPlan {
  id: string;
  description: string;
  steps: ExecutionStep[];
  approved: boolean;
  createdAt: Date;
}

export interface ExecutionStep {
  id: string;
  description: string;
  command?: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  output?: string;
  dependencies: string[];
}

export class ClaudeCodeService extends EventEmitter {
  private socketService: SocketService;
  private available: boolean = false;
  private currentProcess: ChildProcess | null = null;
  private tasks: Map<string, ClaudeTask> = new Map();
  private plans: Map<string, ExecutionPlan> = new Map();
  private claudePath: string = 'claude';

  constructor(socketService: SocketService) {
    super();
    this.socketService = socketService;
  }

  async initialize(): Promise<void> {
    try {
      // Check if claude CLI is available
      const check = spawn(this.claudePath, ['--version'], { shell: true });
      
      await new Promise<void>((resolve, _reject) => {
        check.on('close', (code) => {
          if (code === 0) {
            this.available = true;
            resolve();
          } else {
            this.available = false;
            resolve(); // Don't fail, just mark as unavailable
          }
        });
        check.on('error', () => {
          this.available = false;
          resolve();
        });
      });
    } catch {
      this.available = false;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  handleSocket(socket: Socket): void {
    socket.on('claude:execute', async (data) => {
      const task = await this.executeTask(data.prompt, data.options);
      socket.emit('claude:task-created', task);
    });

    socket.on('claude:cancel', (taskId: string) => {
      this.cancelTask(taskId);
    });

    socket.on('claude:approve-plan', (planId: string) => {
      this.approvePlan(planId);
    });

    socket.on('claude:reject-plan', (planId: string) => {
      this.rejectPlan(planId);
    });

    socket.on('claude:ralph-loop', async (data) => {
      await this.startRalphLoop(data.prompt, data.options);
    });
  }

  async executeTask(prompt: string, options?: {
    maxIterations?: number;
    completionPromise?: string;
    workingDir?: string;
  }): Promise<ClaudeTask> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const task: ClaudeTask = {
      id: taskId,
      prompt,
      status: 'pending',
      iterations: 0,
      maxIterations: options?.maxIterations || 1,
      output: [],
      startedAt: new Date()
    };

    this.tasks.set(taskId, task);
    this.socketService.emitClaudeStatus({
      status: 'thinking',
      currentTask: taskId
    });

    try {
      task.status = 'running';
      
      const args = ['-p', prompt];
      if (options?.workingDir) {
        args.unshift('--cwd', options.workingDir);
      }

      this.currentProcess = spawn(this.claudePath, args, {
        shell: true,
        cwd: options?.workingDir
      });

      this.currentProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        task.output.push(output);
        this.socketService.emitExecutionUpdate({
          taskId,
          status: 'running',
          output,
          message: 'Executing...'
        });
      });

      this.currentProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        task.output.push(`[stderr] ${output}`);
      });

      await new Promise<void>((resolve, _reject) => {
        this.currentProcess!.on('close', (code) => {
          if (code === 0) {
            task.status = 'success';
            resolve();
          } else {
            task.status = 'error';
            task.error = `Process exited with code ${code}`;
            resolve();
          }
        });

        this.currentProcess!.on('error', (err) => {
          task.status = 'error';
          task.error = err.message;
          resolve();
        });
      });

      task.completedAt = new Date();
      this.currentProcess = null;

    } catch (error) {
      task.status = 'error';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.completedAt = new Date();
    }

    this.socketService.emitClaudeStatus({ status: 'idle' });
    this.socketService.emitExecutionUpdate({
      taskId,
      status: task.status,
      message: task.status === 'error' ? task.error : 'Completed'
    });

    return task;
  }

  async startRalphLoop(prompt: string, options?: {
    maxIterations?: number;
    completionPromise?: string;
    workingDir?: string;
  }): Promise<ClaudeTask> {
    const taskId = `ralph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const task: ClaudeTask = {
      id: taskId,
      prompt,
      status: 'running',
      iterations: 0,
      maxIterations: options?.maxIterations || 20,
      output: [],
      startedAt: new Date()
    };

    this.tasks.set(taskId, task);

    const ralphPrompt = `/ralph-loop "${prompt}" --max-iterations ${task.maxIterations}${
      options?.completionPromise ? ` --completion-promise "${options.completionPromise}"` : ''
    }`;

    return this.executeTask(ralphPrompt, { workingDir: options?.workingDir });
  }

  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'running') {
      if (this.currentProcess) {
        this.currentProcess.kill('SIGTERM');
        this.currentProcess = null;
      }
      task.status = 'cancelled';
      task.completedAt = new Date();
      
      this.socketService.emitExecutionUpdate({
        taskId,
        status: 'error',
        message: 'Task cancelled by user'
      });
    }
  }

  async createExecutionPlan(description: string, steps: Omit<ExecutionStep, 'id' | 'status'>[]): Promise<ExecutionPlan> {
    const planId = `plan_${Date.now()}`;
    
    const plan: ExecutionPlan = {
      id: planId,
      description,
      steps: steps.map((step, index) => ({
        ...step,
        id: `step_${index}`,
        status: 'pending'
      })),
      approved: false,
      createdAt: new Date()
    };

    this.plans.set(planId, plan);
    this.socketService.broadcast('claude:plan-created', plan);
    
    return plan;
  }

  approvePlan(planId: string): void {
    const plan = this.plans.get(planId);
    if (plan) {
      plan.approved = true;
      this.socketService.broadcast('claude:plan-approved', { planId });
      this.executePlan(planId);
    }
  }

  rejectPlan(planId: string): void {
    const plan = this.plans.get(planId);
    if (plan) {
      this.plans.delete(planId);
      this.socketService.broadcast('claude:plan-rejected', { planId });
    }
  }

  private async executePlan(planId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan || !plan.approved) return;

    for (const step of plan.steps) {
      // Check dependencies
      const depsComplete = step.dependencies.every(depId => {
        const dep = plan.steps.find(s => s.id === depId);
        return dep?.status === 'success';
      });

      if (!depsComplete) {
        step.status = 'skipped';
        continue;
      }

      step.status = 'running';
      this.socketService.broadcast('claude:step-update', { planId, step });

      if (step.command) {
        const result = await this.executeTask(step.command);
        step.status = result.status === 'success' ? 'success' : 'error';
        step.output = result.output.join('\n');
      } else {
        step.status = 'success';
      }

      this.socketService.broadcast('claude:step-update', { planId, step });
    }
  }

  getTask(taskId: string): ClaudeTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): ClaudeTask[] {
    return Array.from(this.tasks.values());
  }

  getPlan(planId: string): ExecutionPlan | undefined {
    return this.plans.get(planId);
  }

  getAllPlans(): ExecutionPlan[] {
    return Array.from(this.plans.values());
  }
}
