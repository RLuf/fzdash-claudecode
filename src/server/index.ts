/**
 * FZDash-ClaudeCode Server
 * Main entry point for the dashboard backend
 * 
 * Integrates: Claude Code, GitHub, Qdrant, ttyd shell, ECOA
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import { config } from 'dotenv';
import chalk from 'chalk';

import apiRouter from './routes/api.js';
import githubRouter from './routes/github.js';
import qdrantRouter from './routes/qdrant.js';
import claudeRouter from './routes/claude.js';
import terminalRouter from './routes/terminal.js';
import filesRouter from './routes/files.js';

import { SocketService } from './services/socket.js';
import { ClaudeCodeService } from './services/claude-code.js';
import { QdrantService } from './services/qdrant.js';
import { GitHubService } from './services/github.js';
import { FileWatcherService } from './services/file-watcher.js';
import { TerminalService } from './services/terminal.js';

config();

const PORT = process.env.FZDASH_PORT || 3847;
const HOST = process.env.FZDASH_HOST || '0.0.0.0';

export class FZDashServer {
  private app: express.Application;
  private httpServer: ReturnType<typeof createServer>;
  private io: SocketIO;
  
  // Services
  public socketService: SocketService;
  public claudeService: ClaudeCodeService;
  public qdrantService: QdrantService;
  public githubService: GitHubService;
  public fileWatcherService: FileWatcherService;
  public terminalService: TerminalService;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIO(this.httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    // Initialize services
    this.socketService = new SocketService(this.io);
    this.claudeService = new ClaudeCodeService(this.socketService);
    this.qdrantService = new QdrantService(this.socketService);
    this.githubService = new GitHubService(this.socketService);
    this.fileWatcherService = new FileWatcherService();
    this.terminalService = new TerminalService();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(
          chalk.gray(`[${new Date().toISOString()}]`),
          chalk.cyan(req.method),
          req.path,
          chalk.yellow(`${duration}ms`),
          res.statusCode >= 400 ? chalk.red(res.statusCode) : chalk.green(res.statusCode)
        );
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        services: {
          qdrant: this.qdrantService.isConnected(),
          github: this.githubService.isAuthenticated(),
          claude: this.claudeService.isAvailable()
        }
      });
    });

    // API Routes
    this.app.use('/api', apiRouter);
    this.app.use('/api/github', githubRouter);
    this.app.use('/api/qdrant', qdrantRouter);
    this.app.use('/api/claude', claudeRouter);
    this.app.use('/api/terminal', terminalRouter);
    this.app.use('/api/files', filesRouter);

    // Static files (client build)
    this.app.use(express.static('dist/client'));

    // SPA fallback
    this.app.get('*', (_req, res) => {
      res.sendFile('index.html', { root: 'dist/client' });
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      console.log(chalk.green(`✓ Client connected: ${socket.id}`));

      // Register socket handlers
      this.socketService.registerSocket(socket);

      socket.on('disconnect', () => {
        console.log(chalk.yellow(`✗ Client disconnected: ${socket.id}`));
        this.socketService.unregisterSocket(socket);
      });
    });
  }

  async start(): Promise<void> {
    // Initialize services
    await this.qdrantService.connect();
    await this.githubService.initialize();
    await this.claudeService.initialize();
    
    return new Promise((resolve) => {
      this.httpServer.listen(Number(PORT), HOST, () => {
        console.log('');
        console.log(chalk.bgBlue.white.bold(' FZDash-ClaudeCode '));
        console.log('');
        console.log(chalk.cyan('╔════════════════════════════════════════════════════════════╗'));
        console.log(chalk.cyan('║') + chalk.white('  Dashboard for Claude Code + FazAI-NG Integration          ') + chalk.cyan('║'));
        console.log(chalk.cyan('╠════════════════════════════════════════════════════════════╣'));
        console.log(chalk.cyan('║') + chalk.green(`  ✓ Server running at: http://${HOST}:${PORT}`) + '              ' + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.green(`  ✓ WebSocket ready`) + '                                        ' + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.green(`  ✓ Qdrant: ${this.qdrantService.isConnected() ? 'Connected' : 'Disconnected'}`) + '                                   ' + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.green(`  ✓ GitHub: ${this.githubService.isAuthenticated() ? 'Authenticated' : 'Not configured'}`) + '                               ' + chalk.cyan('║'));
        console.log(chalk.cyan('╚════════════════════════════════════════════════════════════╝'));
        console.log('');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.io.close();
    this.httpServer.close();
    await this.qdrantService.disconnect();
  }
}

// Start server
const server = new FZDashServer();
server.start().catch(console.error);

export default server;
