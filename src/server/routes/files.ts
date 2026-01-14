/**
 * Files API Routes
 * Endpoints for file system operations and watching
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileWatcher, WatchOptions } from '../services/file-watcher.js';
import { sendResponse, sendError } from './api.js';
import { FileInfo, FileContent } from '../../shared/types.js';

const router = Router();

// Utility to get language from extension
function getLanguage(ext: string): string | undefined {
  const languages: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.json': 'json',
    '.md': 'markdown',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.toml': 'toml',
    '.sh': 'shell',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.rb': 'ruby',
    '.php': 'php'
  };
  return languages[ext.toLowerCase()];
}

// List directory
router.get('/list', async (req: Request, res: Response) => {
  try {
    const dirPath = req.query.path as string;
    const depth = parseInt(req.query.depth as string) || 1;
    
    if (!dirPath) {
      return sendError(res, 'Path is required', 400);
    }

    const items: FileInfo[] = [];
    
    const readDir = async (currentPath: string, currentDepth: number): Promise<void> => {
      if (currentDepth > depth) return;
      
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(dirPath, fullPath);
        
        try {
          const stats = await fs.stat(fullPath);
          const ext = path.extname(entry.name);
          
          items.push({
            path: relativePath,
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
            size: stats.size,
            mtime: stats.mtime,
            extension: ext || undefined,
            language: ext ? getLanguage(ext) : undefined
          });
          
          if (entry.isDirectory() && currentDepth < depth) {
            await readDir(fullPath, currentDepth + 1);
          }
        } catch {
          // Skip inaccessible files
        }
      }
    };

    await readDir(dirPath, 1);
    sendResponse(res, items);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Read file
router.get('/read', async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    
    if (!filePath) {
      return sendError(res, 'Path is required', 400);
    }

    const stats = await fs.stat(filePath);
    
    if (stats.isDirectory()) {
      return sendError(res, 'Cannot read directory as file', 400);
    }

    // Limit to 10MB files
    if (stats.size > 10 * 1024 * 1024) {
      return sendError(res, 'File too large (max 10MB)', 400);
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath);
    
    const response: FileContent = {
      path: filePath,
      content,
      encoding: 'utf-8',
      size: stats.size,
      language: getLanguage(ext)
    };

    sendResponse(res, response);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Write file
router.post('/write', async (req: Request, res: Response) => {
  try {
    const { path: filePath, content, createDirs } = req.body;
    
    if (!filePath || content === undefined) {
      return sendError(res, 'Path and content are required', 400);
    }

    if (createDirs) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
    }

    await fs.writeFile(filePath, content, 'utf-8');
    sendResponse(res, { written: true, path: filePath });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Create directory
router.post('/mkdir', async (req: Request, res: Response) => {
  try {
    const { path: dirPath, recursive = true } = req.body;
    
    if (!dirPath) {
      return sendError(res, 'Path is required', 400);
    }

    await fs.mkdir(dirPath, { recursive });
    sendResponse(res, { created: true, path: dirPath });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Delete file/directory
router.delete('/delete', async (req: Request, res: Response) => {
  try {
    const { path: targetPath, recursive = false } = req.body;
    
    if (!targetPath) {
      return sendError(res, 'Path is required', 400);
    }

    const stats = await fs.stat(targetPath);
    
    if (stats.isDirectory()) {
      await fs.rm(targetPath, { recursive });
    } else {
      await fs.unlink(targetPath);
    }

    sendResponse(res, { deleted: true, path: targetPath });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Rename/move file
router.post('/rename', async (req: Request, res: Response) => {
  try {
    const { oldPath, newPath } = req.body;
    
    if (!oldPath || !newPath) {
      return sendError(res, 'Old and new paths are required', 400);
    }

    await fs.rename(oldPath, newPath);
    sendResponse(res, { renamed: true, from: oldPath, to: newPath });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Copy file
router.post('/copy', async (req: Request, res: Response) => {
  try {
    const { source, dest, recursive = true } = req.body;
    
    if (!source || !dest) {
      return sendError(res, 'Source and destination are required', 400);
    }

    await fs.cp(source, dest, { recursive });
    sendResponse(res, { copied: true, from: source, to: dest });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get file info
router.get('/info', async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    
    if (!filePath) {
      return sendError(res, 'Path is required', 400);
    }

    const stats = await fs.stat(filePath);
    const ext = path.extname(filePath);
    
    const info: FileInfo & { permissions: string } = {
      path: filePath,
      name: path.basename(filePath),
      type: stats.isDirectory() ? 'directory' : stats.isSymbolicLink() ? 'symlink' : 'file',
      size: stats.size,
      mtime: stats.mtime,
      extension: ext || undefined,
      language: getLanguage(ext),
      permissions: stats.mode.toString(8)
    };

    sendResponse(res, info);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Scan directory (without watching)
router.get('/scan', async (req: Request, res: Response) => {
  try {
    const dirPath = req.query.path as string;
    const depth = parseInt(req.query.depth as string) || 5;
    const extensions = (req.query.extensions as string)?.split(',');
    
    if (!dirPath) {
      return sendError(res, 'Path is required', 400);
    }

    const result = await fileWatcher.scanDirectory(dirPath, { depth, extensions });
    sendResponse(res, result);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// === File Watching ===

// Start watching
router.post('/watch', async (req: Request, res: Response) => {
  try {
    const { path: watchPath, options } = req.body as { path: string; options?: WatchOptions };
    
    if (!watchPath) {
      return sendError(res, 'Path is required', 400);
    }

    const watchId = await fileWatcher.watch(watchPath, options);
    sendResponse(res, { watchId, path: watchPath }, 201);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Stop watching
router.delete('/watch/:watchId', async (req: Request, res: Response) => {
  try {
    const { watchId } = req.params;
    const stopped = await fileWatcher.unwatch(watchId);
    
    if (!stopped) {
      return sendError(res, 'Watch not found', 404);
    }

    sendResponse(res, { stopped: true, watchId });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// List active watchers
router.get('/watch', (_req: Request, res: Response) => {
  try {
    const watchers = fileWatcher.getAllWatchers().map(id => ({
      id,
      paths: fileWatcher.getWatchedPaths(id)
    }));
    sendResponse(res, watchers);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Add path to watcher
router.post('/watch/:watchId/add', async (req: Request, res: Response) => {
  try {
    const { watchId } = req.params;
    const { path: newPath } = req.body;
    
    if (!newPath) {
      return sendError(res, 'Path is required', 400);
    }

    const added = await fileWatcher.addPath(watchId, newPath);
    
    if (!added) {
      return sendError(res, 'Watch not found', 404);
    }

    sendResponse(res, { added: true, watchId, path: newPath });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Remove path from watcher
router.post('/watch/:watchId/remove', async (req: Request, res: Response) => {
  try {
    const { watchId } = req.params;
    const { path: pathToRemove } = req.body;
    
    if (!pathToRemove) {
      return sendError(res, 'Path is required', 400);
    }

    const removed = await fileWatcher.removePath(watchId, pathToRemove);
    
    if (!removed) {
      return sendError(res, 'Watch not found', 404);
    }

    sendResponse(res, { removed: true, watchId, path: pathToRemove });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Stop all watchers
router.delete('/watch', async (_req: Request, res: Response) => {
  try {
    await fileWatcher.unwatchAll();
    sendResponse(res, { stopped: true });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

export default router;
