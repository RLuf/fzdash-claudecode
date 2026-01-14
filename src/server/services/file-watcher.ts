/**
 * File Watcher Service
 * Real-time file monitoring using chokidar
 */

import chokidar, { FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  relativePath: string;
  content?: string;
  stats?: {
    size: number;
    mtime: Date;
    isDirectory: boolean;
  };
}

export interface WatchOptions {
  ignored?: string | RegExp | ((path: string) => boolean);
  persistent?: boolean;
  ignoreInitial?: boolean;
  followSymlinks?: boolean;
  depth?: number;
  awaitWriteFinish?: boolean | { stabilityThreshold?: number; pollInterval?: number };
}

const DEFAULT_IGNORED = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.cache/**',
  '**/coverage/**',
  '**/*.log',
  '**/.DS_Store',
  '**/Thumbs.db'
];

export class FileWatcherService extends EventEmitter {
  private watchers: Map<string, FSWatcher> = new Map();
  private watchedPaths: Map<string, string[]> = new Map();

  constructor() {
    super();
  }

  async watch(
    basePath: string,
    options: WatchOptions = {}
  ): Promise<string> {
    const watchId = `watch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const watchOptions: chokidar.WatchOptions = {
      ignored: options.ignored || DEFAULT_IGNORED,
      persistent: options.persistent ?? true,
      ignoreInitial: options.ignoreInitial ?? false,
      followSymlinks: options.followSymlinks ?? true,
      depth: options.depth ?? 10,
      awaitWriteFinish: options.awaitWriteFinish ?? {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    };

    const watcher = chokidar.watch(basePath, watchOptions);

    watcher
      .on('add', (filePath) => this.handleFileEvent('add', basePath, filePath))
      .on('change', (filePath) => this.handleFileEvent('change', basePath, filePath))
      .on('unlink', (filePath) => this.handleFileEvent('unlink', basePath, filePath))
      .on('addDir', (filePath) => this.handleFileEvent('addDir', basePath, filePath))
      .on('unlinkDir', (filePath) => this.handleFileEvent('unlinkDir', basePath, filePath))
      .on('error', (error) => this.emit('error', { watchId, error }))
      .on('ready', () => this.emit('ready', { watchId, basePath }));

    this.watchers.set(watchId, watcher);
    this.watchedPaths.set(watchId, [basePath]);

    return watchId;
  }

  private async handleFileEvent(
    type: FileChangeEvent['type'],
    basePath: string,
    filePath: string
  ): Promise<void> {
    const relativePath = path.relative(basePath, filePath);
    
    const event: FileChangeEvent = {
      type,
      path: filePath,
      relativePath
    };

    // Try to get file stats and content for non-delete events
    if (type !== 'unlink' && type !== 'unlinkDir') {
      try {
        const stats = await fs.stat(filePath);
        event.stats = {
          size: stats.size,
          mtime: stats.mtime,
          isDirectory: stats.isDirectory()
        };

        // Read content for small text files
        if (!stats.isDirectory() && stats.size < 100000) {
          const ext = path.extname(filePath).toLowerCase();
          const textExtensions = [
            '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt',
            '.css', '.scss', '.html', '.yml', '.yaml', '.toml',
            '.sh', '.ps1', '.bat', '.py', '.rb', '.go', '.rs'
          ];
          
          if (textExtensions.includes(ext)) {
            event.content = await fs.readFile(filePath, 'utf-8');
          }
        }
      } catch {
        // File might have been deleted between detection and stat
      }
    }

    this.emit('change', event);
  }

  async unwatch(watchId: string): Promise<boolean> {
    const watcher = this.watchers.get(watchId);
    if (!watcher) return false;

    await watcher.close();
    this.watchers.delete(watchId);
    this.watchedPaths.delete(watchId);
    
    this.emit('unwatched', { watchId });
    return true;
  }

  async unwatchAll(): Promise<void> {
    const closePromises = Array.from(this.watchers.values()).map(w => w.close());
    await Promise.all(closePromises);
    
    this.watchers.clear();
    this.watchedPaths.clear();
  }

  getWatchedPaths(watchId: string): string[] | undefined {
    return this.watchedPaths.get(watchId);
  }

  getAllWatchers(): string[] {
    return Array.from(this.watchers.keys());
  }

  isWatching(watchId: string): boolean {
    return this.watchers.has(watchId);
  }

  async addPath(watchId: string, newPath: string): Promise<boolean> {
    const watcher = this.watchers.get(watchId);
    if (!watcher) return false;

    watcher.add(newPath);
    
    const paths = this.watchedPaths.get(watchId) || [];
    paths.push(newPath);
    this.watchedPaths.set(watchId, paths);
    
    return true;
  }

  async removePath(watchId: string, pathToRemove: string): Promise<boolean> {
    const watcher = this.watchers.get(watchId);
    if (!watcher) return false;

    await watcher.unwatch(pathToRemove);
    
    const paths = this.watchedPaths.get(watchId) || [];
    const filtered = paths.filter(p => p !== pathToRemove);
    this.watchedPaths.set(watchId, filtered);
    
    return true;
  }

  // Scan directory without watching
  async scanDirectory(
    dirPath: string,
    options: { depth?: number; extensions?: string[] } = {}
  ): Promise<{
    files: string[];
    directories: string[];
    total: number;
  }> {
    const { depth = 5, extensions } = options;
    const files: string[] = [];
    const directories: string[] = [];

    const scan = async (currentPath: string, currentDepth: number): Promise<void> => {
      if (currentDepth > depth) return;

      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          const relativePath = path.relative(dirPath, fullPath);
          
          // Skip ignored patterns
          if (DEFAULT_IGNORED.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
            return regex.test(relativePath);
          })) continue;

          if (entry.isDirectory()) {
            directories.push(relativePath);
            await scan(fullPath, currentDepth + 1);
          } else {
            if (!extensions || extensions.includes(path.extname(entry.name).toLowerCase())) {
              files.push(relativePath);
            }
          }
        }
      } catch {
        // Permission denied or other error
      }
    };

    await scan(dirPath, 0);

    return {
      files,
      directories,
      total: files.length + directories.length
    };
  }
}

export const fileWatcher = new FileWatcherService();
