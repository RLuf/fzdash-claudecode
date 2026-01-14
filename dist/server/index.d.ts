import { Server, Socket } from 'socket.io';
import { EventEmitter } from 'events';
import { StatusResult } from 'simple-git';
import * as pty from 'node-pty';

/**
 * Socket.IO Service
 * Manages real-time communication with clients
 */

declare class SocketService {
    private io;
    private sockets;
    constructor(io: Server);
    registerSocket(socket: Socket): void;
    unregisterSocket(socket: Socket): void;
    broadcast(event: string, data: unknown): void;
    broadcastToRoom(room: string, event: string, data: unknown): void;
    emitToSocket(socketId: string, event: string, data: unknown): void;
    joinRoom(socketId: string, room: string): void;
    leaveRoom(socketId: string, room: string): void;
    getConnectedCount(): number;
    emitExecutionUpdate(data: {
        taskId: string;
        status: 'pending' | 'running' | 'success' | 'error';
        progress?: number;
        message?: string;
        output?: string;
    }): void;
    emitFileChange(data: {
        type: 'add' | 'change' | 'unlink';
        path: string;
        content?: string;
    }): void;
    emitClaudeStatus(data: {
        status: 'idle' | 'thinking' | 'executing' | 'error';
        currentTask?: string;
        iteration?: number;
        maxIterations?: number;
    }): void;
    emitQdrantUpdate(data: {
        collection: string;
        action: 'upsert' | 'delete' | 'search';
        count?: number;
    }): void;
    emitGitStatus(data: {
        branch: string;
        ahead: number;
        behind: number;
        modified: string[];
        staged: string[];
    }): void;
}

/**
 * Claude Code Service
 * Integrates with Claude Code CLI for agentic operations
 */

interface ClaudeTask {
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
interface ExecutionPlan {
    id: string;
    description: string;
    steps: ExecutionStep[];
    approved: boolean;
    createdAt: Date;
}
interface ExecutionStep {
    id: string;
    description: string;
    command?: string;
    status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
    output?: string;
    dependencies: string[];
}
declare class ClaudeCodeService extends EventEmitter {
    private socketService;
    private available;
    private currentProcess;
    private tasks;
    private plans;
    private claudePath;
    constructor(socketService: SocketService);
    initialize(): Promise<void>;
    isAvailable(): boolean;
    handleSocket(socket: Socket): void;
    executeTask(prompt: string, options?: {
        maxIterations?: number;
        completionPromise?: string;
        workingDir?: string;
    }): Promise<ClaudeTask>;
    startRalphLoop(prompt: string, options?: {
        maxIterations?: number;
        completionPromise?: string;
        workingDir?: string;
    }): Promise<ClaudeTask>;
    cancelTask(taskId: string): void;
    createExecutionPlan(description: string, steps: Omit<ExecutionStep, 'id' | 'status'>[]): Promise<ExecutionPlan>;
    approvePlan(planId: string): void;
    rejectPlan(planId: string): void;
    private executePlan;
    getTask(taskId: string): ClaudeTask | undefined;
    getAllTasks(): ClaudeTask[];
    getPlan(planId: string): ExecutionPlan | undefined;
    getAllPlans(): ExecutionPlan[];
}

/**
 * Qdrant Service
 * Manages vector database operations for ECOA and FazAI-NG
 */

interface CollectionInfo {
    name: string;
    vectorsCount: number;
    indexedVectorsCount: number;
    pointsCount: number;
    segmentsCount: number;
    status: 'green' | 'yellow' | 'red';
    vectorSize: number;
    distance: string;
}
interface SearchResult {
    id: string | number;
    score: number;
    payload: Record<string, unknown>;
    vector?: number[];
}
interface UpsertPoint {
    id: string | number;
    vector: number[];
    payload: Record<string, unknown>;
}
declare class QdrantService {
    private client;
    private socketService;
    private connected;
    private qdrantUrl;
    private readonly COLLECTIONS;
    constructor(socketService: SocketService);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    getCollections(): Promise<CollectionInfo[]>;
    search(collectionName: string, vector: number[], limit?: number, filter?: Record<string, unknown>): Promise<SearchResult[]>;
    searchMultiCollection(_query: string, collections?: string[]): Promise<Map<string, SearchResult[]>>;
    upsert(collectionName: string, points: UpsertPoint[]): Promise<boolean>;
    deletePoints(collectionName: string, ids: (string | number)[]): Promise<boolean>;
    getPoint(collectionName: string, id: string | number): Promise<SearchResult | null>;
    scroll(collectionName: string, limit?: number, offset?: string | number): Promise<{
        points: SearchResult[];
        nextOffset?: string | number;
    }>;
    createCollection(name: string, vectorSize?: number): Promise<boolean>;
    deleteCollection(name: string): Promise<boolean>;
    storeExecutionBlock(block: {
        content: string;
        sourceContext: string;
        validDestinations: string[];
        destinationHints: Array<{
            concept: string;
            relevance: number;
        }>;
        vector: number[];
    }): Promise<boolean>;
    findBlocksByDestination(destination: string, limit?: number): Promise<SearchResult[]>;
}

/**
 * GitHub Service
 * Manages Git operations, PRs, diffs, and repository sync
 */

interface RepoInfo {
    owner: string;
    repo: string;
    branch: string;
    remoteUrl: string;
    localPath: string;
}
interface DiffResult {
    file: string;
    additions: number;
    deletions: number;
    changes: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
}
interface PRInfo {
    number: number;
    title: string;
    state: string;
    author: string;
    createdAt: string;
    updatedAt: string;
    mergeable: boolean | null;
    draft: boolean;
    labels: string[];
    reviewers: string[];
}
declare class GitHubService {
    private octokit;
    private socketService;
    private authenticated;
    private git;
    private currentRepo;
    constructor(socketService: SocketService);
    initialize(): Promise<void>;
    isAuthenticated(): boolean;
    setWorkingDirectory(path: string): Promise<boolean>;
    getStatus(): Promise<StatusResult | null>;
    getDiff(staged?: boolean): Promise<DiffResult[]>;
    getDiffWithRemote(branch?: string): Promise<DiffResult[]>;
    getFileDiff(filePath: string): Promise<string>;
    commit(message: string, files?: string[]): Promise<boolean>;
    push(branch?: string): Promise<boolean>;
    pull(branch?: string): Promise<boolean>;
    createBranch(name: string): Promise<boolean>;
    switchBranch(name: string): Promise<boolean>;
    getBranches(): Promise<string[]>;
    getPullRequests(): Promise<PRInfo[]>;
    createPullRequest(title: string, body: string, head: string, base?: string): Promise<number | null>;
    mergePullRequest(prNumber: number): Promise<boolean>;
    getCommitHistory(limit?: number): Promise<Array<{
        hash: string;
        message: string;
        author: string;
        date: string;
    }>>;
    getCurrentRepo(): RepoInfo | null;
}

/**
 * File Watcher Service
 * Real-time file monitoring using chokidar
 */

interface WatchOptions {
    ignored?: string | RegExp | ((path: string) => boolean);
    persistent?: boolean;
    ignoreInitial?: boolean;
    followSymlinks?: boolean;
    depth?: number;
    awaitWriteFinish?: boolean | {
        stabilityThreshold?: number;
        pollInterval?: number;
    };
}
declare class FileWatcherService extends EventEmitter {
    private watchers;
    private watchedPaths;
    constructor();
    watch(basePath: string, options?: WatchOptions): Promise<string>;
    private handleFileEvent;
    unwatch(watchId: string): Promise<boolean>;
    unwatchAll(): Promise<void>;
    getWatchedPaths(watchId: string): string[] | undefined;
    getAllWatchers(): string[];
    isWatching(watchId: string): boolean;
    addPath(watchId: string, newPath: string): Promise<boolean>;
    removePath(watchId: string, pathToRemove: string): Promise<boolean>;
    scanDirectory(dirPath: string, options?: {
        depth?: number;
        extensions?: string[];
    }): Promise<{
        files: string[];
        directories: string[];
        total: number;
    }>;
}

/**
 * Terminal Service
 * PTY-based terminal emulator for web shell access
 */

interface TerminalSession {
    id: string;
    pty: pty.IPty;
    cols: number;
    rows: number;
    cwd: string;
    shell: string;
    createdAt: Date;
    lastActivity: Date;
}
interface TerminalOptions {
    cols?: number;
    rows?: number;
    cwd?: string;
    shell?: string;
    env?: Record<string, string>;
}
declare class TerminalService extends EventEmitter {
    private sessions;
    private outputBuffers;
    private maxBufferSize;
    constructor();
    create(options?: TerminalOptions): TerminalSession;
    write(sessionId: string, data: string): boolean;
    resize(sessionId: string, cols: number, rows: number): boolean;
    kill(sessionId: string, signal?: string): boolean;
    destroy(sessionId: string): boolean;
    destroyAll(): void;
    getSession(sessionId: string): TerminalSession | undefined;
    getAllSessions(): TerminalSession[];
    getSessionIds(): string[];
    getOutputBuffer(sessionId: string): string[];
    getFullOutput(sessionId: string): string;
    clearOutputBuffer(sessionId: string): boolean;
    exec(command: string, options?: TerminalOptions & {
        timeout?: number;
    }): Promise<{
        output: string;
        exitCode: number | null;
    }>;
    isActive(sessionId: string): boolean;
    getSessionCount(): number;
    getSessionsByShell(shell: string): TerminalSession[];
    getIdleSessions(idleMs?: number): TerminalSession[];
    cleanupIdleSessions(idleMs?: number): number;
}

/**
 * FZDash-ClaudeCode Server
 * Main entry point for the dashboard backend
 *
 * Integrates: Claude Code, GitHub, Qdrant, ttyd shell, ECOA
 */

declare class FZDashServer {
    private app;
    private httpServer;
    private io;
    socketService: SocketService;
    claudeService: ClaudeCodeService;
    qdrantService: QdrantService;
    githubService: GitHubService;
    fileWatcherService: FileWatcherService;
    terminalService: TerminalService;
    constructor();
    private setupMiddleware;
    private setupRoutes;
    private setupWebSocket;
    start(): Promise<void>;
    stop(): Promise<void>;
}
declare const server: FZDashServer;

export { FZDashServer, server as default };
