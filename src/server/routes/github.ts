/**
 * GitHub API Routes
 * Endpoints for Git operations, PRs, and diffs
 */

import { Router, Request, Response } from 'express';
import { GitHubService } from '../services/github.js';
import { sendResponse, sendError } from './api.js';

const router = Router();

// Initialize service - will be set per request based on repo path
function getService(repoPath?: string): GitHubService {
  return new GitHubService(repoPath || process.cwd());
}

// Get git status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const repoPath = req.query.path as string;
    const service = getService(repoPath);
    const status = await service.getStatus();
    sendResponse(res, status);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get branches
router.get('/branches', async (req: Request, res: Response) => {
  try {
    const repoPath = req.query.path as string;
    const service = getService(repoPath);
    const branches = await service.getBranches();
    sendResponse(res, branches);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Switch branch
router.post('/checkout', async (req: Request, res: Response) => {
  try {
    const { branch, path: repoPath, create } = req.body;
    
    if (!branch) {
      return sendError(res, 'Branch name is required', 400);
    }

    const service = getService(repoPath);
    await service.checkout(branch, create);
    sendResponse(res, { success: true, branch });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get commit log
router.get('/log', async (req: Request, res: Response) => {
  try {
    const repoPath = req.query.path as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const service = getService(repoPath);
    const commits = await service.getLog(limit);
    sendResponse(res, commits);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Stage files
router.post('/stage', async (req: Request, res: Response) => {
  try {
    const { files, path: repoPath } = req.body;
    const service = getService(repoPath);
    await service.stage(files || ['.']);
    sendResponse(res, { staged: true });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Unstage files
router.post('/unstage', async (req: Request, res: Response) => {
  try {
    const { files, path: repoPath } = req.body;
    const service = getService(repoPath);
    await service.unstage(files);
    sendResponse(res, { unstaged: true });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Commit changes
router.post('/commit', async (req: Request, res: Response) => {
  try {
    const { message, path: repoPath } = req.body;
    
    if (!message) {
      return sendError(res, 'Commit message is required', 400);
    }

    const service = getService(repoPath);
    const commit = await service.commit(message);
    sendResponse(res, commit);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Push changes
router.post('/push', async (req: Request, res: Response) => {
  try {
    const { branch, path: repoPath, force } = req.body;
    const service = getService(repoPath);
    await service.push(branch, force);
    sendResponse(res, { pushed: true });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Pull changes
router.post('/pull', async (req: Request, res: Response) => {
  try {
    const { branch, path: repoPath, rebase } = req.body;
    const service = getService(repoPath);
    await service.pull(branch, rebase);
    sendResponse(res, { pulled: true });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get diff
router.get('/diff', async (req: Request, res: Response) => {
  try {
    const repoPath = req.query.path as string;
    const file = req.query.file as string;
    const staged = req.query.staged === 'true';
    
    const service = getService(repoPath);
    const diff = await service.getDiff(file, staged);
    sendResponse(res, diff);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Compare with remote
router.get('/compare', async (req: Request, res: Response) => {
  try {
    const repoPath = req.query.path as string;
    const branch = req.query.branch as string;
    
    const service = getService(repoPath);
    const comparison = await service.compareWithRemote(branch);
    sendResponse(res, comparison);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Fetch from remote
router.post('/fetch', async (req: Request, res: Response) => {
  try {
    const { path: repoPath, prune } = req.body;
    const service = getService(repoPath);
    await service.fetch(prune);
    sendResponse(res, { fetched: true });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Merge branch
router.post('/merge', async (req: Request, res: Response) => {
  try {
    const { branch, path: repoPath, noFf } = req.body;
    
    if (!branch) {
      return sendError(res, 'Branch name is required', 400);
    }

    const service = getService(repoPath);
    await service.merge(branch, noFf);
    sendResponse(res, { merged: true, branch });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Stash changes
router.post('/stash', async (req: Request, res: Response) => {
  try {
    const { message, path: repoPath } = req.body;
    const service = getService(repoPath);
    await service.stash(message);
    sendResponse(res, { stashed: true });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Pop stash
router.post('/stash/pop', async (req: Request, res: Response) => {
  try {
    const { path: repoPath } = req.body;
    const service = getService(repoPath);
    await service.stashPop();
    sendResponse(res, { popped: true });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// List stashes
router.get('/stash', async (req: Request, res: Response) => {
  try {
    const repoPath = req.query.path as string;
    const service = getService(repoPath);
    const stashes = await service.listStashes();
    sendResponse(res, stashes);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// === Pull Requests (requires GitHub token) ===

// List PRs
router.get('/prs', async (req: Request, res: Response) => {
  try {
    const repoPath = req.query.path as string;
    const state = (req.query.state as 'open' | 'closed' | 'all') || 'open';
    
    const service = getService(repoPath);
    const prs = await service.listPullRequests(state);
    sendResponse(res, prs);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get PR details
router.get('/pr/:number', async (req: Request, res: Response) => {
  try {
    const repoPath = req.query.path as string;
    const prNumber = parseInt(req.params.number);
    
    const service = getService(repoPath);
    const pr = await service.getPullRequest(prNumber);
    sendResponse(res, pr);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Create PR
router.post('/pr', async (req: Request, res: Response) => {
  try {
    const { title, body, head, base, path: repoPath, draft } = req.body;
    
    if (!title || !head) {
      return sendError(res, 'Title and head branch are required', 400);
    }

    const service = getService(repoPath);
    const pr = await service.createPullRequest({
      title,
      body,
      head,
      base: base || 'main',
      draft
    });
    sendResponse(res, pr, 201);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Merge PR
router.post('/pr/:number/merge', async (req: Request, res: Response) => {
  try {
    const repoPath = req.query.path as string;
    const prNumber = parseInt(req.params.number);
    const { mergeMethod } = req.body;
    
    const service = getService(repoPath);
    await service.mergePullRequest(prNumber, mergeMethod);
    sendResponse(res, { merged: true, pr: prNumber });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

export default router;
