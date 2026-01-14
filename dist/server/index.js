// src/server/index.ts
import express from "express";
import { createServer } from "http";
import { Server as SocketIO } from "socket.io";
import cors from "cors";
import { config } from "dotenv";
import chalk from "chalk";

// src/server/routes/api.ts
import { Router as Router6 } from "express";

// src/server/routes/claude.ts
import { Router } from "express";

// src/server/services/claude-code.ts
import { spawn } from "child_process";
import { EventEmitter } from "events";
var ClaudeCodeService = class extends EventEmitter {
  socketService;
  available = false;
  currentProcess = null;
  tasks = /* @__PURE__ */ new Map();
  plans = /* @__PURE__ */ new Map();
  claudePath = "claude";
  constructor(socketService) {
    super();
    this.socketService = socketService;
  }
  async initialize() {
    try {
      const check = spawn(this.claudePath, ["--version"], { shell: true });
      await new Promise((resolve, _reject) => {
        check.on("close", (code) => {
          if (code === 0) {
            this.available = true;
            resolve();
          } else {
            this.available = false;
            resolve();
          }
        });
        check.on("error", () => {
          this.available = false;
          resolve();
        });
      });
    } catch {
      this.available = false;
    }
  }
  isAvailable() {
    return this.available;
  }
  handleSocket(socket) {
    socket.on("claude:execute", async (data) => {
      const task = await this.executeTask(data.prompt, data.options);
      socket.emit("claude:task-created", task);
    });
    socket.on("claude:cancel", (taskId) => {
      this.cancelTask(taskId);
    });
    socket.on("claude:approve-plan", (planId) => {
      this.approvePlan(planId);
    });
    socket.on("claude:reject-plan", (planId) => {
      this.rejectPlan(planId);
    });
    socket.on("claude:ralph-loop", async (data) => {
      await this.startRalphLoop(data.prompt, data.options);
    });
  }
  async executeTask(prompt, options) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const task = {
      id: taskId,
      prompt,
      status: "pending",
      iterations: 0,
      maxIterations: options?.maxIterations || 1,
      output: [],
      startedAt: /* @__PURE__ */ new Date()
    };
    this.tasks.set(taskId, task);
    this.socketService.emitClaudeStatus({
      status: "thinking",
      currentTask: taskId
    });
    try {
      task.status = "running";
      const args = ["-p", prompt];
      if (options?.workingDir) {
        args.unshift("--cwd", options.workingDir);
      }
      this.currentProcess = spawn(this.claudePath, args, {
        shell: true,
        cwd: options?.workingDir
      });
      this.currentProcess.stdout?.on("data", (data) => {
        const output = data.toString();
        task.output.push(output);
        this.socketService.emitExecutionUpdate({
          taskId,
          status: "running",
          output,
          message: "Executing..."
        });
      });
      this.currentProcess.stderr?.on("data", (data) => {
        const output = data.toString();
        task.output.push(`[stderr] ${output}`);
      });
      await new Promise((resolve, _reject) => {
        this.currentProcess.on("close", (code) => {
          if (code === 0) {
            task.status = "success";
            resolve();
          } else {
            task.status = "error";
            task.error = `Process exited with code ${code}`;
            resolve();
          }
        });
        this.currentProcess.on("error", (err) => {
          task.status = "error";
          task.error = err.message;
          resolve();
        });
      });
      task.completedAt = /* @__PURE__ */ new Date();
      this.currentProcess = null;
    } catch (error) {
      task.status = "error";
      task.error = error instanceof Error ? error.message : "Unknown error";
      task.completedAt = /* @__PURE__ */ new Date();
    }
    this.socketService.emitClaudeStatus({ status: "idle" });
    this.socketService.emitExecutionUpdate({
      taskId,
      status: task.status,
      message: task.status === "error" ? task.error : "Completed"
    });
    return task;
  }
  async startRalphLoop(prompt, options) {
    const taskId = `ralph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const task = {
      id: taskId,
      prompt,
      status: "running",
      iterations: 0,
      maxIterations: options?.maxIterations || 20,
      output: [],
      startedAt: /* @__PURE__ */ new Date()
    };
    this.tasks.set(taskId, task);
    const ralphPrompt = `/ralph-loop "${prompt}" --max-iterations ${task.maxIterations}${options?.completionPromise ? ` --completion-promise "${options.completionPromise}"` : ""}`;
    return this.executeTask(ralphPrompt, { workingDir: options?.workingDir });
  }
  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (task && task.status === "running") {
      if (this.currentProcess) {
        this.currentProcess.kill("SIGTERM");
        this.currentProcess = null;
      }
      task.status = "cancelled";
      task.completedAt = /* @__PURE__ */ new Date();
      this.socketService.emitExecutionUpdate({
        taskId,
        status: "error",
        message: "Task cancelled by user"
      });
    }
  }
  async createExecutionPlan(description, steps) {
    const planId = `plan_${Date.now()}`;
    const plan = {
      id: planId,
      description,
      steps: steps.map((step, index) => ({
        ...step,
        id: `step_${index}`,
        status: "pending"
      })),
      approved: false,
      createdAt: /* @__PURE__ */ new Date()
    };
    this.plans.set(planId, plan);
    this.socketService.broadcast("claude:plan-created", plan);
    return plan;
  }
  approvePlan(planId) {
    const plan = this.plans.get(planId);
    if (plan) {
      plan.approved = true;
      this.socketService.broadcast("claude:plan-approved", { planId });
      this.executePlan(planId);
    }
  }
  rejectPlan(planId) {
    const plan = this.plans.get(planId);
    if (plan) {
      this.plans.delete(planId);
      this.socketService.broadcast("claude:plan-rejected", { planId });
    }
  }
  async executePlan(planId) {
    const plan = this.plans.get(planId);
    if (!plan || !plan.approved) return;
    for (const step of plan.steps) {
      const depsComplete = step.dependencies.every((depId) => {
        const dep = plan.steps.find((s) => s.id === depId);
        return dep?.status === "success";
      });
      if (!depsComplete) {
        step.status = "skipped";
        continue;
      }
      step.status = "running";
      this.socketService.broadcast("claude:step-update", { planId, step });
      if (step.command) {
        const result = await this.executeTask(step.command);
        step.status = result.status === "success" ? "success" : "error";
        step.output = result.output.join("\n");
      } else {
        step.status = "success";
      }
      this.socketService.broadcast("claude:step-update", { planId, step });
    }
  }
  getTask(taskId) {
    return this.tasks.get(taskId);
  }
  getAllTasks() {
    return Array.from(this.tasks.values());
  }
  getPlan(planId) {
    return this.plans.get(planId);
  }
  getAllPlans() {
    return Array.from(this.plans.values());
  }
};

// src/server/routes/claude.ts
var router = Router();
var claudeService = new ClaudeCodeService();
router.get("/status", async (_req, res) => {
  try {
    const status = claudeService.getStatus();
    sendResponse(res, status);
  } catch (error) {
    sendError(res, error.message);
  }
});
router.get("/check", async (_req, res) => {
  try {
    const available = await claudeService.checkAvailability();
    sendResponse(res, { available });
  } catch (error) {
    sendError(res, error.message);
  }
});
router.post("/execute", async (req, res) => {
  try {
    const request = req.body;
    if (!request.prompt) {
      return sendError(res, "Prompt is required", 400);
    }
    const result = await claudeService.execute(
      request.prompt,
      request.workingDir,
      {
        allowedTools: request.allowedTools,
        maxIterations: request.maxIterations,
        dangerouslySkipPermissions: request.dangerouslySkipPermissions,
        outputFormat: request.outputFormat
      }
    );
    sendResponse(res, result);
  } catch (error) {
    sendError(res, error.message);
  }
});
router.post("/execute-loop", async (req, res) => {
  try {
    const { prompt, workingDir, maxIterations = 10, approvalRequired = true } = req.body;
    if (!prompt) {
      return sendError(res, "Prompt is required", 400);
    }
    const result = await claudeService.executeWithRalphLoop(
      prompt,
      workingDir || process.cwd(),
      { maxIterations, stopOnError: true, approvalRequired }
    );
    sendResponse(res, result);
  } catch (error) {
    sendError(res, error.message);
  }
});
router.get("/history", async (_req, res) => {
  try {
    const history = claudeService.getExecutionHistory();
    sendResponse(res, history);
  } catch (error) {
    sendError(res, error.message);
  }
});
router.get("/execution/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const execution = claudeService.getExecution(taskId);
    if (!execution) {
      return sendError(res, "Execution not found", 404);
    }
    sendResponse(res, execution);
  } catch (error) {
    sendError(res, error.message);
  }
});
router.post("/cancel/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const cancelled = claudeService.cancelExecution(taskId);
    if (!cancelled) {
      return sendError(res, "Could not cancel execution", 400);
    }
    sendResponse(res, { cancelled: true, taskId });
  } catch (error) {
    sendError(res, error.message);
  }
});
router.post("/plan", async (req, res) => {
  try {
    const plan = req.body;
    if (!plan.name || !plan.tasks?.length) {
      return sendError(res, "Plan name and tasks are required", 400);
    }
    const createdPlan = claudeService.createPlan(plan);
    sendResponse(res, createdPlan, 201);
  } catch (error) {
    sendError(res, error.message);
  }
});
router.get("/plans", async (_req, res) => {
  try {
    const plans = claudeService.getAllPlans();
    sendResponse(res, plans);
  } catch (error) {
    sendError(res, error.message);
  }
});
router.get("/plan/:planId", async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = claudeService.getPlan(planId);
    if (!plan) {
      return sendError(res, "Plan not found", 404);
    }
    sendResponse(res, plan);
  } catch (error) {
    sendError(res, error.message);
  }
});
router.post("/plan/:planId/approve", async (req, res) => {
  try {
    const { planId } = req.params;
    const { approvedBy } = req.body;
    const approved = claudeService.approvePlan(planId, approvedBy);
    if (!approved) {
      return sendError(res, "Could not approve plan", 400);
    }
    sendResponse(res, { approved: true, planId });
  } catch (error) {
    sendError(res, error.message);
  }
});
router.post("/plan/:planId/execute", async (req, res) => {
  try {
    const { planId } = req.params;
    const result = await claudeService.executePlan(planId);
    sendResponse(res, result);
  } catch (error) {
    sendError(res, error.message);
  }
});
router.get("/ralph/status", async (_req, res) => {
  try {
    const status = claudeService.getRalphLoopStatus();
    sendResponse(res, status);
  } catch (error) {
    sendError(res, error.message);
  }
});
router.post("/ralph/stop", async (_req, res) => {
  try {
    const stopped = claudeService.stopRalphLoop();
    sendResponse(res, { stopped });
  } catch (error) {
    sendError(res, error.message);
  }
});
var claude_default = router;

// src/server/routes/github.ts
import { Router as Router2 } from "express";

// src/server/services/github.ts
import { Octokit } from "octokit";
import simpleGit from "simple-git";
var GitHubService = class {
  octokit = null;
  socketService;
  authenticated = false;
  git;
  currentRepo = null;
  constructor(socketService) {
    this.socketService = socketService;
    this.git = simpleGit();
  }
  async initialize() {
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      this.octokit = new Octokit({ auth: token });
      try {
        await this.octokit.rest.users.getAuthenticated();
        this.authenticated = true;
        console.log("\u2713 GitHub authenticated");
      } catch {
        this.authenticated = false;
        console.warn("\u26A0 GitHub token invalid");
      }
    }
  }
  isAuthenticated() {
    return this.authenticated;
  }
  async setWorkingDirectory(path3) {
    try {
      this.git = simpleGit(path3);
      const isRepo = await this.git.checkIsRepo();
      if (isRepo) {
        const remotes = await this.git.getRemotes(true);
        const origin = remotes.find((r) => r.name === "origin");
        const branch = await this.git.branch();
        if (origin?.refs?.fetch) {
          const match = origin.refs.fetch.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
          if (match) {
            this.currentRepo = {
              owner: match[1],
              repo: match[2],
              branch: branch.current,
              remoteUrl: origin.refs.fetch,
              localPath: path3
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
  async getStatus() {
    try {
      const status = await this.git.status();
      this.socketService.emitGitStatus({
        branch: status.current || "unknown",
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
  async getDiff(staged = false) {
    try {
      const diffSummary = staged ? await this.git.diffSummary(["--staged"]) : await this.git.diffSummary();
      return diffSummary.files.filter((f) => "insertions" in f).map((f) => ({
        file: f.file,
        additions: f.insertions,
        deletions: f.deletions,
        changes: `+${f.insertions} -${f.deletions}`,
        status: f.insertions > 0 && f.deletions === 0 ? "added" : f.deletions > 0 && f.insertions === 0 ? "deleted" : "modified"
      }));
    } catch {
      return [];
    }
  }
  async getDiffWithRemote(branch) {
    try {
      await this.git.fetch();
      const targetBranch = branch || this.currentRepo?.branch || "main";
      const diffSummary = await this.git.diffSummary([`origin/${targetBranch}`]);
      return diffSummary.files.filter((f) => "insertions" in f).map((f) => ({
        file: f.file,
        additions: f.insertions,
        deletions: f.deletions,
        changes: `+${f.insertions} -${f.deletions}`,
        status: "modified"
      }));
    } catch {
      return [];
    }
  }
  async getFileDiff(filePath) {
    try {
      return await this.git.diff([filePath]);
    } catch {
      return "";
    }
  }
  async commit(message, files) {
    try {
      if (files && files.length > 0) {
        await this.git.add(files);
      } else {
        await this.git.add(".");
      }
      await this.git.commit(message);
      return true;
    } catch {
      return false;
    }
  }
  async push(branch) {
    try {
      const targetBranch = branch || this.currentRepo?.branch || "main";
      await this.git.push("origin", targetBranch);
      return true;
    } catch {
      return false;
    }
  }
  async pull(branch) {
    try {
      const targetBranch = branch || this.currentRepo?.branch || "main";
      await this.git.pull("origin", targetBranch);
      return true;
    } catch {
      return false;
    }
  }
  async createBranch(name) {
    try {
      await this.git.checkoutLocalBranch(name);
      return true;
    } catch {
      return false;
    }
  }
  async switchBranch(name) {
    try {
      await this.git.checkout(name);
      return true;
    } catch {
      return false;
    }
  }
  async getBranches() {
    try {
      const branches = await this.git.branch();
      return branches.all;
    } catch {
      return [];
    }
  }
  // GitHub API methods
  async getPullRequests() {
    if (!this.octokit || !this.currentRepo) return [];
    try {
      const { data } = await this.octokit.rest.pulls.list({
        owner: this.currentRepo.owner,
        repo: this.currentRepo.repo,
        state: "open"
      });
      return data.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        author: pr.user?.login || "unknown",
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergeable: pr.mergeable ?? null,
        draft: pr.draft || false,
        labels: pr.labels.filter((l) => typeof l !== "string").map((l) => l.name || ""),
        reviewers: (pr.requested_reviewers || []).map((r) => r.login || r.name || "unknown")
      }));
    } catch {
      return [];
    }
  }
  async createPullRequest(title, body, head, base = "main") {
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
  async mergePullRequest(prNumber) {
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
  async getCommitHistory(limit = 20) {
    try {
      const log = await this.git.log({ maxCount: limit });
      return log.all.map((c) => ({
        hash: c.hash.substring(0, 7),
        message: c.message,
        author: c.author_name,
        date: c.date
      }));
    } catch {
      return [];
    }
  }
  getCurrentRepo() {
    return this.currentRepo;
  }
};

// src/server/routes/github.ts
var router2 = Router2();
function getService(repoPath) {
  return new GitHubService(repoPath || process.cwd());
}
router2.get("/status", async (req, res) => {
  try {
    const repoPath = req.query.path;
    const service = getService(repoPath);
    const status = await service.getStatus();
    sendResponse(res, status);
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.get("/branches", async (req, res) => {
  try {
    const repoPath = req.query.path;
    const service = getService(repoPath);
    const branches = await service.getBranches();
    sendResponse(res, branches);
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.post("/checkout", async (req, res) => {
  try {
    const { branch, path: repoPath, create } = req.body;
    if (!branch) {
      return sendError(res, "Branch name is required", 400);
    }
    const service = getService(repoPath);
    await service.checkout(branch, create);
    sendResponse(res, { success: true, branch });
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.get("/log", async (req, res) => {
  try {
    const repoPath = req.query.path;
    const limit = parseInt(req.query.limit) || 50;
    const service = getService(repoPath);
    const commits = await service.getLog(limit);
    sendResponse(res, commits);
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.post("/stage", async (req, res) => {
  try {
    const { files, path: repoPath } = req.body;
    const service = getService(repoPath);
    await service.stage(files || ["."]);
    sendResponse(res, { staged: true });
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.post("/unstage", async (req, res) => {
  try {
    const { files, path: repoPath } = req.body;
    const service = getService(repoPath);
    await service.unstage(files);
    sendResponse(res, { unstaged: true });
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.post("/commit", async (req, res) => {
  try {
    const { message, path: repoPath } = req.body;
    if (!message) {
      return sendError(res, "Commit message is required", 400);
    }
    const service = getService(repoPath);
    const commit = await service.commit(message);
    sendResponse(res, commit);
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.post("/push", async (req, res) => {
  try {
    const { branch, path: repoPath, force } = req.body;
    const service = getService(repoPath);
    await service.push(branch, force);
    sendResponse(res, { pushed: true });
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.post("/pull", async (req, res) => {
  try {
    const { branch, path: repoPath, rebase } = req.body;
    const service = getService(repoPath);
    await service.pull(branch, rebase);
    sendResponse(res, { pulled: true });
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.get("/diff", async (req, res) => {
  try {
    const repoPath = req.query.path;
    const file = req.query.file;
    const staged = req.query.staged === "true";
    const service = getService(repoPath);
    const diff = await service.getDiff(file, staged);
    sendResponse(res, diff);
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.get("/compare", async (req, res) => {
  try {
    const repoPath = req.query.path;
    const branch = req.query.branch;
    const service = getService(repoPath);
    const comparison = await service.compareWithRemote(branch);
    sendResponse(res, comparison);
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.post("/fetch", async (req, res) => {
  try {
    const { path: repoPath, prune } = req.body;
    const service = getService(repoPath);
    await service.fetch(prune);
    sendResponse(res, { fetched: true });
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.post("/merge", async (req, res) => {
  try {
    const { branch, path: repoPath, noFf } = req.body;
    if (!branch) {
      return sendError(res, "Branch name is required", 400);
    }
    const service = getService(repoPath);
    await service.merge(branch, noFf);
    sendResponse(res, { merged: true, branch });
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.post("/stash", async (req, res) => {
  try {
    const { message, path: repoPath } = req.body;
    const service = getService(repoPath);
    await service.stash(message);
    sendResponse(res, { stashed: true });
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.post("/stash/pop", async (req, res) => {
  try {
    const { path: repoPath } = req.body;
    const service = getService(repoPath);
    await service.stashPop();
    sendResponse(res, { popped: true });
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.get("/stash", async (req, res) => {
  try {
    const repoPath = req.query.path;
    const service = getService(repoPath);
    const stashes = await service.listStashes();
    sendResponse(res, stashes);
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.get("/prs", async (req, res) => {
  try {
    const repoPath = req.query.path;
    const state = req.query.state || "open";
    const service = getService(repoPath);
    const prs = await service.listPullRequests(state);
    sendResponse(res, prs);
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.get("/pr/:number", async (req, res) => {
  try {
    const repoPath = req.query.path;
    const prNumber = parseInt(req.params.number);
    const service = getService(repoPath);
    const pr = await service.getPullRequest(prNumber);
    sendResponse(res, pr);
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.post("/pr", async (req, res) => {
  try {
    const { title, body, head, base, path: repoPath, draft } = req.body;
    if (!title || !head) {
      return sendError(res, "Title and head branch are required", 400);
    }
    const service = getService(repoPath);
    const pr = await service.createPullRequest({
      title,
      body,
      head,
      base: base || "main",
      draft
    });
    sendResponse(res, pr, 201);
  } catch (error) {
    sendError(res, error.message);
  }
});
router2.post("/pr/:number/merge", async (req, res) => {
  try {
    const repoPath = req.query.path;
    const prNumber = parseInt(req.params.number);
    const { mergeMethod } = req.body;
    const service = getService(repoPath);
    await service.mergePullRequest(prNumber, mergeMethod);
    sendResponse(res, { merged: true, pr: prNumber });
  } catch (error) {
    sendError(res, error.message);
  }
});
var github_default = router2;

// src/server/routes/qdrant.ts
import { Router as Router3 } from "express";

// src/server/services/qdrant.ts
import { QdrantClient } from "@qdrant/js-client-rest";
var QdrantService = class {
  client = null;
  socketService;
  connected = false;
  qdrantUrl;
  // FazAI-NG collections
  COLLECTIONS = [
    "fazai_personality",
    "fazai_memory",
    "fazai_learning",
    "fazai_kb",
    "fazai_inference",
    "fazai_source",
    "fazai_semantic_cache",
    "claudio_soul",
    "claudio_sources"
  ];
  constructor(socketService) {
    this.socketService = socketService;
    this.qdrantUrl = process.env.QDRANT_URL || "http://localhost:6363";
  }
  async connect() {
    try {
      this.client = new QdrantClient({
        url: this.qdrantUrl,
        timeout: 1e4
      });
      await this.client.getCollections();
      this.connected = true;
      console.log(`\u2713 Connected to Qdrant at ${this.qdrantUrl}`);
    } catch (error) {
      console.warn(`\u26A0 Could not connect to Qdrant: ${error}`);
      this.connected = false;
    }
  }
  async disconnect() {
    this.client = null;
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }
  async getCollections() {
    if (!this.client) return [];
    try {
      const response = await this.client.getCollections();
      const collections = [];
      for (const col of response.collections) {
        try {
          const info = await this.client.getCollection(col.name);
          collections.push({
            name: col.name,
            vectorsCount: info.indexed_vectors_count || 0,
            indexedVectorsCount: info.indexed_vectors_count || 0,
            pointsCount: info.points_count || 0,
            segmentsCount: info.segments_count || 0,
            status: info.status,
            vectorSize: typeof info.config?.params?.vectors === "object" ? info.config.params.vectors.size || 768 : 768,
            distance: typeof info.config?.params?.vectors === "object" ? info.config.params.vectors.distance || "Cosine" : "Cosine"
          });
        } catch {
        }
      }
      return collections;
    } catch (error) {
      console.error("Error getting collections:", error);
      return [];
    }
  }
  async search(collectionName, vector, limit = 10, filter) {
    if (!this.client) return [];
    try {
      const results = await this.client.search(collectionName, {
        vector,
        limit,
        filter,
        with_payload: true,
        with_vector: false
      });
      this.socketService.emitQdrantUpdate({
        collection: collectionName,
        action: "search",
        count: results.length
      });
      return results.map((r) => ({
        id: r.id,
        score: r.score,
        payload: r.payload
      }));
    } catch (error) {
      console.error(`Search error in ${collectionName}:`, error);
      return [];
    }
  }
  async searchMultiCollection(_query, collections) {
    const targetCollections = collections || this.COLLECTIONS;
    const results = /* @__PURE__ */ new Map();
    for (const col of targetCollections) {
      results.set(col, []);
    }
    return results;
  }
  async upsert(collectionName, points) {
    if (!this.client) return false;
    try {
      await this.client.upsert(collectionName, {
        wait: true,
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload
        }))
      });
      this.socketService.emitQdrantUpdate({
        collection: collectionName,
        action: "upsert",
        count: points.length
      });
      return true;
    } catch (error) {
      console.error(`Upsert error in ${collectionName}:`, error);
      return false;
    }
  }
  async deletePoints(collectionName, ids) {
    if (!this.client) return false;
    try {
      await this.client.delete(collectionName, {
        wait: true,
        points: ids
      });
      this.socketService.emitQdrantUpdate({
        collection: collectionName,
        action: "delete",
        count: ids.length
      });
      return true;
    } catch (error) {
      console.error(`Delete error in ${collectionName}:`, error);
      return false;
    }
  }
  async getPoint(collectionName, id) {
    if (!this.client) return null;
    try {
      const result = await this.client.retrieve(collectionName, {
        ids: [id],
        with_payload: true,
        with_vector: true
      });
      if (result.length > 0) {
        return {
          id: result[0].id,
          score: 1,
          payload: result[0].payload,
          vector: result[0].vector
        };
      }
      return null;
    } catch (error) {
      console.error(`Get point error in ${collectionName}:`, error);
      return null;
    }
  }
  async scroll(collectionName, limit = 100, offset) {
    if (!this.client) return { points: [] };
    try {
      const result = await this.client.scroll(collectionName, {
        limit,
        offset,
        with_payload: true,
        with_vector: false
      });
      return {
        points: result.points.map((p) => ({
          id: p.id,
          score: 1,
          payload: p.payload
        })),
        nextOffset: result.next_page_offset
      };
    } catch (error) {
      console.error(`Scroll error in ${collectionName}:`, error);
      return { points: [] };
    }
  }
  async createCollection(name, vectorSize = 768) {
    if (!this.client) return false;
    try {
      await this.client.createCollection(name, {
        vectors: {
          size: vectorSize,
          distance: "Cosine"
        }
      });
      return true;
    } catch (error) {
      console.error(`Create collection error:`, error);
      return false;
    }
  }
  async deleteCollection(name) {
    if (!this.client) return false;
    try {
      await this.client.deleteCollection(name);
      return true;
    } catch (error) {
      console.error(`Delete collection error:`, error);
      return false;
    }
  }
  // ECOA-specific: Store execution block
  async storeExecutionBlock(block) {
    const id = `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return this.upsert("fazai_learning", [{
      id,
      vector: block.vector,
      payload: {
        content: block.content,
        source_context: block.sourceContext,
        valid_destinations: block.validDestinations,
        destination_hints: block.destinationHints,
        verified: true,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        use_count: 0,
        success_count: 0
      }
    }]);
  }
  // ECOA-specific: Find blocks by destination
  async findBlocksByDestination(destination, limit = 10) {
    if (!this.client) return [];
    try {
      const result = await this.client.scroll("fazai_learning", {
        limit,
        filter: {
          should: [
            {
              key: "valid_destinations",
              match: { value: destination }
            },
            {
              key: "valid_destinations",
              match: { value: "*" }
            }
          ]
        },
        with_payload: true
      });
      return result.points.map((p) => ({
        id: p.id,
        score: 1,
        payload: p.payload
      }));
    } catch (error) {
      console.error("Find blocks error:", error);
      return [];
    }
  }
};

// src/server/routes/qdrant.ts
var router3 = Router3();
var qdrantService = new QdrantService();
router3.get("/health", async (_req, res) => {
  try {
    const healthy = await qdrantService.healthCheck();
    sendResponse(res, { healthy, url: process.env.QDRANT_URL || "http://localhost:6363" });
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.get("/collections", async (_req, res) => {
  try {
    const collections = await qdrantService.listCollections();
    sendResponse(res, collections);
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.get("/collection/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const info = await qdrantService.getCollectionInfo(name);
    if (!info) {
      return sendError(res, "Collection not found", 404);
    }
    sendResponse(res, info);
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.post("/collection", async (req, res) => {
  try {
    const { name, vectorSize, distance } = req.body;
    if (!name || !vectorSize) {
      return sendError(res, "Name and vectorSize are required", 400);
    }
    await qdrantService.createCollection(name, vectorSize, distance || "Cosine");
    sendResponse(res, { created: true, name }, 201);
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.delete("/collection/:name", async (req, res) => {
  try {
    const { name } = req.params;
    await qdrantService.deleteCollection(name);
    sendResponse(res, { deleted: true, name });
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.post("/search", async (req, res) => {
  try {
    const request = req.body;
    if (!request.collection || !request.query) {
      return sendError(res, "Collection and query are required", 400);
    }
    const results = await qdrantService.search(request);
    sendResponse(res, results);
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.post("/semantic-search", async (req, res) => {
  try {
    const { collection, text, limit, filter, collections } = req.body;
    if (!text) {
      return sendError(res, "Text query is required", 400);
    }
    if (collections && Array.isArray(collections)) {
      const results2 = await qdrantService.searchMultipleCollections(
        text,
        collections,
        limit || 10
      );
      return sendResponse(res, results2);
    }
    if (!collection) {
      return sendError(res, "Collection name is required", 400);
    }
    const results = await qdrantService.semanticSearch(collection, text, limit, filter);
    sendResponse(res, results);
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.post("/points", async (req, res) => {
  try {
    const { collection, points } = req.body;
    if (!collection || !points || !Array.isArray(points)) {
      return sendError(res, "Collection and points array are required", 400);
    }
    await qdrantService.upsertPoints(collection, points);
    sendResponse(res, { upserted: true, count: points.length });
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.post("/points/get", async (req, res) => {
  try {
    const { collection, ids, withPayload, withVector } = req.body;
    if (!collection || !ids || !Array.isArray(ids)) {
      return sendError(res, "Collection and IDs array are required", 400);
    }
    const points = await qdrantService.getPoints(collection, ids, withPayload, withVector);
    sendResponse(res, points);
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.delete("/points", async (req, res) => {
  try {
    const { collection, ids, filter } = req.body;
    if (!collection || !ids && !filter) {
      return sendError(res, "Collection and IDs or filter are required", 400);
    }
    await qdrantService.deletePoints(collection, ids, filter);
    sendResponse(res, { deleted: true });
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.get("/scroll/:collection", async (req, res) => {
  try {
    const { collection } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const offset = req.query.offset;
    const withPayload = req.query.withPayload !== "false";
    const withVector = req.query.withVector === "true";
    const result = await qdrantService.scroll(collection, limit, offset, withPayload, withVector);
    sendResponse(res, result);
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.get("/count/:collection", async (req, res) => {
  try {
    const { collection } = req.params;
    const count = await qdrantService.countPoints(collection);
    sendResponse(res, { collection, count });
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.get("/ecoa/collections", async (_req, res) => {
  try {
    const collections = await qdrantService.getECOACollections();
    sendResponse(res, collections);
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.post("/ecoa/retrieve", async (req, res) => {
  try {
    const { query, collections, limit, threshold, destinationHints } = req.body;
    if (!query) {
      return sendError(res, "Query is required", 400);
    }
    const results = await qdrantService.ecoaRetrieve({
      text: query,
      collections,
      limit,
      threshold,
      destinationHints
    });
    sendResponse(res, results);
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.post("/ecoa/store", async (req, res) => {
  try {
    const { collection, content, metadata, type } = req.body;
    if (!collection || !content) {
      return sendError(res, "Collection and content are required", 400);
    }
    const id = await qdrantService.ecoaStore(collection, content, metadata, type);
    sendResponse(res, { stored: true, id }, 201);
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.post("/ecoa/index-file", async (req, res) => {
  try {
    const { filePath, content, language } = req.body;
    if (!filePath || !content) {
      return sendError(res, "File path and content are required", 400);
    }
    await qdrantService.indexCodeFile(filePath, content, language);
    sendResponse(res, { indexed: true, filePath });
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.post("/ecoa/index-batch", async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return sendError(res, "Files array is required", 400);
    }
    const results = await qdrantService.batchIndexFiles(files);
    sendResponse(res, {
      indexed: results.success,
      failed: results.failed,
      total: files.length
    });
  } catch (error) {
    sendError(res, error.message);
  }
});
router3.post("/ecoa/search-code", async (req, res) => {
  try {
    const { query, language, limit } = req.body;
    if (!query) {
      return sendError(res, "Query is required", 400);
    }
    const results = await qdrantService.searchCode(query, language, limit);
    sendResponse(res, results);
  } catch (error) {
    sendError(res, error.message);
  }
});
var qdrant_default = router3;

// src/server/routes/terminal.ts
import { Router as Router4 } from "express";

// src/server/services/terminal.ts
import * as pty from "node-pty";
import { EventEmitter as EventEmitter2 } from "events";
import os from "os";
var DEFAULT_SHELL = os.platform() === "win32" ? "powershell.exe" : process.env.SHELL || "/bin/bash";
var TerminalService = class extends EventEmitter2 {
  sessions = /* @__PURE__ */ new Map();
  outputBuffers = /* @__PURE__ */ new Map();
  maxBufferSize = 1e4;
  // Max lines to buffer
  constructor() {
    super();
  }
  create(options = {}) {
    const sessionId = `term_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const cols = options.cols || 120;
    const rows = options.rows || 40;
    const cwd = options.cwd || process.cwd();
    const shell = options.shell || DEFAULT_SHELL;
    const env = {
      ...process.env,
      ...options.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor"
    };
    const shellArgs = os.platform() === "win32" ? [] : ["--login"];
    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env
    });
    const session = {
      id: sessionId,
      pty: ptyProcess,
      cols,
      rows,
      cwd,
      shell,
      createdAt: /* @__PURE__ */ new Date(),
      lastActivity: /* @__PURE__ */ new Date()
    };
    this.sessions.set(sessionId, session);
    this.outputBuffers.set(sessionId, []);
    ptyProcess.onData((data) => {
      session.lastActivity = /* @__PURE__ */ new Date();
      const buffer = this.outputBuffers.get(sessionId) || [];
      buffer.push(data);
      if (buffer.length > this.maxBufferSize) {
        buffer.shift();
      }
      this.outputBuffers.set(sessionId, buffer);
      const output = {
        sessionId,
        data,
        timestamp: /* @__PURE__ */ new Date()
      };
      this.emit("output", output);
    });
    ptyProcess.onExit(({ exitCode, signal }) => {
      this.emit("exit", { sessionId, exitCode, signal });
      this.sessions.delete(sessionId);
      this.outputBuffers.delete(sessionId);
    });
    this.emit("created", { sessionId, shell, cwd });
    return session;
  }
  write(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.pty.write(data);
    session.lastActivity = /* @__PURE__ */ new Date();
    return true;
  }
  resize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.pty.resize(cols, rows);
    session.cols = cols;
    session.rows = rows;
    return true;
  }
  kill(sessionId, signal) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.pty.kill(signal);
    return true;
  }
  destroy(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    try {
      session.pty.kill();
    } catch {
    }
    this.sessions.delete(sessionId);
    this.outputBuffers.delete(sessionId);
    this.emit("destroyed", { sessionId });
    return true;
  }
  destroyAll() {
    for (const sessionId of this.sessions.keys()) {
      this.destroy(sessionId);
    }
  }
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }
  getAllSessions() {
    return Array.from(this.sessions.values());
  }
  getSessionIds() {
    return Array.from(this.sessions.keys());
  }
  getOutputBuffer(sessionId) {
    return this.outputBuffers.get(sessionId) || [];
  }
  getFullOutput(sessionId) {
    const buffer = this.outputBuffers.get(sessionId);
    return buffer ? buffer.join("") : "";
  }
  clearOutputBuffer(sessionId) {
    if (!this.sessions.has(sessionId)) return false;
    this.outputBuffers.set(sessionId, []);
    return true;
  }
  // Execute single command and return output
  async exec(command, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 3e4;
      const session = this.create(options);
      let output = "";
      let resolved = false;
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.destroy(session.id);
          reject(new Error(`Command timed out after ${timeout}ms`));
        }
      }, timeout);
      const cleanup = () => {
        clearTimeout(timeoutId);
        this.removeListener("output", onOutput);
        this.removeListener("exit", onExit);
      };
      const onOutput = (data) => {
        if (data.sessionId === session.id) {
          output += data.data;
        }
      };
      const onExit = (data) => {
        if (data.sessionId === session.id && !resolved) {
          resolved = true;
          cleanup();
          resolve({ output, exitCode: data.exitCode });
        }
      };
      this.on("output", onOutput);
      this.on("exit", onExit);
      const exitCmd = os.platform() === "win32" ? "\r\nexit\r\n" : "\nexit\n";
      session.pty.write(command + exitCmd);
    });
  }
  // Check if session is active
  isActive(sessionId) {
    return this.sessions.has(sessionId);
  }
  // Get session count
  getSessionCount() {
    return this.sessions.size;
  }
  // Get sessions by shell type
  getSessionsByShell(shell) {
    return Array.from(this.sessions.values()).filter((s) => s.shell.includes(shell));
  }
  // Get idle sessions (no activity for specified ms)
  getIdleSessions(idleMs = 3e5) {
    const now = Date.now();
    return Array.from(this.sessions.values()).filter((s) => now - s.lastActivity.getTime() > idleMs);
  }
  // Clean up idle sessions
  cleanupIdleSessions(idleMs = 3e5) {
    const idle = this.getIdleSessions(idleMs);
    for (const session of idle) {
      this.destroy(session.id);
    }
    return idle.length;
  }
};
var terminalService = new TerminalService();

// src/server/routes/terminal.ts
var router4 = Router4();
router4.get("/sessions", (_req, res) => {
  try {
    const sessions = terminalService.getAllSessions().map((s) => ({
      id: s.id,
      shell: s.shell,
      cwd: s.cwd,
      cols: s.cols,
      rows: s.rows,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity
    }));
    sendResponse(res, sessions);
  } catch (error) {
    sendError(res, error.message);
  }
});
router4.post("/session", (req, res) => {
  try {
    const options = req.body;
    const session = terminalService.create(options);
    sendResponse(res, {
      id: session.id,
      shell: session.shell,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      createdAt: session.createdAt
    }, 201);
  } catch (error) {
    sendError(res, error.message);
  }
});
router4.get("/session/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = terminalService.getSession(sessionId);
    if (!session) {
      return sendError(res, "Session not found", 404);
    }
    sendResponse(res, {
      id: session.id,
      shell: session.shell,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    });
  } catch (error) {
    sendError(res, error.message);
  }
});
router4.post("/session/:sessionId/write", (req, res) => {
  try {
    const { sessionId } = req.params;
    const { data } = req.body;
    if (data === void 0) {
      return sendError(res, "Data is required", 400);
    }
    const success = terminalService.write(sessionId, data);
    if (!success) {
      return sendError(res, "Session not found", 404);
    }
    sendResponse(res, { written: true });
  } catch (error) {
    sendError(res, error.message);
  }
});
router4.post("/session/:sessionId/resize", (req, res) => {
  try {
    const { sessionId } = req.params;
    const { cols, rows } = req.body;
    if (!cols || !rows) {
      return sendError(res, "Cols and rows are required", 400);
    }
    const success = terminalService.resize(sessionId, cols, rows);
    if (!success) {
      return sendError(res, "Session not found", 404);
    }
    sendResponse(res, { resized: true, cols, rows });
  } catch (error) {
    sendError(res, error.message);
  }
});
router4.get("/session/:sessionId/output", (req, res) => {
  try {
    const { sessionId } = req.params;
    const full = req.query.full === "true";
    if (!terminalService.isActive(sessionId)) {
      return sendError(res, "Session not found", 404);
    }
    const output = full ? terminalService.getFullOutput(sessionId) : terminalService.getOutputBuffer(sessionId);
    sendResponse(res, { output });
  } catch (error) {
    sendError(res, error.message);
  }
});
router4.post("/session/:sessionId/clear", (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = terminalService.clearOutputBuffer(sessionId);
    if (!success) {
      return sendError(res, "Session not found", 404);
    }
    sendResponse(res, { cleared: true });
  } catch (error) {
    sendError(res, error.message);
  }
});
router4.post("/session/:sessionId/kill", (req, res) => {
  try {
    const { sessionId } = req.params;
    const { signal } = req.body;
    const success = terminalService.kill(sessionId, signal);
    if (!success) {
      return sendError(res, "Session not found", 404);
    }
    sendResponse(res, { killed: true });
  } catch (error) {
    sendError(res, error.message);
  }
});
router4.delete("/session/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = terminalService.destroy(sessionId);
    if (!success) {
      return sendError(res, "Session not found", 404);
    }
    sendResponse(res, { destroyed: true });
  } catch (error) {
    sendError(res, error.message);
  }
});
router4.post("/exec", async (req, res) => {
  try {
    const { command, cwd, shell, timeout } = req.body;
    if (!command) {
      return sendError(res, "Command is required", 400);
    }
    const result = await terminalService.exec(command, { cwd, shell, timeout });
    sendResponse(res, result);
  } catch (error) {
    sendError(res, error.message);
  }
});
router4.get("/stats", (_req, res) => {
  try {
    const sessions = terminalService.getAllSessions();
    const idle = terminalService.getIdleSessions(3e5);
    sendResponse(res, {
      total: sessions.length,
      idle: idle.length,
      shells: sessions.reduce((acc, s) => {
        const shell = s.shell.split("/").pop() || s.shell;
        acc[shell] = (acc[shell] || 0) + 1;
        return acc;
      }, {})
    });
  } catch (error) {
    sendError(res, error.message);
  }
});
router4.post("/cleanup", (req, res) => {
  try {
    const { idleMs } = req.body;
    const cleaned = terminalService.cleanupIdleSessions(idleMs || 3e5);
    sendResponse(res, { cleaned });
  } catch (error) {
    sendError(res, error.message);
  }
});
router4.delete("/sessions", (_req, res) => {
  try {
    const count = terminalService.getSessionCount();
    terminalService.destroyAll();
    sendResponse(res, { destroyed: count });
  } catch (error) {
    sendError(res, error.message);
  }
});
var terminal_default = router4;

// src/server/routes/files.ts
import { Router as Router5 } from "express";
import fs2 from "fs/promises";
import path2 from "path";

// src/server/services/file-watcher.ts
import chokidar from "chokidar";
import { EventEmitter as EventEmitter3 } from "events";
import fs from "fs/promises";
import path from "path";
var DEFAULT_IGNORED = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.cache/**",
  "**/coverage/**",
  "**/*.log",
  "**/.DS_Store",
  "**/Thumbs.db"
];
var FileWatcherService = class extends EventEmitter3 {
  watchers = /* @__PURE__ */ new Map();
  watchedPaths = /* @__PURE__ */ new Map();
  constructor() {
    super();
  }
  async watch(basePath, options = {}) {
    const watchId = `watch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const watchOptions = {
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
    watcher.on("add", (filePath) => this.handleFileEvent("add", basePath, filePath)).on("change", (filePath) => this.handleFileEvent("change", basePath, filePath)).on("unlink", (filePath) => this.handleFileEvent("unlink", basePath, filePath)).on("addDir", (filePath) => this.handleFileEvent("addDir", basePath, filePath)).on("unlinkDir", (filePath) => this.handleFileEvent("unlinkDir", basePath, filePath)).on("error", (error) => this.emit("error", { watchId, error })).on("ready", () => this.emit("ready", { watchId, basePath }));
    this.watchers.set(watchId, watcher);
    this.watchedPaths.set(watchId, [basePath]);
    return watchId;
  }
  async handleFileEvent(type, basePath, filePath) {
    const relativePath = path.relative(basePath, filePath);
    const event = {
      type,
      path: filePath,
      relativePath
    };
    if (type !== "unlink" && type !== "unlinkDir") {
      try {
        const stats = await fs.stat(filePath);
        event.stats = {
          size: stats.size,
          mtime: stats.mtime,
          isDirectory: stats.isDirectory()
        };
        if (!stats.isDirectory() && stats.size < 1e5) {
          const ext = path.extname(filePath).toLowerCase();
          const textExtensions = [
            ".ts",
            ".tsx",
            ".js",
            ".jsx",
            ".json",
            ".md",
            ".txt",
            ".css",
            ".scss",
            ".html",
            ".yml",
            ".yaml",
            ".toml",
            ".sh",
            ".ps1",
            ".bat",
            ".py",
            ".rb",
            ".go",
            ".rs"
          ];
          if (textExtensions.includes(ext)) {
            event.content = await fs.readFile(filePath, "utf-8");
          }
        }
      } catch {
      }
    }
    this.emit("change", event);
  }
  async unwatch(watchId) {
    const watcher = this.watchers.get(watchId);
    if (!watcher) return false;
    await watcher.close();
    this.watchers.delete(watchId);
    this.watchedPaths.delete(watchId);
    this.emit("unwatched", { watchId });
    return true;
  }
  async unwatchAll() {
    const closePromises = Array.from(this.watchers.values()).map((w) => w.close());
    await Promise.all(closePromises);
    this.watchers.clear();
    this.watchedPaths.clear();
  }
  getWatchedPaths(watchId) {
    return this.watchedPaths.get(watchId);
  }
  getAllWatchers() {
    return Array.from(this.watchers.keys());
  }
  isWatching(watchId) {
    return this.watchers.has(watchId);
  }
  async addPath(watchId, newPath) {
    const watcher = this.watchers.get(watchId);
    if (!watcher) return false;
    watcher.add(newPath);
    const paths = this.watchedPaths.get(watchId) || [];
    paths.push(newPath);
    this.watchedPaths.set(watchId, paths);
    return true;
  }
  async removePath(watchId, pathToRemove) {
    const watcher = this.watchers.get(watchId);
    if (!watcher) return false;
    await watcher.unwatch(pathToRemove);
    const paths = this.watchedPaths.get(watchId) || [];
    const filtered = paths.filter((p) => p !== pathToRemove);
    this.watchedPaths.set(watchId, filtered);
    return true;
  }
  // Scan directory without watching
  async scanDirectory(dirPath, options = {}) {
    const { depth = 5, extensions } = options;
    const files = [];
    const directories = [];
    const scan = async (currentPath, currentDepth) => {
      if (currentDepth > depth) return;
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          const relativePath = path.relative(dirPath, fullPath);
          if (DEFAULT_IGNORED.some((pattern) => {
            const regex = new RegExp(pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"));
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
      }
    };
    await scan(dirPath, 0);
    return {
      files,
      directories,
      total: files.length + directories.length
    };
  }
};
var fileWatcher = new FileWatcherService();

// src/server/routes/files.ts
var router5 = Router5();
function getLanguage(ext) {
  const languages = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".cpp": "cpp",
    ".c": "c",
    ".h": "c",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".toml": "toml",
    ".sh": "shell",
    ".ps1": "powershell",
    ".sql": "sql",
    ".rb": "ruby",
    ".php": "php"
  };
  return languages[ext.toLowerCase()];
}
router5.get("/list", async (req, res) => {
  try {
    const dirPath = req.query.path;
    const depth = parseInt(req.query.depth) || 1;
    if (!dirPath) {
      return sendError(res, "Path is required", 400);
    }
    const items = [];
    const readDir = async (currentPath, currentDepth) => {
      if (currentDepth > depth) return;
      const entries = await fs2.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const fullPath = path2.join(currentPath, entry.name);
        const relativePath = path2.relative(dirPath, fullPath);
        try {
          const stats = await fs2.stat(fullPath);
          const ext = path2.extname(entry.name);
          items.push({
            path: relativePath,
            name: entry.name,
            type: entry.isDirectory() ? "directory" : entry.isSymbolicLink() ? "symlink" : "file",
            size: stats.size,
            mtime: stats.mtime,
            extension: ext || void 0,
            language: ext ? getLanguage(ext) : void 0
          });
          if (entry.isDirectory() && currentDepth < depth) {
            await readDir(fullPath, currentDepth + 1);
          }
        } catch {
        }
      }
    };
    await readDir(dirPath, 1);
    sendResponse(res, items);
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.get("/read", async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return sendError(res, "Path is required", 400);
    }
    const stats = await fs2.stat(filePath);
    if (stats.isDirectory()) {
      return sendError(res, "Cannot read directory as file", 400);
    }
    if (stats.size > 10 * 1024 * 1024) {
      return sendError(res, "File too large (max 10MB)", 400);
    }
    const content = await fs2.readFile(filePath, "utf-8");
    const ext = path2.extname(filePath);
    const response = {
      path: filePath,
      content,
      encoding: "utf-8",
      size: stats.size,
      language: getLanguage(ext)
    };
    sendResponse(res, response);
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.post("/write", async (req, res) => {
  try {
    const { path: filePath, content, createDirs } = req.body;
    if (!filePath || content === void 0) {
      return sendError(res, "Path and content are required", 400);
    }
    if (createDirs) {
      await fs2.mkdir(path2.dirname(filePath), { recursive: true });
    }
    await fs2.writeFile(filePath, content, "utf-8");
    sendResponse(res, { written: true, path: filePath });
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.post("/mkdir", async (req, res) => {
  try {
    const { path: dirPath, recursive = true } = req.body;
    if (!dirPath) {
      return sendError(res, "Path is required", 400);
    }
    await fs2.mkdir(dirPath, { recursive });
    sendResponse(res, { created: true, path: dirPath });
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.delete("/delete", async (req, res) => {
  try {
    const { path: targetPath, recursive = false } = req.body;
    if (!targetPath) {
      return sendError(res, "Path is required", 400);
    }
    const stats = await fs2.stat(targetPath);
    if (stats.isDirectory()) {
      await fs2.rm(targetPath, { recursive });
    } else {
      await fs2.unlink(targetPath);
    }
    sendResponse(res, { deleted: true, path: targetPath });
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.post("/rename", async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) {
      return sendError(res, "Old and new paths are required", 400);
    }
    await fs2.rename(oldPath, newPath);
    sendResponse(res, { renamed: true, from: oldPath, to: newPath });
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.post("/copy", async (req, res) => {
  try {
    const { source, dest, recursive = true } = req.body;
    if (!source || !dest) {
      return sendError(res, "Source and destination are required", 400);
    }
    await fs2.cp(source, dest, { recursive });
    sendResponse(res, { copied: true, from: source, to: dest });
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.get("/info", async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return sendError(res, "Path is required", 400);
    }
    const stats = await fs2.stat(filePath);
    const ext = path2.extname(filePath);
    const info = {
      path: filePath,
      name: path2.basename(filePath),
      type: stats.isDirectory() ? "directory" : stats.isSymbolicLink() ? "symlink" : "file",
      size: stats.size,
      mtime: stats.mtime,
      extension: ext || void 0,
      language: getLanguage(ext),
      permissions: stats.mode.toString(8)
    };
    sendResponse(res, info);
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.get("/scan", async (req, res) => {
  try {
    const dirPath = req.query.path;
    const depth = parseInt(req.query.depth) || 5;
    const extensions = req.query.extensions?.split(",");
    if (!dirPath) {
      return sendError(res, "Path is required", 400);
    }
    const result = await fileWatcher.scanDirectory(dirPath, { depth, extensions });
    sendResponse(res, result);
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.post("/watch", async (req, res) => {
  try {
    const { path: watchPath, options } = req.body;
    if (!watchPath) {
      return sendError(res, "Path is required", 400);
    }
    const watchId = await fileWatcher.watch(watchPath, options);
    sendResponse(res, { watchId, path: watchPath }, 201);
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.delete("/watch/:watchId", async (req, res) => {
  try {
    const { watchId } = req.params;
    const stopped = await fileWatcher.unwatch(watchId);
    if (!stopped) {
      return sendError(res, "Watch not found", 404);
    }
    sendResponse(res, { stopped: true, watchId });
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.get("/watch", (_req, res) => {
  try {
    const watchers = fileWatcher.getAllWatchers().map((id) => ({
      id,
      paths: fileWatcher.getWatchedPaths(id)
    }));
    sendResponse(res, watchers);
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.post("/watch/:watchId/add", async (req, res) => {
  try {
    const { watchId } = req.params;
    const { path: newPath } = req.body;
    if (!newPath) {
      return sendError(res, "Path is required", 400);
    }
    const added = await fileWatcher.addPath(watchId, newPath);
    if (!added) {
      return sendError(res, "Watch not found", 404);
    }
    sendResponse(res, { added: true, watchId, path: newPath });
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.post("/watch/:watchId/remove", async (req, res) => {
  try {
    const { watchId } = req.params;
    const { path: pathToRemove } = req.body;
    if (!pathToRemove) {
      return sendError(res, "Path is required", 400);
    }
    const removed = await fileWatcher.removePath(watchId, pathToRemove);
    if (!removed) {
      return sendError(res, "Watch not found", 404);
    }
    sendResponse(res, { removed: true, watchId, path: pathToRemove });
  } catch (error) {
    sendError(res, error.message);
  }
});
router5.delete("/watch", async (_req, res) => {
  try {
    await fileWatcher.unwatchAll();
    sendResponse(res, { stopped: true });
  } catch (error) {
    sendError(res, error.message);
  }
});
var files_default = router5;

// src/server/routes/api.ts
var router6 = Router6();
function sendResponse(res, data, status = 200) {
  const response = {
    success: status >= 200 && status < 300,
    data,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  res.status(status).json(response);
}
function sendError(res, error, status = 500) {
  const response = {
    success: false,
    error,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  res.status(status).json(response);
}
router6.get("/health", (_req, res) => {
  sendResponse(res, {
    status: "healthy",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || "1.0.0"
  });
});
router6.get("/", (_req, res) => {
  sendResponse(res, {
    name: "FZDash-ClaudeCode API",
    version: "1.0.0",
    endpoints: {
      claude: "/api/claude",
      github: "/api/github",
      qdrant: "/api/qdrant",
      terminal: "/api/terminal",
      files: "/api/files"
    }
  });
});
router6.use("/claude", claude_default);
router6.use("/github", github_default);
router6.use("/qdrant", qdrant_default);
router6.use("/terminal", terminal_default);
router6.use("/files", files_default);
router6.use((_req, res) => {
  sendError(res, "Endpoint not found", 404);
});
var api_default = router6;

// src/server/services/socket.ts
var SocketService = class {
  io;
  sockets = /* @__PURE__ */ new Map();
  constructor(io) {
    this.io = io;
  }
  registerSocket(socket) {
    this.sockets.set(socket.id, socket);
  }
  unregisterSocket(socket) {
    this.sockets.delete(socket.id);
  }
  broadcast(event, data) {
    this.io.emit(event, data);
  }
  broadcastToRoom(room, event, data) {
    this.io.to(room).emit(event, data);
  }
  emitToSocket(socketId, event, data) {
    const socket = this.sockets.get(socketId);
    if (socket) {
      socket.emit(event, data);
    }
  }
  joinRoom(socketId, room) {
    const socket = this.sockets.get(socketId);
    if (socket) {
      socket.join(room);
    }
  }
  leaveRoom(socketId, room) {
    const socket = this.sockets.get(socketId);
    if (socket) {
      socket.leave(room);
    }
  }
  getConnectedCount() {
    return this.sockets.size;
  }
  // Real-time execution updates
  emitExecutionUpdate(data) {
    this.broadcast("execution:update", data);
  }
  // File change notifications
  emitFileChange(data) {
    this.broadcast("file:change", data);
  }
  // Claude Code status updates
  emitClaudeStatus(data) {
    this.broadcast("claude:status", data);
  }
  // Qdrant collection updates
  emitQdrantUpdate(data) {
    this.broadcast("qdrant:update", data);
  }
  // GitHub sync status
  emitGitStatus(data) {
    this.broadcast("git:status", data);
  }
};

// src/server/index.ts
config();
var PORT = process.env.FZDASH_PORT || 3847;
var HOST = process.env.FZDASH_HOST || "0.0.0.0";
var FZDashServer = class {
  app;
  httpServer;
  io;
  // Services
  socketService;
  claudeService;
  qdrantService;
  githubService;
  fileWatcherService;
  terminalService;
  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIO(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
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
  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: "50mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "50mb" }));
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        const duration = Date.now() - start;
        console.log(
          chalk.gray(`[${(/* @__PURE__ */ new Date()).toISOString()}]`),
          chalk.cyan(req.method),
          req.path,
          chalk.yellow(`${duration}ms`),
          res.statusCode >= 400 ? chalk.red(res.statusCode) : chalk.green(res.statusCode)
        );
      });
      next();
    });
  }
  setupRoutes() {
    this.app.get("/health", (_req, res) => {
      res.json({
        status: "ok",
        version: "1.0.0",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        services: {
          qdrant: this.qdrantService.isConnected(),
          github: this.githubService.isAuthenticated(),
          claude: this.claudeService.isAvailable()
        }
      });
    });
    this.app.use("/api", api_default);
    this.app.use("/api/github", github_default);
    this.app.use("/api/qdrant", qdrant_default);
    this.app.use("/api/claude", claude_default);
    this.app.use("/api/terminal", terminal_default);
    this.app.use("/api/files", files_default);
    this.app.use(express.static("dist/client"));
    this.app.get("*", (_req, res) => {
      res.sendFile("index.html", { root: "dist/client" });
    });
  }
  setupWebSocket() {
    this.io.on("connection", (socket) => {
      console.log(chalk.green(`\u2713 Client connected: ${socket.id}`));
      this.socketService.registerSocket(socket);
      socket.on("disconnect", () => {
        console.log(chalk.yellow(`\u2717 Client disconnected: ${socket.id}`));
        this.socketService.unregisterSocket(socket);
      });
    });
  }
  async start() {
    await this.qdrantService.connect();
    await this.githubService.initialize();
    await this.claudeService.initialize();
    return new Promise((resolve) => {
      this.httpServer.listen(Number(PORT), HOST, () => {
        console.log("");
        console.log(chalk.bgBlue.white.bold(" FZDash-ClaudeCode "));
        console.log("");
        console.log(chalk.cyan("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
        console.log(chalk.cyan("\u2551") + chalk.white("  Dashboard for Claude Code + FazAI-NG Integration          ") + chalk.cyan("\u2551"));
        console.log(chalk.cyan("\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
        console.log(chalk.cyan("\u2551") + chalk.green(`  \u2713 Server running at: http://${HOST}:${PORT}`) + "              " + chalk.cyan("\u2551"));
        console.log(chalk.cyan("\u2551") + chalk.green(`  \u2713 WebSocket ready`) + "                                        " + chalk.cyan("\u2551"));
        console.log(chalk.cyan("\u2551") + chalk.green(`  \u2713 Qdrant: ${this.qdrantService.isConnected() ? "Connected" : "Disconnected"}`) + "                                   " + chalk.cyan("\u2551"));
        console.log(chalk.cyan("\u2551") + chalk.green(`  \u2713 GitHub: ${this.githubService.isAuthenticated() ? "Authenticated" : "Not configured"}`) + "                               " + chalk.cyan("\u2551"));
        console.log(chalk.cyan("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
        console.log("");
        resolve();
      });
    });
  }
  async stop() {
    this.io.close();
    this.httpServer.close();
    await this.qdrantService.disconnect();
  }
};
var server = new FZDashServer();
server.start().catch(console.error);
var index_default = server;
export {
  FZDashServer,
  index_default as default
};
