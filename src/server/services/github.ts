/**
 * GitHub Service
 * Manages Git operations, PRs, diffs, and repository sync
 */

import { Octokit } from 'octokit';
import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import { SocketService } from './socket.js';

export interface RepoInfo {
  owner: string;
  repo: string;
  branch: string;
  remoteUrl: string;
  localPath: string;
}

export interface DiffResult {
  file: string;
  additions: number;
  deletions: number;
  changes: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
}

export interface PRInfo {
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

export class GitHubService {
  private octokit: Octokit | null = null;
  private socketService: SocketService;
  private authenticated: boolean = false;
  private git: SimpleGit;
  private currentRepo: RepoInfo | null = null;

  constructor(socketService: SocketService) {
    this.socketService = socketService;
    this.git = simpleGit();
  }

  async initialize(): Promise<void> {
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      this.octokit = new Octokit({ auth: token });
      try {
        await this.octokit.rest.users.getAuthenticated();
        this.authenticated = true;
        console.log('✓ GitHub authenticated');
      } catch {
        this.authenticated = false;
        console.warn('⚠ GitHub token invalid');
      }
    }
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  async setWorkingDirectory(path: string): Promise<boolean> {
    try {
      this.git = simpleGit(path);
      const isRepo = await this.git.checkIsRepo();
      if (isRepo) {
        const remotes = await this.git.getRemotes(true);
        const origin = remotes.find(r => r.name === 'origin');
        const branch = await this.git.branch();
        
        if (origin?.refs?.fetch) {
          const match = origin.refs.fetch.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
          if (match) {
            this.currentRepo = {
              owner: match[1],
              repo: match[2],
              branch: branch.current,
              remoteUrl: origin.refs.fetch,
              localPath: path
            };
          }
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<StatusResult | null> {
    try {
      const status = await this.git.status();
      this.socketService.emitGitStatus({
        branch: status.current || 'unknown',
        ahead: status.ahead,
        behind: status.behind,
        modified: status.modified,
        staged: status.staged
      });
      return status;
    } catch {
      return null;
    }
  }

  async getDiff(staged: boolean = false): Promise<DiffResult[]> {
    try {
      const diffSummary = staged 
        ? await this.git.diffSummary(['--staged'])
        : await this.git.diffSummary();

      return diffSummary.files
        .filter((f): f is import('simple-git').DiffResultTextFile => 'insertions' in f)
        .map(f => ({
          file: f.file,
          additions: f.insertions,
          deletions: f.deletions,
          changes: `+${f.insertions} -${f.deletions}`,
          status: f.insertions > 0 && f.deletions === 0 ? 'added'
                : f.deletions > 0 && f.insertions === 0 ? 'deleted'
                : 'modified'
        }));
    } catch {
      return [];
    }
  }

  async getDiffWithRemote(branch?: string): Promise<DiffResult[]> {
    try {
      await this.git.fetch();
      const targetBranch = branch || this.currentRepo?.branch || 'main';
      const diffSummary = await this.git.diffSummary([`origin/${targetBranch}`]);

      return diffSummary.files
        .filter((f): f is import('simple-git').DiffResultTextFile => 'insertions' in f)
        .map(f => ({
          file: f.file,
          additions: f.insertions,
          deletions: f.deletions,
          changes: `+${f.insertions} -${f.deletions}`,
          status: 'modified'
        }));
    } catch {
      return [];
    }
  }

  async getFileDiff(filePath: string): Promise<string> {
    try {
      return await this.git.diff([filePath]);
    } catch {
      return '';
    }
  }

  async commit(message: string, files?: string[]): Promise<boolean> {
    try {
      if (files && files.length > 0) {
        await this.git.add(files);
      } else {
        await this.git.add('.');
      }
      await this.git.commit(message);
      return true;
    } catch {
      return false;
    }
  }

  async push(branch?: string): Promise<boolean> {
    try {
      const targetBranch = branch || this.currentRepo?.branch || 'main';
      await this.git.push('origin', targetBranch);
      return true;
    } catch {
      return false;
    }
  }

  async pull(branch?: string): Promise<boolean> {
    try {
      const targetBranch = branch || this.currentRepo?.branch || 'main';
      await this.git.pull('origin', targetBranch);
      return true;
    } catch {
      return false;
    }
  }

  async createBranch(name: string): Promise<boolean> {
    try {
      await this.git.checkoutLocalBranch(name);
      return true;
    } catch {
      return false;
    }
  }

  async switchBranch(name: string): Promise<boolean> {
    try {
      await this.git.checkout(name);
      return true;
    } catch {
      return false;
    }
  }

  async getBranches(): Promise<string[]> {
    try {
      const branches = await this.git.branch();
      return branches.all;
    } catch {
      return [];
    }
  }

  // GitHub API methods
  async getPullRequests(): Promise<PRInfo[]> {
    if (!this.octokit || !this.currentRepo) return [];

    try {
      const { data } = await this.octokit.rest.pulls.list({
        owner: this.currentRepo.owner,
        repo: this.currentRepo.repo,
        state: 'open'
      });

      return data.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        author: pr.user?.login || 'unknown',
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergeable: (pr as any).mergeable ?? null,
        draft: pr.draft || false,
        labels: pr.labels
          .filter((l): l is Exclude<typeof l, string> => typeof l !== 'string')
          .map(l => l.name || ''),
        reviewers: (pr.requested_reviewers || []).map((r: any) => r.login || r.name || 'unknown')
      }));
    } catch {
      return [];
    }
  }

  async createPullRequest(title: string, body: string, head: string, base: string = 'main'): Promise<number | null> {
    if (!this.octokit || !this.currentRepo) return null;

    try {
      const { data } = await this.octokit.rest.pulls.create({
        owner: this.currentRepo.owner,
        repo: this.currentRepo.repo,
        title,
        body,
        head,
        base
      });
      return data.number;
    } catch {
      return null;
    }
  }

  async mergePullRequest(prNumber: number): Promise<boolean> {
    if (!this.octokit || !this.currentRepo) return false;

    try {
      await this.octokit.rest.pulls.merge({
        owner: this.currentRepo.owner,
        repo: this.currentRepo.repo,
        pull_number: prNumber
      });
      return true;
    } catch {
      return false;
    }
  }

  async getCommitHistory(limit: number = 20): Promise<Array<{
    hash: string;
    message: string;
    author: string;
    date: string;
  }>> {
    try {
      const log = await this.git.log({ maxCount: limit });
      return log.all.map(c => ({
        hash: c.hash.substring(0, 7),
        message: c.message,
        author: c.author_name,
        date: c.date
      }));
    } catch {
      return [];
    }
  }

  getCurrentRepo(): RepoInfo | null {
    return this.currentRepo;
  }
}
