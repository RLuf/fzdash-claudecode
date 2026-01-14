/**
 * Socket.IO Service
 * Manages real-time communication with clients
 */

import { Server as SocketIO, Socket } from 'socket.io';

export interface BroadcastEvent {
  event: string;
  data: unknown;
  room?: string;
}

export class SocketService {
  private io: SocketIO;
  private sockets: Map<string, Socket> = new Map();

  constructor(io: SocketIO) {
    this.io = io;
  }

  registerSocket(socket: Socket): void {
    this.sockets.set(socket.id, socket);
  }

  unregisterSocket(socket: Socket): void {
    this.sockets.delete(socket.id);
  }

  broadcast(event: string, data: unknown): void {
    this.io.emit(event, data);
  }

  broadcastToRoom(room: string, event: string, data: unknown): void {
    this.io.to(room).emit(event, data);
  }

  emitToSocket(socketId: string, event: string, data: unknown): void {
    const socket = this.sockets.get(socketId);
    if (socket) {
      socket.emit(event, data);
    }
  }

  joinRoom(socketId: string, room: string): void {
    const socket = this.sockets.get(socketId);
    if (socket) {
      socket.join(room);
    }
  }

  leaveRoom(socketId: string, room: string): void {
    const socket = this.sockets.get(socketId);
    if (socket) {
      socket.leave(room);
    }
  }

  getConnectedCount(): number {
    return this.sockets.size;
  }

  // Real-time execution updates
  emitExecutionUpdate(data: {
    taskId: string;
    status: 'pending' | 'running' | 'success' | 'error';
    progress?: number;
    message?: string;
    output?: string;
  }): void {
    this.broadcast('execution:update', data);
  }

  // File change notifications
  emitFileChange(data: {
    type: 'add' | 'change' | 'unlink';
    path: string;
    content?: string;
  }): void {
    this.broadcast('file:change', data);
  }

  // Claude Code status updates
  emitClaudeStatus(data: {
    status: 'idle' | 'thinking' | 'executing' | 'error';
    currentTask?: string;
    iteration?: number;
    maxIterations?: number;
  }): void {
    this.broadcast('claude:status', data);
  }

  // Qdrant collection updates
  emitQdrantUpdate(data: {
    collection: string;
    action: 'upsert' | 'delete' | 'search';
    count?: number;
  }): void {
    this.broadcast('qdrant:update', data);
  }

  // GitHub sync status
  emitGitStatus(data: {
    branch: string;
    ahead: number;
    behind: number;
    modified: string[];
    staged: string[];
  }): void {
    this.broadcast('git:status', data);
  }
}
