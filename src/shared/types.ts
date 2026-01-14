/**
 * Shared Types for FZDash-ClaudeCode
 * Types used across server and client
 */

// ============ Execution Types ============

export type ExecutionStatus = 'pending' | 'queued' | 'running' | 'success' | 'error' | 'cancelled';

export interface ExecutionTask {
  id: string;
  command: string;
  prompt?: string;
  status: ExecutionStatus;
  progress?: number;
  output?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
}

export interface ExecutionPlan {
  id: string;
  name: string;
  description?: string;
  tasks: ExecutionPlanTask[];
  status: ExecutionStatus;
  requiresApproval: boolean;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  createdAt: Date;
  executedAt?: Date;
}

export interface ExecutionPlanTask {
  id: string;
  order: number;
  name: string;
  command: string;
  description?: string;
  dependencies?: string[];
  status: ExecutionStatus;
  output?: string;
  error?: string;
}

// ============ Claude Code Types ============

export type ClaudeStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'error';

export interface ClaudeState {
  status: ClaudeStatus;
  currentTask?: string;
  iteration?: number;
  maxIterations?: number;
  lastActivity?: Date;
  model?: string;
}

export interface ClaudeExecuteRequest {
  prompt: string;
  workingDir?: string;
  allowedTools?: string[];
  maxIterations?: number;
  dangerouslySkipPermissions?: boolean;
  outputFormat?: 'text' | 'json' | 'stream-json';
}

export interface ClaudeExecuteResponse {
  taskId: string;
  status: ExecutionStatus;
  output?: string;
  error?: string;
  iterations?: number;
  duration?: number;
}

// ============ Ralph Loop Types ============

export interface RalphLoopConfig {
  maxIterations: number;
  stopOnError: boolean;
  approvalRequired: boolean;
  checkpointInterval?: number;
}

export interface RalphLoopState {
  active: boolean;
  iteration: number;
  maxIterations: number;
  lastCheckpoint?: string;
  errors: string[];
}

// ============ Git Types ============

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  modified: string[];
  staged: string[];
  untracked: string[];
  conflicted: string[];
  clean: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  date: Date;
  files?: string[];
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  lastCommit?: GitCommit;
}

export interface GitDiff {
  file: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  hunks: GitDiffHunk[];
}

export interface GitDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  branch: string;
  targetBranch: string;
  createdAt: Date;
  updatedAt: Date;
  mergeable?: boolean;
  draft: boolean;
  labels: string[];
  reviewers: string[];
}

// ============ Qdrant Types ============

export interface QdrantCollection {
  name: string;
  vectorsCount: number;
  pointsCount: number;
  status: 'green' | 'yellow' | 'red';
  config?: {
    vectorSize: number;
    distance: 'Cosine' | 'Euclid' | 'Dot';
  };
}

export interface QdrantPoint {
  id: string | number;
  vector?: number[];
  payload?: Record<string, unknown>;
  score?: number;
}

export interface QdrantSearchRequest {
  collection: string;
  query: string | number[];
  limit?: number;
  filter?: Record<string, unknown>;
  withPayload?: boolean;
  withVector?: boolean;
}

export interface QdrantSearchResult {
  points: QdrantPoint[];
  totalFound: number;
  searchTime: number;
}

// ============ File Types ============

export interface FileInfo {
  path: string;
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  mtime: Date;
  extension?: string;
  language?: string;
}

export interface FileContent {
  path: string;
  content: string;
  encoding: string;
  size: number;
  language?: string;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  relativePath: string;
  content?: string;
  timestamp: Date;
}

// ============ Terminal Types ============

export interface TerminalSession {
  id: string;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: Date;
  lastActivity: Date;
}

export interface TerminalOutput {
  sessionId: string;
  data: string;
  timestamp: Date;
}

// ============ WebSocket Events ============

export interface WSExecutionUpdate {
  taskId: string;
  status: ExecutionStatus;
  progress?: number;
  message?: string;
  output?: string;
}

export interface WSFileChange {
  type: FileChangeEvent['type'];
  path: string;
  content?: string;
}

export interface WSClaudeStatus {
  status: ClaudeStatus;
  currentTask?: string;
  iteration?: number;
  maxIterations?: number;
}

export interface WSGitStatus {
  branch: string;
  ahead: number;
  behind: number;
  modified: string[];
  staged: string[];
}

export interface WSTerminalOutput {
  sessionId: string;
  data: string;
}

export interface WSQdrantUpdate {
  collection: string;
  action: 'upsert' | 'delete' | 'search';
  count?: number;
}

// ============ API Response Types ============

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

// ============ Config Types ============

export interface DashboardConfig {
  server: {
    port: number;
    host: string;
    corsOrigins: string[];
  };
  claudeCode: {
    path?: string;
    defaultModel?: string;
    maxIterations: number;
  };
  qdrant: {
    url: string;
    apiKey?: string;
    collections: string[];
  };
  github: {
    token?: string;
    owner?: string;
    repo?: string;
  };
  terminal: {
    shell?: string;
    maxSessions: number;
    idleTimeout: number;
  };
  fileWatcher: {
    ignored: string[];
    maxDepth: number;
  };
}

// ============ ECOA Types (FazAI Integration) ============

export interface ECOABlock {
  id: string;
  type: 'knowledge' | 'memory' | 'learning' | 'source' | 'personality';
  content: string;
  vector?: number[];
  metadata: Record<string, unknown>;
  timestamp: Date;
  relevanceScore?: number;
}

export interface ECOAQuery {
  text: string;
  collections?: string[];
  limit?: number;
  threshold?: number;
  destinationHints?: string[];
}

export interface ECOAResult {
  blocks: ECOABlock[];
  totalRelevance: number;
  queryTime: number;
  collectionsSearched: string[];
}

// ============ Utility Types ============

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Nullable<T> = T | null;

export type AsyncResult<T, E = Error> = Promise<{ ok: true; value: T } | { ok: false; error: E }>;
