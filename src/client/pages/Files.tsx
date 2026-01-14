import { useState, useEffect } from 'react';
import { useSocket } from '@hooks/useSocket';
import { FileIcon, FolderIcon, FolderOpenIcon, SaveIcon, XIcon, RefreshCwIcon, SearchIcon } from 'lucide-react';
import type { FileInfo, FileContent, WSFileChange } from '@shared/types';

interface TreeNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
  expanded?: boolean;
}

export default function Files() {
  const { socket } = useSocket();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('.');
  const [openFiles, setOpenFiles] = useState<Map<string, FileContent>>(new Map());
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadFileTree();

    if (socket) {
      socket.on('file:change', handleFileChange);
      return () => {
        socket.off('file:change', handleFileChange);
      };
    }
  }, [socket, currentPath]);

  const handleFileChange = (change: WSFileChange) => {
    if (change.type === 'change' && openFiles.has(change.path)) {
      // Reload file if it's currently open
      loadFile(change.path);
    } else if (change.type === 'unlink' && openFiles.has(change.path)) {
      closeFile(change.path);
    }
    // Refresh tree on any change
    loadFileTree();
  };

  const loadFileTree = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/files/list?path=${encodeURIComponent(currentPath)}`);
      const data = await response.json();

      if (data.success && data.data) {
        const files: FileInfo[] = data.data;
        const treeNodes = buildTree(files);
        setTree(treeNodes);
      }
    } catch (error) {
      console.error('Failed to load file tree:', error);
    } finally {
      setLoading(false);
    }
  };

  const buildTree = (files: FileInfo[]): TreeNode[] => {
    const nodes: TreeNode[] = [];

    files.forEach(file => {
      nodes.push({
        path: file.path,
        name: file.name,
        type: file.type,
        children: file.type === 'directory' ? [] : undefined,
        expanded: false
      });
    });

    // Sort: directories first, then files
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return nodes;
  };

  const toggleDirectory = async (node: TreeNode) => {
    if (node.type !== 'directory') return;

    if (!node.expanded) {
      // Load directory contents
      try {
        const response = await fetch(`/api/files/list?path=${encodeURIComponent(node.path)}`);
        const data = await response.json();

        if (data.success && data.data) {
          const files: FileInfo[] = data.data;
          node.children = buildTree(files);
          node.expanded = true;
          setTree([...tree]);
        }
      } catch (error) {
        console.error('Failed to load directory:', error);
      }
    } else {
      node.expanded = false;
      setTree([...tree]);
    }
  };

  const loadFile = async (path: string) => {
    try {
      const response = await fetch(`/api/files/read?path=${encodeURIComponent(path)}`);
      const data = await response.json();

      if (data.success && data.data) {
        const fileContent: FileContent = data.data;
        setOpenFiles(new Map(openFiles.set(path, fileContent)));
        setActiveFile(path);
        setEditContent(fileContent.content);
        setIsDirty(false);
      }
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  };

  const saveFile = async (path: string) => {
    try {
      const response = await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: editContent })
      });

      const data = await response.json();

      if (data.success) {
        const updated = openFiles.get(path);
        if (updated) {
          updated.content = editContent;
          setOpenFiles(new Map(openFiles));
        }
        setIsDirty(false);
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  const closeFile = (path: string) => {
    const newOpenFiles = new Map(openFiles);
    newOpenFiles.delete(path);
    setOpenFiles(newOpenFiles);

    if (activeFile === path) {
      const remaining = Array.from(newOpenFiles.keys());
      setActiveFile(remaining.length > 0 ? remaining[0] : null);
      setEditContent(remaining.length > 0 ? newOpenFiles.get(remaining[0])!.content : '');
      setIsDirty(false);
    }
  };

  const renderTreeNode = (node: TreeNode, depth: number = 0): JSX.Element => {
    const isDirectory = node.type === 'directory';
    const Icon = isDirectory ? (node.expanded ? FolderOpenIcon : FolderIcon) : FileIcon;
    const paddingLeft = depth * 16 + 8;

    const matchesSearch = searchQuery === '' ||
      node.name.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch && !isDirectory) return <></>;

    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-fazai-800 ${
            activeFile === node.path ? 'bg-fazai-700' : ''
          }`}
          style={{ paddingLeft }}
          onClick={() => isDirectory ? toggleDirectory(node) : loadFile(node.path)}
        >
          <Icon className="w-4 h-4 text-fazai-400" />
          <span className="text-sm text-fazai-100">{node.name}</span>
        </div>
        {isDirectory && node.expanded && node.children && (
          <div>
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex">
      {/* Sidebar - File Tree */}
      <div className="w-80 bg-fazai-900 border-r border-fazai-700 flex flex-col">
        <div className="p-4 border-b border-fazai-700">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xl font-bold text-fazai-50">Files</h2>
            <button
              onClick={loadFileTree}
              className="ml-auto p-1 hover:bg-fazai-800 rounded"
              disabled={loading}
            >
              <RefreshCwIcon className={`w-4 h-4 text-fazai-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="relative">
            <SearchIcon className="absolute left-2 top-2.5 w-4 h-4 text-fazai-500" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-fazai-800 border border-fazai-700 rounded text-sm text-fazai-100 placeholder-fazai-500 focus:outline-none focus:border-fazai-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tree.map(node => renderTreeNode(node))}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col">
        {/* Tab Bar */}
        {openFiles.size > 0 && (
          <div className="flex bg-fazai-900 border-b border-fazai-700 overflow-x-auto">
            {Array.from(openFiles.keys()).map(path => {
              const file = openFiles.get(path)!;
              const fileName = path.split('/').pop() || path;
              const isActive = activeFile === path;

              return (
                <div
                  key={path}
                  className={`flex items-center gap-2 px-4 py-2 border-r border-fazai-700 cursor-pointer ${
                    isActive ? 'bg-fazai-800' : 'hover:bg-fazai-850'
                  }`}
                  onClick={() => {
                    setActiveFile(path);
                    setEditContent(file.content);
                    setIsDirty(false);
                  }}
                >
                  <FileIcon className="w-4 h-4 text-fazai-400" />
                  <span className="text-sm text-fazai-100">{fileName}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeFile(path);
                    }}
                    className="p-0.5 hover:bg-fazai-700 rounded"
                  >
                    <XIcon className="w-3 h-3 text-fazai-500" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Editor */}
        {activeFile ? (
          <div className="flex-1 flex flex-col">
            <div className="p-4 bg-fazai-900 border-b border-fazai-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-fazai-300 font-mono">{activeFile}</span>
                {isDirty && <span className="text-xs text-amber-500">● Modified</span>}
              </div>
              <button
                onClick={() => saveFile(activeFile)}
                disabled={!isDirty}
                className={`flex items-center gap-2 px-4 py-2 rounded ${
                  isDirty
                    ? 'bg-fazai-600 hover:bg-fazai-500 text-white'
                    : 'bg-fazai-800 text-fazai-500 cursor-not-allowed'
                }`}
              >
                <SaveIcon className="w-4 h-4" />
                Save
              </button>
            </div>

            <textarea
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value);
                setIsDirty(e.target.value !== openFiles.get(activeFile)!.content);
              }}
              className="flex-1 p-4 bg-fazai-950 text-fazai-100 font-mono text-sm resize-none focus:outline-none"
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-fazai-950">
            <div className="text-center text-fazai-500">
              <FileIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Select a file to edit</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
