import { useState, useEffect } from 'react';
import { useSocket } from '@hooks/useSocket';
import {
  GitBranchIcon,
  GitCommitIcon,
  GitPullRequestIcon,
  GitMergeIcon,
  RefreshCwIcon,
  CheckIcon,
  XIcon,
  ClockIcon,
  UserIcon,
  FileTextIcon
} from 'lucide-react';
import type { GitStatus, GitCommit, GitBranch, PullRequest, WSGitStatus } from '@shared/types';

type TabType = 'status' | 'branches' | 'commits' | 'prs';

export default function Git() {
  const { socket } = useSocket();
  const [activeTab, setActiveTab] = useState<TabType>('status');
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [prs, setPRs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  useEffect(() => {
    loadGitStatus();
    loadBranches();
    loadCommits();
    loadPRs();

    if (socket) {
      socket.on('git:status', handleGitStatusUpdate);
      return () => {
        socket.off('git:status', handleGitStatusUpdate);
      };
    }
  }, [socket]);

  const handleGitStatusUpdate = (update: WSGitStatus) => {
    setStatus(prev => prev ? { ...prev, ...update } : null);
  };

  const loadGitStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/github/status');
      const data = await response.json();
      if (data.success && data.data) {
        setStatus(data.data);
      }
    } catch (error) {
      console.error('Failed to load git status:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBranches = async () => {
    try {
      const response = await fetch('/api/github/branches');
      const data = await response.json();
      if (data.success && data.data) {
        setBranches(data.data);
      }
    } catch (error) {
      console.error('Failed to load branches:', error);
    }
  };

  const loadCommits = async () => {
    try {
      const response = await fetch('/api/github/commits?limit=20');
      const data = await response.json();
      if (data.success && data.data) {
        setCommits(data.data);
      }
    } catch (error) {
      console.error('Failed to load commits:', error);
    }
  };

  const loadPRs = async () => {
    try {
      const response = await fetch('/api/github/prs');
      const data = await response.json();
      if (data.success && data.data) {
        setPRs(data.data);
      }
    } catch (error) {
      console.error('Failed to load PRs:', error);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;

    try {
      const response = await fetch('/api/github/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMessage })
      });

      const data = await response.json();
      if (data.success) {
        setCommitMessage('');
        loadGitStatus();
        loadCommits();
      }
    } catch (error) {
      console.error('Failed to commit:', error);
    }
  };

  const handlePush = async () => {
    try {
      const response = await fetch('/api/github/push', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        loadGitStatus();
      }
    } catch (error) {
      console.error('Failed to push:', error);
    }
  };

  const handlePull = async () => {
    try {
      const response = await fetch('/api/github/pull', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        loadGitStatus();
        loadCommits();
      }
    } catch (error) {
      console.error('Failed to pull:', error);
    }
  };

  const handleCheckoutBranch = async (branchName: string) => {
    try {
      const response = await fetch('/api/github/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: branchName })
      });

      const data = await response.json();
      if (data.success) {
        loadGitStatus();
        loadBranches();
      }
    } catch (error) {
      console.error('Failed to checkout branch:', error);
    }
  };

  const handleMergePR = async (prNumber: number) => {
    try {
      const response = await fetch('/api/github/prs/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: prNumber })
      });

      const data = await response.json();
      if (data.success) {
        loadPRs();
        loadGitStatus();
      }
    } catch (error) {
      console.error('Failed to merge PR:', error);
    }
  };

  const renderStatus = () => (
    <div className="space-y-6">
      {/* Current Branch */}
      <div className="bg-fazai-900 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-fazai-50 flex items-center gap-2">
            <GitBranchIcon className="w-5 h-5" />
            Current Branch
          </h3>
          <div className="flex gap-2">
            <button
              onClick={handlePull}
              className="px-3 py-1 bg-fazai-700 hover:bg-fazai-600 rounded text-sm text-fazai-100"
            >
              Pull
            </button>
            <button
              onClick={handlePush}
              disabled={!status || status.ahead === 0}
              className={`px-3 py-1 rounded text-sm ${
                status && status.ahead > 0
                  ? 'bg-fazai-600 hover:bg-fazai-500 text-white'
                  : 'bg-fazai-800 text-fazai-500 cursor-not-allowed'
              }`}
            >
              Push {status && status.ahead > 0 && `(${status.ahead})`}
            </button>
          </div>
        </div>

        {status && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-fazai-200">{status.branch}</span>
              {status.clean && (
                <span className="px-2 py-1 bg-green-900/50 text-green-400 rounded text-xs">
                  Clean
                </span>
              )}
            </div>

            <div className="flex gap-6 text-sm text-fazai-400">
              <span>↑ {status.ahead} ahead</span>
              <span>↓ {status.behind} behind</span>
            </div>
          </div>
        )}
      </div>

      {/* Changes */}
      {status && !status.clean && (
        <div className="bg-fazai-900 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-fazai-50 mb-4">Changes</h3>

          <div className="space-y-4">
            {/* Modified Files */}
            {status.modified.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-amber-500 mb-2">
                  Modified ({status.modified.length})
                </h4>
                <div className="space-y-1">
                  {status.modified.map(file => (
                    <div key={file} className="flex items-center gap-2 text-sm text-fazai-300 font-mono">
                      <span className="text-amber-500">M</span>
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Staged Files */}
            {status.staged.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-green-500 mb-2">
                  Staged ({status.staged.length})
                </h4>
                <div className="space-y-1">
                  {status.staged.map(file => (
                    <div key={file} className="flex items-center gap-2 text-sm text-fazai-300 font-mono">
                      <span className="text-green-500">A</span>
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Untracked Files */}
            {status.untracked.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-fazai-500 mb-2">
                  Untracked ({status.untracked.length})
                </h4>
                <div className="space-y-1">
                  {status.untracked.map(file => (
                    <div key={file} className="flex items-center gap-2 text-sm text-fazai-400 font-mono">
                      <span className="text-fazai-500">?</span>
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Commit Form */}
          <div className="mt-6 pt-6 border-t border-fazai-700">
            <h4 className="text-sm font-medium text-fazai-300 mb-3">Commit Changes</h4>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Commit message..."
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleCommit()}
                className="flex-1 px-3 py-2 bg-fazai-800 border border-fazai-700 rounded text-fazai-100 placeholder-fazai-500 focus:outline-none focus:border-fazai-500"
              />
              <button
                onClick={handleCommit}
                disabled={!commitMessage.trim()}
                className={`px-4 py-2 rounded ${
                  commitMessage.trim()
                    ? 'bg-fazai-600 hover:bg-fazai-500 text-white'
                    : 'bg-fazai-800 text-fazai-500 cursor-not-allowed'
                }`}
              >
                Commit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderBranches = () => (
    <div className="space-y-3">
      {branches.map(branch => (
        <div
          key={branch.name}
          className={`bg-fazai-900 rounded-lg p-4 ${
            branch.current ? 'border-2 border-fazai-500' : 'border border-fazai-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GitBranchIcon className={`w-5 h-5 ${branch.current ? 'text-fazai-400' : 'text-fazai-600'}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fazai-100">{branch.name}</span>
                  {branch.current && (
                    <span className="px-2 py-0.5 bg-fazai-600 text-white text-xs rounded">
                      Current
                    </span>
                  )}
                </div>
                {branch.remote && (
                  <span className="text-xs text-fazai-500">→ {branch.remote}</span>
                )}
              </div>
            </div>

            {!branch.current && (
              <button
                onClick={() => handleCheckoutBranch(branch.name)}
                className="px-3 py-1 bg-fazai-700 hover:bg-fazai-600 rounded text-sm text-fazai-100"
              >
                Checkout
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const renderCommits = () => (
    <div className="space-y-3">
      {commits.map(commit => (
        <div key={commit.hash} className="bg-fazai-900 rounded-lg p-4 border border-fazai-700">
          <div className="flex items-start gap-3">
            <GitCommitIcon className="w-5 h-5 text-fazai-500 mt-0.5" />
            <div className="flex-1">
              <p className="text-fazai-100 mb-2">{commit.message}</p>
              <div className="flex items-center gap-4 text-xs text-fazai-500">
                <span className="flex items-center gap-1">
                  <UserIcon className="w-3 h-3" />
                  {commit.author}
                </span>
                <span className="flex items-center gap-1">
                  <ClockIcon className="w-3 h-3" />
                  {new Date(commit.date).toLocaleString()}
                </span>
                <span className="font-mono">{commit.shortHash}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderPRs = () => (
    <div className="space-y-3">
      {prs.length === 0 ? (
        <div className="text-center py-12 text-fazai-500">
          <GitPullRequestIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No pull requests</p>
        </div>
      ) : (
        prs.map(pr => (
          <div key={pr.number} className="bg-fazai-900 rounded-lg p-4 border border-fazai-700">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <GitPullRequestIcon className={`w-5 h-5 mt-0.5 ${
                  pr.state === 'open' ? 'text-green-500' :
                  pr.state === 'merged' ? 'text-purple-500' : 'text-red-500'
                }`} />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-fazai-100">#{pr.number} {pr.title}</span>
                    {pr.draft && (
                      <span className="px-2 py-0.5 bg-fazai-700 text-fazai-300 text-xs rounded">
                        Draft
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-fazai-400 mb-2">{pr.body || 'No description'}</p>
                  <div className="flex items-center gap-4 text-xs text-fazai-500">
                    <span className="flex items-center gap-1">
                      <UserIcon className="w-3 h-3" />
                      {pr.author}
                    </span>
                    <span>{pr.branch} → {pr.targetBranch}</span>
                    <span className="flex items-center gap-1">
                      <ClockIcon className="w-3 h-3" />
                      {new Date(pr.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {pr.state === 'open' && pr.mergeable && !pr.draft && (
                <button
                  onClick={() => handleMergePR(pr.number)}
                  className="px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-sm text-white flex items-center gap-1"
                >
                  <GitMergeIcon className="w-4 h-4" />
                  Merge
                </button>
              )}
            </div>

            {pr.labels.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {pr.labels.map(label => (
                  <span key={label} className="px-2 py-0.5 bg-fazai-800 text-fazai-300 text-xs rounded">
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 bg-fazai-900 border-b border-fazai-700">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fazai-50">Git & GitHub</h1>
          <button
            onClick={() => {
              loadGitStatus();
              loadBranches();
              loadCommits();
              loadPRs();
            }}
            className="p-2 hover:bg-fazai-800 rounded"
            disabled={loading}
          >
            <RefreshCwIcon className={`w-5 h-5 text-fazai-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-fazai-900 border-b border-fazai-700">
        {[
          { id: 'status' as const, label: 'Status', icon: GitBranchIcon },
          { id: 'branches' as const, label: 'Branches', icon: GitBranchIcon },
          { id: 'commits' as const, label: 'Commits', icon: GitCommitIcon },
          { id: 'prs' as const, label: 'Pull Requests', icon: GitPullRequestIcon }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-fazai-500 text-fazai-100'
                  : 'border-transparent text-fazai-500 hover:text-fazai-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'status' && renderStatus()}
        {activeTab === 'branches' && renderBranches()}
        {activeTab === 'commits' && renderCommits()}
        {activeTab === 'prs' && renderPRs()}
      </div>
    </div>
  );
}
