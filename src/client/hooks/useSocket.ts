import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  WSExecutionUpdate,
  WSFileChange,
  WSClaudeStatus,
  WSGitStatus,
  WSTerminalOutput,
  WSQdrantUpdate
} from '@shared/types';

interface UseSocketReturn {
  socket: Socket | null;
  connected: boolean;
  
  // Event listeners
  onExecutionUpdate: (callback: (data: WSExecutionUpdate) => void) => () => void;
  onFileChange: (callback: (data: WSFileChange) => void) => () => void;
  onClaudeStatus: (callback: (data: WSClaudeStatus) => void) => () => void;
  onGitStatus: (callback: (data: WSGitStatus) => void) => () => void;
  onTerminalOutput: (callback: (data: WSTerminalOutput) => void) => () => void;
  onQdrantUpdate: (callback: (data: WSQdrantUpdate) => void) => () => void;
  
  // Actions
  joinRoom: (room: string) => void;
  leaveRoom: (room: string) => void;
  emit: (event: string, data: unknown) => void;
}

let socketInstance: Socket | null = null;

export function useSocket(): UseSocketReturn {
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const listenerRefs = useRef<Map<string, Set<(...args: unknown[]) => void>>>(new Map());

  useEffect(() => {
    // Create singleton socket
    if (!socketInstance) {
      socketInstance = io(window.location.origin, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
      });
    }

    const sock = socketInstance;
    setSocket(sock);

    const onConnect = () => {
      console.log('[Socket] Connected');
      setConnected(true);
    };

    const onDisconnect = (reason: string) => {
      console.log('[Socket] Disconnected:', reason);
      setConnected(false);
    };

    const onConnectError = (error: Error) => {
      console.error('[Socket] Connection error:', error);
    };

    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    sock.on('connect_error', onConnectError);

    // Set initial state
    setConnected(sock.connected);

    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.off('connect_error', onConnectError);
    };
  }, []);

  const createEventListener = useCallback(
    <T>(event: string) =>
      (callback: (data: T) => void): (() => void) => {
        if (!socket) return () => {};

        // Track listeners
        if (!listenerRefs.current.has(event)) {
          listenerRefs.current.set(event, new Set());
        }
        listenerRefs.current.get(event)!.add(callback as (...args: unknown[]) => void);

        socket.on(event, callback as (...args: unknown[]) => void);

        return () => {
          socket.off(event, callback as (...args: unknown[]) => void);
          listenerRefs.current.get(event)?.delete(callback as (...args: unknown[]) => void);
        };
      },
    [socket]
  );

  const joinRoom = useCallback(
    (room: string) => {
      socket?.emit('join:room', room);
    },
    [socket]
  );

  const leaveRoom = useCallback(
    (room: string) => {
      socket?.emit('leave:room', room);
    },
    [socket]
  );

  const emit = useCallback(
    (event: string, data: unknown) => {
      socket?.emit(event, data);
    },
    [socket]
  );

  return {
    socket,
    connected,
    onExecutionUpdate: createEventListener<WSExecutionUpdate>('execution:update'),
    onFileChange: createEventListener<WSFileChange>('file:change'),
    onClaudeStatus: createEventListener<WSClaudeStatus>('claude:status'),
    onGitStatus: createEventListener<WSGitStatus>('git:status'),
    onTerminalOutput: createEventListener<WSTerminalOutput>('terminal:output'),
    onQdrantUpdate: createEventListener<WSQdrantUpdate>('qdrant:update'),
    joinRoom,
    leaveRoom,
    emit
  };
}
