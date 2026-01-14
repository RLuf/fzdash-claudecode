import { useState } from 'react';
import { PlusIcon, MinusIcon, FileIcon, ArrowRightIcon } from 'lucide-react';
import type { GitDiff } from '@shared/types';

interface DiffViewerProps {
  diffs: GitDiff[];
  viewMode?: 'unified' | 'split';
}

export default function DiffViewer({ diffs, viewMode = 'unified' }: DiffViewerProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(
    diffs.length > 0 ? diffs[0].file : null
  );
  const [mode, setMode] = useState<'unified' | 'split'>(viewMode);

  const selectedDiff = diffs.find(d => d.file === selectedFile);

  const getStatusColor = (status: GitDiff['status']) => {
    switch (status) {
      case 'added': return 'text-green-500';
      case 'modified': return 'text-amber-500';
      case 'deleted': return 'text-red-500';
      case 'renamed': return 'text-blue-500';
      default: return 'text-fazai-400';
    }
  };

  const getStatusIcon = (status: GitDiff['status']) => {
    switch (status) {
      case 'added': return <PlusIcon className="w-4 h-4" />;
      case 'deleted': return <MinusIcon className="w-4 h-4" />;
      case 'renamed': return <ArrowRightIcon className="w-4 h-4" />;
      default: return <FileIcon className="w-4 h-4" />;
    }
  };

  const parseDiffLines = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        return { type: 'addition' as const, content: line.substring(1), lineNo: idx };
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        return { type: 'deletion' as const, content: line.substring(1), lineNo: idx };
      } else if (line.startsWith('@@')) {
        return { type: 'header' as const, content: line, lineNo: idx };
      } else {
        return { type: 'context' as const, content: line, lineNo: idx };
      }
    });
  };

  const renderUnifiedView = () => {
    if (!selectedDiff) return null;

    return (
      <div className="bg-fazai-950 rounded-lg overflow-hidden">
        {selectedDiff.hunks.map((hunk, hunkIdx) => {
          const lines = parseDiffLines(hunk.content);

          return (
            <div key={hunkIdx} className="border-b border-fazai-800 last:border-b-0">
              <div className="bg-fazai-900 px-4 py-2 text-xs font-mono text-fazai-400">
                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
              </div>

              <div className="font-mono text-sm">
                {lines.map((line, lineIdx) => {
                  let bgColor = '';
                  let textColor = 'text-fazai-200';
                  let marker = ' ';

                  if (line.type === 'addition') {
                    bgColor = 'bg-green-900/20';
                    textColor = 'text-green-300';
                    marker = '+';
                  } else if (line.type === 'deletion') {
                    bgColor = 'bg-red-900/20';
                    textColor = 'text-red-300';
                    marker = '-';
                  } else if (line.type === 'header') {
                    bgColor = 'bg-fazai-800';
                    textColor = 'text-fazai-400';
                  } else {
                    textColor = 'text-fazai-400';
                  }

                  return (
                    <div
                      key={lineIdx}
                      className={`flex ${bgColor} hover:bg-opacity-70 transition-colors`}
                    >
                      <span className="w-12 flex-shrink-0 text-right pr-3 text-fazai-600 select-none border-r border-fazai-800">
                        {line.type !== 'header' && line.lineNo + 1}
                      </span>
                      <span className="w-8 flex-shrink-0 text-center text-fazai-600 select-none">
                        {marker}
                      </span>
                      <span className={`flex-1 px-2 py-0.5 ${textColor} whitespace-pre`}>
                        {line.content}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSplitView = () => {
    if (!selectedDiff) return null;

    return (
      <div className="bg-fazai-950 rounded-lg overflow-hidden">
        {selectedDiff.hunks.map((hunk, hunkIdx) => {
          const lines = parseDiffLines(hunk.content);
          const oldLines: typeof lines = [];
          const newLines: typeof lines = [];

          lines.forEach(line => {
            if (line.type === 'deletion' || line.type === 'context') {
              oldLines.push(line);
            }
            if (line.type === 'addition' || line.type === 'context') {
              newLines.push(line);
            }
            if (line.type === 'header') {
              oldLines.push(line);
              newLines.push(line);
            }
          });

          return (
            <div key={hunkIdx} className="border-b border-fazai-800 last:border-b-0">
              <div className="bg-fazai-900 px-4 py-2 text-xs font-mono text-fazai-400">
                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
              </div>

              <div className="grid grid-cols-2 divide-x divide-fazai-800">
                {/* Old (Deletions) */}
                <div className="font-mono text-sm">
                  {oldLines.map((line, lineIdx) => {
                    let bgColor = '';
                    let textColor = 'text-fazai-200';

                    if (line.type === 'deletion') {
                      bgColor = 'bg-red-900/30';
                      textColor = 'text-red-300';
                    } else if (line.type === 'header') {
                      bgColor = 'bg-fazai-800';
                      textColor = 'text-fazai-400';
                    } else {
                      textColor = 'text-fazai-400';
                    }

                    return (
                      <div key={lineIdx} className={`flex ${bgColor}`}>
                        <span className="w-12 flex-shrink-0 text-right pr-3 text-fazai-600 select-none border-r border-fazai-800">
                          {line.type !== 'header' && line.lineNo + 1}
                        </span>
                        <span className={`flex-1 px-2 py-0.5 ${textColor} whitespace-pre`}>
                          {line.content}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* New (Additions) */}
                <div className="font-mono text-sm">
                  {newLines.map((line, lineIdx) => {
                    let bgColor = '';
                    let textColor = 'text-fazai-200';

                    if (line.type === 'addition') {
                      bgColor = 'bg-green-900/30';
                      textColor = 'text-green-300';
                    } else if (line.type === 'header') {
                      bgColor = 'bg-fazai-800';
                      textColor = 'text-fazai-400';
                    } else {
                      textColor = 'text-fazai-400';
                    }

                    return (
                      <div key={lineIdx} className={`flex ${bgColor}`}>
                        <span className="w-12 flex-shrink-0 text-right pr-3 text-fazai-600 select-none border-r border-fazai-800">
                          {line.type !== 'header' && line.lineNo + 1}
                        </span>
                        <span className={`flex-1 px-2 py-0.5 ${textColor} whitespace-pre`}>
                          {line.content}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (diffs.length === 0) {
    return (
      <div className="text-center py-12 text-fazai-500">
        <FileIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No changes to display</p>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* File List Sidebar */}
      <div className="w-80 bg-fazai-900 border-r border-fazai-700 overflow-y-auto">
        <div className="p-4 border-b border-fazai-700">
          <h3 className="text-sm font-semibold text-fazai-300 mb-3">
            Changed Files ({diffs.length})
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('unified')}
              className={`flex-1 px-3 py-1.5 rounded text-xs ${
                mode === 'unified'
                  ? 'bg-fazai-600 text-white'
                  : 'bg-fazai-800 text-fazai-400 hover:bg-fazai-700'
              }`}
            >
              Unified
            </button>
            <button
              onClick={() => setMode('split')}
              className={`flex-1 px-3 py-1.5 rounded text-xs ${
                mode === 'split'
                  ? 'bg-fazai-600 text-white'
                  : 'bg-fazai-800 text-fazai-400 hover:bg-fazai-700'
              }`}
            >
              Split
            </button>
          </div>
        </div>

        <div className="p-2">
          {diffs.map(diff => {
            const isSelected = selectedFile === diff.file;
            const statusColor = getStatusColor(diff.status);
            const StatusIcon = () => getStatusIcon(diff.status);

            return (
              <div
                key={diff.file}
                onClick={() => setSelectedFile(diff.file)}
                className={`p-3 rounded cursor-pointer transition-colors mb-1 ${
                  isSelected
                    ? 'bg-fazai-800 border border-fazai-600'
                    : 'hover:bg-fazai-850 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={statusColor}>
                    <StatusIcon />
                  </span>
                  <span className="text-xs font-medium text-fazai-400 uppercase">
                    {diff.status}
                  </span>
                </div>

                <p className="text-sm text-fazai-200 font-mono mb-2 truncate" title={diff.file}>
                  {diff.file}
                </p>

                <div className="flex gap-3 text-xs">
                  <span className="text-green-500">+{diff.additions}</span>
                  <span className="text-red-500">-{diff.deletions}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Diff Viewer */}
      <div className="flex-1 overflow-auto p-6">
        {selectedDiff && (
          <>
            {/* File Header */}
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-2">
                <span className={getStatusColor(selectedDiff.status)}>
                  {getStatusIcon(selectedDiff.status)}
                </span>
                <h2 className="text-lg font-semibold text-fazai-100 font-mono">
                  {selectedDiff.file}
                </h2>
              </div>
              <div className="flex gap-4 text-sm text-fazai-400">
                <span className="flex items-center gap-1">
                  <PlusIcon className="w-4 h-4 text-green-500" />
                  {selectedDiff.additions} additions
                </span>
                <span className="flex items-center gap-1">
                  <MinusIcon className="w-4 h-4 text-red-500" />
                  {selectedDiff.deletions} deletions
                </span>
              </div>
            </div>

            {/* Diff Content */}
            {mode === 'unified' ? renderUnifiedView() : renderSplitView()}
          </>
        )}
      </div>
    </div>
  );
}
