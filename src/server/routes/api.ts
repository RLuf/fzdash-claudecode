/**
 * Main API Router
 * Aggregates all route modules
 */

import { Router, Request, Response, NextFunction } from 'express';
import claudeRoutes from './claude.js';
import githubRoutes from './github.js';
import qdrantRoutes from './qdrant.js';
import terminalRoutes from './terminal.js';
import filesRoutes from './files.js';
import { ApiResponse } from '../../shared/types.js';

const router = Router();

// API Response helper
export function sendResponse<T>(
  res: Response,
  data: T,
  status: number = 200
): void {
  const response: ApiResponse<T> = {
    success: status >= 200 && status < 300,
    data,
    timestamp: new Date().toISOString()
  };
  res.status(status).json(response);
}

export function sendError(
  res: Response,
  error: string,
  status: number = 500
): void {
  const response: ApiResponse = {
    success: false,
    error,
    timestamp: new Date().toISOString()
  };
  res.status(status).json(response);
}

// Error handler middleware
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('API Error:', err);
  sendError(res, err.message || 'Internal server error', 500);
}

// Health check
router.get('/health', (_req: Request, res: Response) => {
  sendResponse(res, {
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API info
router.get('/', (_req: Request, res: Response) => {
  sendResponse(res, {
    name: 'FZDash-ClaudeCode API',
    version: '1.0.0',
    endpoints: {
      claude: '/api/claude',
      github: '/api/github',
      qdrant: '/api/qdrant',
      terminal: '/api/terminal',
      files: '/api/files'
    }
  });
});

// Mount sub-routers
router.use('/claude', claudeRoutes);
router.use('/github', githubRoutes);
router.use('/qdrant', qdrantRoutes);
router.use('/terminal', terminalRoutes);
router.use('/files', filesRoutes);

// 404 handler
router.use((_req: Request, res: Response) => {
  sendError(res, 'Endpoint not found', 404);
});

export default router;
