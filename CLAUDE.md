# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**FZDash-ClaudeCode** is a modular web dashboard for integrating Claude Code with FazAI-NG. It provides a real-time web interface for monitoring Claude Code execution, managing files, controlling Git operations, and interacting with Qdrant vector databases (ECOA collections).

**Tech Stack**: TypeScript, React 18, Express, Socket.IO, Vite, Tailwind CSS, XTerm.js

## Development Commands

```bash
# Install dependencies
npm install

# Development (runs both server and client concurrently)
npm run dev

# Development (individual components)
npm run dev:server    # Backend only (watches src/server/)
npm run dev:client    # Frontend only (Vite dev server)

# Build for production
npm run build         # Builds both client and server
npm run build:client  # Vite build → dist/client/
npm run build:server  # tsup build → dist/server/

# Run production build
npm start

# Testing
npm test              # Run tests with vitest
npm run test:coverage # Run tests with coverage

# Code quality
npm run lint          # ESLint on TypeScript files
npm run typecheck     # TypeScript type checking (no emit)

# Setup scripts
npm run setup         # Interactive project setup
npm run install:ralph # Install ralph-wiggum plugin
```

## Architecture

### Server Architecture (Port 3847)

The backend is organized around service-oriented architecture with real-time WebSocket communication:

```
src/server/
├── index.ts              # Main server, initializes all services
├── services/             # Core business logic
│   ├── socket.ts         # WebSocket event broadcasting
│   ├── claude-code.ts    # Claude Code CLI integration + Ralph loops
│   ├── qdrant.ts         # Qdrant/ECOA vector DB operations
│   ├── github.ts         # Git + GitHub PR management
│   ├── file-watcher.ts   # Chokidar-based file system monitoring
│   └── terminal.ts       # PTY terminal sessions (node-pty)
└── routes/               # Express API endpoints
    ├── api.ts            # Root router
    ├── claude.ts         # /api/claude - execution, plans
    ├── github.ts         # /api/github - status, PRs, diffs
    ├── qdrant.ts         # /api/qdrant - collections, search, ECOA
    ├── terminal.ts       # /api/terminal - session management
    └── files.ts          # /api/files - file operations
```

**Key Service Responsibilities**:
- `ClaudeCodeService`: Spawns Claude Code CLI processes, manages execution plans with approval workflow, implements ralph-wiggum iterative loops
- `QdrantService`: Connects to Qdrant at `localhost:6363`, manages ECOA collections (fazai_personality, fazai_memory, fazai_learning, fazai_kb, fazai_source)
- `GitHubService`: Uses simple-git and Octokit for local Git ops and remote GitHub PR management
- `SocketService`: Centralized WebSocket broadcasting to all connected clients
- `FileWatcherService`: Monitors file changes and broadcasts events in real-time
- `TerminalService`: Manages multiple PTY sessions for shell access

### Client Architecture (Port 5173 in dev)

React SPA with real-time updates via Socket.IO:

```
src/client/
├── App.tsx                    # Router + socket initialization
├── components/
│   ├── Layout.tsx             # Main layout with sidebar navigation
│   ├── ExecutionPlan.tsx      # Plan approval UI for Claude Code
│   └── RealTimeOutput.tsx     # Streaming output display
├── hooks/
│   ├── useSocket.ts           # Socket.IO singleton hook
│   └── useClaudeCode.ts       # Claude Code state management
├── pages/
│   ├── Dashboard.tsx          # Main dashboard with stats
│   ├── Terminal.tsx           # XTerm.js multi-session interface
│   ├── Files.tsx              # File browser + editor (MISSING)
│   ├── Git.tsx                # Git/PR management UI (MISSING)
│   └── Qdrant.tsx             # ECOA collection viewer (MISSING)
└── styles/
    └── index.css              # Tailwind + custom FazAI brand colors
```

**Path Aliases** (tsconfig.json):
- `@/` → `src/client/`
- `@shared/` → `src/shared/`
- `@components/` → `src/client/components/`
- `@pages/` → `src/client/pages/`
- `@hooks/` → `src/client/hooks/`
- `@lib/` → `src/client/lib/`

### Shared Types

All TypeScript interfaces are centralized in `src/shared/types.ts` (369 lines), covering:
- Execution types: `ExecutionTask`, `ExecutionPlan`, `ExecutionStatus`
- Claude Code: `ClaudeState`, `ClaudeExecuteRequest`, `ClaudeExecuteResponse`
- Ralph Loop: `RalphLoopConfig`, `RalphLoopState`
- Git/GitHub: `GitStatus`, `GitCommit`, `PullRequest`, `GitDiff`
- Qdrant: `QdrantCollection`, `QdrantPoint`, `QdrantSearchRequest`
- ECOA: `ECOABlock`, `ECOAQuery`, `ECOAResult`
- WebSocket events: `WSExecutionUpdate`, `WSFileChange`, `WSClaudeStatus`

Import from `@shared/types` in both client and server code.

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Server
FZDASH_PORT=3847
FZDASH_HOST=0.0.0.0

# Qdrant
QDRANT_URL=http://localhost:6363
QDRANT_API_KEY=          # Optional

# GitHub
GITHUB_TOKEN=            # Personal access token
GITHUB_OWNER=            # Default repo owner
GITHUB_REPO=             # Default repo name

# Claude Code
CLAUDE_CODE_PATH=claude  # Path to Claude Code CLI
CLAUDE_MAX_ITERATIONS=10 # Max Ralph loop iterations

# Terminal
TERMINAL_SHELL=          # Default shell (powershell.exe on Windows)
TERMINAL_MAX_SESSIONS=10
TERMINAL_IDLE_TIMEOUT=3600000
```

### Qdrant Integration

FZDash expects Qdrant running on **port 6363** (not the default 6333, to avoid conflicts with FazAI).

ECOA collections used by FazAI-NG:
- `fazai_personality` - AI personality traits and behaviors
- `fazai_memory` - Conversation memories
- `fazai_learning` - Learning experiences and patterns
- `fazai_kb` - Knowledge base articles
- `fazai_source` - Source code and documentation

## Real-Time Communication

WebSocket events are defined in `src/shared/types.ts`:

**Server → Client broadcasts**:
- `execution:update` - Claude Code task progress
- `file:change` - File system changes
- `claude:status` - Claude status updates
- `git:status` - Git repository status
- `terminal:output` - Terminal session output
- `qdrant:update` - Vector DB updates

**Client → Server events**:
- `terminal:input` - Send input to terminal session
- `terminal:resize` - Resize terminal dimensions
- `execution:cancel` - Cancel running Claude task
- `plan:approve` - Approve execution plan
- `plan:reject` - Reject execution plan

## Important Implementation Notes

### Claude Code Execution

The `ClaudeCodeService` spawns Claude Code as a child process and parses its output. Key features:

1. **Execution Plans**: Claude can submit multi-step plans requiring user approval via the dashboard
2. **Ralph-Wiggum Loops**: Supports iterative refinement with checkpoint recovery
3. **Real-time Streaming**: All stdout/stderr is broadcast via WebSocket

### File Watching

`FileWatcherService` uses chokidar to monitor the working directory and broadcasts changes. Configure ignored patterns in the service or via environment.

### Terminal Sessions

Multiple terminal sessions are supported via `node-pty`. Each session:
- Has a unique ID
- Maintains separate shell state
- Broadcasts output to all connected clients
- Auto-cleanup on idle timeout

### Git Operations

`GitHubService` combines:
- `simple-git` for local repository operations
- `@octokit/rest` for GitHub API (PRs, issues, reviews)

All Git operations run asynchronously and broadcast status updates.

## Missing Components (15% remaining)

The following files are referenced in the codebase but not yet implemented:

1. **`src/client/pages/Files.tsx`** - File browser with tree view and basic editor
2. **`src/client/pages/Git.tsx`** - Branch/commit/PR management interface
3. **`src/client/pages/Qdrant.tsx`** - ECOA collection visualization
4. **`src/client/components/DiffViewer.tsx`** - Side-by-side or unified diff component
5. **`postcss.config.js`** - PostCSS configuration for Tailwind
6. **`.env.example`** - Template for environment variables
7. **`scripts/install-ralph-wiggum.js`** - Ralph plugin installer
8. **`scripts/setup.js`** - Interactive setup script

## Design System

Tailwind configuration uses custom FazAI brand colors (fazai-50 through fazai-950). The design is dark-themed with:
- Fonts: Inter (UI), JetBrains Mono (code/terminal)
- Animations: pulse-slow, spin-slow, glow effects
- Backgrounds: Grid patterns with gradient overlays

## Integration Points

### FazAI-NG
- Deployed on `\\walker` (192.168.0.22)
- Uses same Qdrant instance for ECOA
- Ralph-wiggum plugin enables iterative agentic loops

### Qdrant/ECOA
- Vector database for semantic search and retrieval
- 1024-dimensional embeddings (mxbai-embed-large via Ollama)
- Collections organized by function (personality, memory, learning, knowledge, source)

### GitHub
- OAuth token authentication
- Full PR workflow support (create, review, merge, status checks)
- Diff visualization for local vs remote changes
