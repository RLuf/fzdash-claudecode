import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useSocket } from '@hooks/useSocket';
import { Plus, X, Maximize2, Minimize2 } from 'lucide-react';
import 'xterm/css/xterm.css';

interface TerminalTab {
  id: string;
  name: string;
  connected: boolean;
}

export default function Terminal() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { socket, connected } = useSocket();

  // Create new terminal session
  const createSession = useCallback(async () => {
    try {
      const response = await fetch('/api/terminal/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols: 120, rows: 40 })
      });
      const data = await response.json();
      if (data.success) {
        const newTab: TerminalTab = {
          id: data.data.id,
          name: `Terminal ${tabs.length + 1}`,
          connected: true
        };
        setTabs(prev => [...prev, newTab]);
        setActiveTab(data.data.id);
      }
    } catch (error) {
      console.error('Failed to create terminal session:', error);
    }
  }, [tabs.length]);

  // Close terminal session
  const closeSession = async (sessionId: string) => {
    try {
      await fetch(`/api/terminal/session/${sessionId}`, { method: 'DELETE' });
      setTabs(prev => prev.filter(t => t.id !== sessionId));
      if (activeTab === sessionId) {
        setActiveTab(tabs.find(t => t.id !== sessionId)?.id || null);
      }
    } catch (error) {
      console.error('Failed to close terminal session:', error);
    }
  };

  // Initialize xterm
  useEffect(() => {
    if (!terminalRef.current || !activeTab) return;

    // Clean up previous terminal
    if (xtermRef.current) {
      xtermRef.current.dispose();
    }

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        black: '#32344a',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#ad8ee6',
        cyan: '#449dab',
        white: '#787c99',
        brightBlack: '#444b6a',
        brightRed: '#ff7a93',
        brightGreen: '#b9f27c',
        brightYellow: '#ff9e64',
        brightBlue: '#7da6ff',
        brightMagenta: '#bb9af7',
        brightCyan: '#0db9d7',
        brightWhite: '#acb0d0'
      }
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    terminalRef.current.innerHTML = '';
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle input
    term.onData((data) => {
      fetch(`/api/terminal/session/${activeTab}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      });
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      fetch(`/api/terminal/session/${activeTab}/resize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols: term.cols, rows: term.rows })
      });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [activeTab]);

  // Listen for terminal output
  useEffect(() => {
    if (!socket || !activeTab || !xtermRef.current) return;

    const handleOutput = (data: { sessionId: string; data: string }) => {
      if (data.sessionId === activeTab && xtermRef.current) {
        xtermRef.current.write(data.data);
      }
    };

    socket.on('terminal:output', handleOutput);

    return () => {
      socket.off('terminal:output', handleOutput);
    };
  }, [socket, activeTab]);

  // Create initial session
  useEffect(() => {
    if (tabs.length === 0 && connected) {
      createSession();
    }
  }, [connected, tabs.length, createSession]);

  return (
    <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-900' : 'h-[calc(100vh-8rem)]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <h1 className="text-2xl font-bold text-white">Terminal</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="btn-ghost btn-sm"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 border-b border-slate-700/50">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer rounded-t-lg ${
              activeTab === tab.id
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className={`w-2 h-2 rounded-full ${tab.connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm">{tab.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeSession(tab.id);
              }}
              className="p-0.5 hover:bg-slate-700 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={createSession}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Terminal Area */}
      <div className="flex-1 bg-terminal-bg">
        {activeTab ? (
          <div ref={terminalRef} className="h-full p-2" />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-500">
            No terminal session. Click + to create one.
          </div>
        )}
      </div>
    </div>
  );
}
