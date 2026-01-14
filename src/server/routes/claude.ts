/**
 * Claude Code API Routes
 * Endpoints for Claude Code execution and management
 */

import { Router, Request, Response } from 'express';
import { ClaudeCodeService } from '../services/claude-code.js';
import { sendResponse, sendError } from './api.js';
import { ClaudeExecuteRequest, ExecutionPlan } from '../../shared/types.js';

const router = Router();
const claudeService = new ClaudeCodeService();

// Get Claude status
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = claudeService.getStatus();
    sendResponse(res, status);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Check if Claude Code is available
router.get('/check', async (_req: Request, res: Response) => {
  try {
    const available = await claudeService.checkAvailability();
    sendResponse(res, { available });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Execute prompt
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const request = req.body as ClaudeExecuteRequest;
    
    if (!request.prompt) {
      return sendError(res, 'Prompt is required', 400);
    }

    const result = await claudeService.execute(
      request.prompt,
      request.workingDir,
      {
        allowedTools: request.allowedTools,
        maxIterations: request.maxIterations,
        dangerouslySkipPermissions: request.dangerouslySkipPermissions,
        outputFormat: request.outputFormat
      }
    );

    sendResponse(res, result);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Execute with ralph loop
router.post('/execute-loop', async (req: Request, res: Response) => {
  try {
    const { prompt, workingDir, maxIterations = 10, approvalRequired = true } = req.body;
    
    if (!prompt) {
      return sendError(res, 'Prompt is required', 400);
    }

    const result = await claudeService.executeWithRalphLoop(
      prompt,
      workingDir || process.cwd(),
      { maxIterations, stopOnError: true, approvalRequired }
    );

    sendResponse(res, result);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get execution history
router.get('/history', async (_req: Request, res: Response) => {
  try {
    const history = claudeService.getExecutionHistory();
    sendResponse(res, history);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get specific execution
router.get('/execution/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const execution = claudeService.getExecution(taskId);
    
    if (!execution) {
      return sendError(res, 'Execution not found', 404);
    }

    sendResponse(res, execution);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Cancel execution
router.post('/cancel/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const cancelled = claudeService.cancelExecution(taskId);
    
    if (!cancelled) {
      return sendError(res, 'Could not cancel execution', 400);
    }

    sendResponse(res, { cancelled: true, taskId });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Create execution plan
router.post('/plan', async (req: Request, res: Response) => {
  try {
    const plan = req.body as Partial<ExecutionPlan>;
    
    if (!plan.name || !plan.tasks?.length) {
      return sendError(res, 'Plan name and tasks are required', 400);
    }

    const createdPlan = claudeService.createPlan(plan);
    sendResponse(res, createdPlan, 201);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get all plans
router.get('/plans', async (_req: Request, res: Response) => {
  try {
    const plans = claudeService.getAllPlans();
    sendResponse(res, plans);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get specific plan
router.get('/plan/:planId', async (req: Request, res: Response) => {
  try {
    const { planId } = req.params;
    const plan = claudeService.getPlan(planId);
    
    if (!plan) {
      return sendError(res, 'Plan not found', 404);
    }

    sendResponse(res, plan);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Approve plan
router.post('/plan/:planId/approve', async (req: Request, res: Response) => {
  try {
    const { planId } = req.params;
    const { approvedBy } = req.body;
    
    const approved = claudeService.approvePlan(planId, approvedBy);
    
    if (!approved) {
      return sendError(res, 'Could not approve plan', 400);
    }

    sendResponse(res, { approved: true, planId });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Execute plan
router.post('/plan/:planId/execute', async (req: Request, res: Response) => {
  try {
    const { planId } = req.params;
    const result = await claudeService.executePlan(planId);
    sendResponse(res, result);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get ralph loop status
router.get('/ralph/status', async (_req: Request, res: Response) => {
  try {
    const status = claudeService.getRalphLoopStatus();
    sendResponse(res, status);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Stop ralph loop
router.post('/ralph/stop', async (_req: Request, res: Response) => {
  try {
    const stopped = claudeService.stopRalphLoop();
    sendResponse(res, { stopped });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

export default router;
