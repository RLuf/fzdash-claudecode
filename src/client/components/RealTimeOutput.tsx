import { useEffect, useRef, useState } from 'react';
import { useSocket } from '@hooks/useSocket';
import { Trash2, Copy, Download, Check } from 'lucide-react';

interface OutputLine {
  id: string;
  content: string;
  timestamp: Date;
  type: 'stdout' | 'stderr' | 'system';
}

export default function RealTimeOutput() {
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { onExecutionUpdate } = useSocket();

  useEffect(() => {
    const unsubscribe = onExecutionUpdate((data) => {
      if (data.output) {
        const newLine: OutputLine = {
          id: `${Date.now()}-${Math.random()}`,
          content: data.output,
          timestamp: new Date(),
          type: data.status === 'error' ? 'stderr' : 'stdout'
        };
        setLines((prev) => [...prev, newLine].slice(-500)); // Keep last 500 lines
      }

      if (data.message) {
        const systemLine: OutputLine = {
          id: `${Date.now()}-${Math.random()}`,
          content: `[${data.status.toUpperCase()}] ${data.message}`,
          timestamp: new Date(),
          type: 'system'
        };
        setLines((prev) => [...prev, systemLine].slice(-500));
      }
    });

    return unsubscribe;
  }, [onExecutionUpdate]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const handleClear = () => {
    setLines([]);
  };

  const handleCopy = async () => {
    const text = lines.map((l) => l.content).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = lines.map((l) => `[${l.timestamp.toISOString()}] ${l.content}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `output-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLineColor = (type: OutputLine['type']) => {
    switch (type) {
      case 'stderr':
        return 'text-red-400';
      case 'system':
        return 'text-sky-400';
      default:
        return 'text-slate-300';
    }
  };

  return (
    <div className="flex flex-col h-[400px]">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 bg-slate-800/50 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">
            {lines.length} lines
          </span>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
            title="Copy to clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDownload}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
            title="Download log"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleClear}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
            title="Clear output"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Output Area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-slate-900 p-4 font-mono text-sm"
      >
        {lines.length === 0 ? (
          <p className="text-slate-500">Waiting for output...</p>
        ) : (
          lines.map((line) => (
            <div key={line.id} className={`${getLineColor(line.type)} leading-relaxed`}>
              {line.content}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
