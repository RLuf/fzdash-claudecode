/**
 * Terminal API Routes
 * Endpoints for PTY terminal management
 */

import { Router, Request, Response } from 'express';
import { terminalService, TerminalOptions } from '../services/terminal.js';
import { sendResponse, sendError } from './api.js';

const router = Router();

// List all sessions
router.get('/sessions', (_req: Request, res: Response) => {
  try {
    const sessions = terminalService.getAllSessions().map(s => ({
      id: s.id,
      shell: s.shell,
      cwd: s.cwd,
      cols: s.cols,
      rows: s.rows,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity
    }));
    sendResponse(res, sessions);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Create new session
router.post('/session', (req: Request, res: Response) => {
  try {
    const options: TerminalOptions = req.body;
    const session = terminalService.create(options);
    
    sendResponse(res, {
      id: session.id,
      shell: session.shell,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      createdAt: session.createdAt
    }, 201);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get session info
router.get('/session/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = terminalService.getSession(sessionId);
    
    if (!session) {
      return sendError(res, 'Session not found', 404);
    }

    sendResponse(res, {
      id: session.id,
      shell: session.shell,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Write to session
router.post('/session/:sessionId/write', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { data } = req.body;
    
    if (data === undefined) {
      return sendError(res, 'Data is required', 400);
    }

    const success = terminalService.write(sessionId, data);
    
    if (!success) {
      return sendError(res, 'Session not found', 404);
    }

    sendResponse(res, { written: true });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Resize session
router.post('/session/:sessionId/resize', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { cols, rows } = req.body;
    
    if (!cols || !rows) {
      return sendError(res, 'Cols and rows are required', 400);
    }

    const success = terminalService.resize(sessionId, cols, rows);
    
    if (!success) {
      return sendError(res, 'Session not found', 404);
    }

    sendResponse(res, { resized: true, cols, rows });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get output buffer
router.get('/session/:sessionId/output', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const full = req.query.full === 'true';
    
    if (!terminalService.isActive(sessionId)) {
      return sendError(res, 'Session not found', 404);
    }

    const output = full 
      ? terminalService.getFullOutput(sessionId)
      : terminalService.getOutputBuffer(sessionId);
    
    sendResponse(res, { output });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Clear output buffer
router.post('/session/:sessionId/clear', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const success = terminalService.clearOutputBuffer(sessionId);
    
    if (!success) {
      return sendError(res, 'Session not found', 404);
    }

    sendResponse(res, { cleared: true });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Kill session (send signal)
router.post('/session/:sessionId/kill', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { signal } = req.body;
    
    const success = terminalService.kill(sessionId, signal);
    
    if (!success) {
      return sendError(res, 'Session not found', 404);
    }

    sendResponse(res, { killed: true });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Destroy session
router.delete('/session/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const success = terminalService.destroy(sessionId);
    
    if (!success) {
      return sendError(res, 'Session not found', 404);
    }

    sendResponse(res, { destroyed: true });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Execute command (one-shot)
router.post('/exec', async (req: Request, res: Response) => {
  try {
    const { command, cwd, shell, timeout } = req.body;
    
    if (!command) {
      return sendError(res, 'Command is required', 400);
    }

    const result = await terminalService.exec(command, { cwd, shell, timeout });
    sendResponse(res, result);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get session stats
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const sessions = terminalService.getAllSessions();
    const idle = terminalService.getIdleSessions(300000); // 5 min idle
    
    sendResponse(res, {
      total: sessions.length,
      idle: idle.length,
      shells: sessions.reduce((acc, s) => {
        const shell = s.shell.split('/').pop() || s.shell;
        acc[shell] = (acc[shell] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Cleanup idle sessions
router.post('/cleanup', (req: Request, res: Response) => {
  try {
    const { idleMs } = req.body;
    const cleaned = terminalService.cleanupIdleSessions(idleMs || 300000);
    sendResponse(res, { cleaned });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Destroy all sessions
router.delete('/sessions', (_req: Request, res: Response) => {
  try {
    const count = terminalService.getSessionCount();
    terminalService.destroyAll();
    sendResponse(res, { destroyed: count });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

export default router;
