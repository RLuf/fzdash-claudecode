import { useState, useEffect } from 'react';
import { useSocket } from '@hooks/useSocket';
import {
  DatabaseIcon,
  SearchIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ZapIcon,
  LayersIcon,
  BarChart3Icon
} from 'lucide-react';
import type { QdrantCollection, QdrantPoint, QdrantSearchResult, ECOAResult, WSQdrantUpdate } from '@shared/types';

type TabType = 'collections' | 'search' | 'ecoa';

export default function Qdrant() {
  const { socket } = useSocket();
  const [activeTab, setActiveTab] = useState<TabType>('collections');
  const [collections, setCollections] = useState<QdrantCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<QdrantSearchResult | null>(null);
  const [ecoaQuery, setEcoaQuery] = useState('');
  const [ecoaResults, setEcoaResults] = useState<ECOAResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadCollections();

    if (socket) {
      socket.on('qdrant:update', handleQdrantUpdate);
      return () => {
        socket.off('qdrant:update', handleQdrantUpdate);
      };
    }
  }, [socket]);

  const handleQdrantUpdate = (update: WSQdrantUpdate) => {
    // Reload collections on any update
    loadCollections();
  };

  const loadCollections = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/qdrant/collections');
      const data = await response.json();

      if (data.success && data.data) {
        setCollections(data.data);
        if (!selectedCollection && data.data.length > 0) {
          setSelectedCollection(data.data[0].name);
        }
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !selectedCollection) return;

    setSearching(true);
    try {
      const response = await fetch('/api/qdrant/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: selectedCollection,
          query: searchQuery,
          limit: 10,
          withPayload: true,
          withVector: false
        })
      });

      const data = await response.json();
      if (data.success && data.data) {
        setSearchResults(data.data);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleECOAQuery = async () => {
    if (!ecoaQuery.trim()) return;

    setSearching(true);
    try {
      const response = await fetch('/api/qdrant/ecoa/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ecoaQuery,
          limit: 10,
          threshold: 0.5
        })
      });

      const data = await response.json();
      if (data.success && data.data) {
        setEcoaResults(data.data);
      }
    } catch (error) {
      console.error('ECOA query failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const renderCollections = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {collections.map(collection => {
        const statusColor =
          collection.status === 'green' ? 'text-green-500' :
          collection.status === 'yellow' ? 'text-yellow-500' : 'text-red-500';

        const isECOA = collection.name.startsWith('fazai_');

        return (
          <div
            key={collection.name}
            className={`bg-fazai-900 rounded-lg p-6 border-2 transition-all ${
              selectedCollection === collection.name
                ? 'border-fazai-500'
                : 'border-fazai-700 hover:border-fazai-600'
            }`}
            onClick={() => setSelectedCollection(collection.name)}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <DatabaseIcon className="w-5 h-5 text-fazai-400" />
                {isECOA && <ZapIcon className="w-4 h-4 text-fazai-500" />}
              </div>
              <CheckCircleIcon className={`w-5 h-5 ${statusColor}`} />
            </div>

            <h3 className="text-lg font-semibold text-fazai-100 mb-2">
              {collection.name}
            </h3>

            {isECOA && (
              <span className="inline-block px-2 py-1 bg-fazai-600 text-white text-xs rounded mb-3">
                ECOA Collection
              </span>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-fazai-300">
                <span>Points:</span>
                <span className="font-mono">{collection.pointsCount.toLocaleString()}</span>
              </div>
              {collection.config && (
                <>
                  <div className="flex justify-between text-fazai-300">
                    <span>Vectors:</span>
                    <span className="font-mono">{collection.vectorsCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-fazai-300">
                    <span>Dimensions:</span>
                    <span className="font-mono">{collection.config.vectorSize}</span>
                  </div>
                  <div className="flex justify-between text-fazai-300">
                    <span>Distance:</span>
                    <span className="font-mono text-xs">{collection.config.distance}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderSearch = () => (
    <div className="space-y-6">
      {/* Search Form */}
      <div className="bg-fazai-900 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-fazai-50 mb-4">Semantic Search</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fazai-300 mb-2">
              Collection
            </label>
            <select
              value={selectedCollection || ''}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="w-full px-3 py-2 bg-fazai-800 border border-fazai-700 rounded text-fazai-100 focus:outline-none focus:border-fazai-500"
            >
              {collections.map(col => (
                <option key={col.name} value={col.name}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fazai-300 mb-2">
              Query Text
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter search query..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 px-3 py-2 bg-fazai-800 border border-fazai-700 rounded text-fazai-100 placeholder-fazai-500 focus:outline-none focus:border-fazai-500"
              />
              <button
                onClick={handleSearch}
                disabled={!searchQuery.trim() || searching}
                className={`px-6 py-2 rounded flex items-center gap-2 ${
                  searchQuery.trim() && !searching
                    ? 'bg-fazai-600 hover:bg-fazai-500 text-white'
                    : 'bg-fazai-800 text-fazai-500 cursor-not-allowed'
                }`}
              >
                <SearchIcon className="w-4 h-4" />
                Search
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Search Results */}
      {searchResults && (
        <div className="bg-fazai-900 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-fazai-50">Results</h3>
            <span className="text-sm text-fazai-400">
              {searchResults.totalFound} found in {searchResults.searchTime}ms
            </span>
          </div>

          <div className="space-y-3">
            {searchResults.points.map((point, idx) => (
              <div key={point.id} className="bg-fazai-800 rounded-lg p-4 border border-fazai-700">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-fazai-600 rounded flex items-center justify-center">
                    <span className="text-sm font-bold text-white">{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-fazai-500 font-mono">
                        ID: {String(point.id).substring(0, 16)}...
                      </span>
                      {point.score !== undefined && (
                        <span className="px-2 py-0.5 bg-fazai-700 text-fazai-200 text-xs rounded">
                          Score: {point.score.toFixed(4)}
                        </span>
                      )}
                    </div>
                    {point.payload && (
                      <div className="bg-fazai-950 rounded p-3 overflow-x-auto">
                        <pre className="text-xs text-fazai-300 font-mono">
                          {JSON.stringify(point.payload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderECOA = () => (
    <div className="space-y-6">
      {/* ECOA Info */}
      <div className="bg-gradient-to-r from-fazai-900 to-fazai-800 rounded-lg p-6 border border-fazai-600">
        <div className="flex items-center gap-3 mb-4">
          <ZapIcon className="w-6 h-6 text-fazai-400" />
          <h3 className="text-xl font-bold text-fazai-50">ECOA Quantum Retrieval</h3>
        </div>
        <p className="text-sm text-fazai-300">
          Search across multiple FazAI ECOA collections simultaneously using semantic similarity.
          Results are ranked by relevance and aggregated from personality, memory, learning, knowledge, and source collections.
        </p>
      </div>

      {/* ECOA Query Form */}
      <div className="bg-fazai-900 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-fazai-50 mb-4">Query ECOA</h3>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ask anything across all ECOA collections..."
            value={ecoaQuery}
            onChange={(e) => setEcoaQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleECOAQuery()}
            className="flex-1 px-4 py-3 bg-fazai-800 border border-fazai-700 rounded text-fazai-100 placeholder-fazai-500 focus:outline-none focus:border-fazai-500"
          />
          <button
            onClick={handleECOAQuery}
            disabled={!ecoaQuery.trim() || searching}
            className={`px-6 py-3 rounded flex items-center gap-2 ${
              ecoaQuery.trim() && !searching
                ? 'bg-fazai-600 hover:bg-fazai-500 text-white'
                : 'bg-fazai-800 text-fazai-500 cursor-not-allowed'
            }`}
          >
            <ZapIcon className="w-5 h-5" />
            Query
          </button>
        </div>
      </div>

      {/* ECOA Results */}
      {ecoaResults && (
        <div className="bg-fazai-900 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-fazai-50">ECOA Results</h3>
            <div className="flex items-center gap-4 text-sm text-fazai-400">
              <span className="flex items-center gap-1">
                <BarChart3Icon className="w-4 h-4" />
                Relevance: {ecoaResults.totalRelevance.toFixed(2)}
              </span>
              <span>Query: {ecoaResults.queryTime}ms</span>
              <span>{ecoaResults.collectionsSearched.length} collections</span>
            </div>
          </div>

          <div className="space-y-4">
            {ecoaResults.blocks.map((block, idx) => (
              <div key={block.id} className="bg-fazai-800 rounded-lg p-5 border border-fazai-700">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-fazai-600 rounded-lg flex items-center justify-center">
                    <span className="text-lg font-bold text-white">{idx + 1}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <LayersIcon className="w-4 h-4 text-fazai-400" />
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        block.type === 'personality' ? 'bg-purple-900 text-purple-300' :
                        block.type === 'memory' ? 'bg-blue-900 text-blue-300' :
                        block.type === 'learning' ? 'bg-green-900 text-green-300' :
                        block.type === 'source' ? 'bg-orange-900 text-orange-300' :
                        'bg-fazai-700 text-fazai-300'
                      }`}>
                        {block.type}
                      </span>
                      {block.relevanceScore !== undefined && (
                        <span className="px-2 py-1 bg-fazai-700 text-fazai-200 text-xs rounded">
                          {(block.relevanceScore * 100).toFixed(1)}% relevant
                        </span>
                      )}
                      <span className="text-xs text-fazai-500">
                        {new Date(block.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-fazai-200 mb-3 whitespace-pre-wrap">{block.content}</p>

                    {block.metadata && Object.keys(block.metadata).length > 0 && (
                      <details className="mt-3">
                        <summary className="text-xs text-fazai-500 cursor-pointer hover:text-fazai-400">
                          Metadata ({Object.keys(block.metadata).length} fields)
                        </summary>
                        <div className="mt-2 bg-fazai-950 rounded p-3 overflow-x-auto">
                          <pre className="text-xs text-fazai-300 font-mono">
                            {JSON.stringify(block.metadata, null, 2)}
                          </pre>
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 bg-fazai-900 border-b border-fazai-700">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fazai-50 flex items-center gap-3">
            <DatabaseIcon className="w-7 h-7" />
            Qdrant Vector Database
          </h1>
          <button
            onClick={loadCollections}
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
          { id: 'collections' as const, label: 'Collections', icon: DatabaseIcon },
          { id: 'search' as const, label: 'Search', icon: SearchIcon },
          { id: 'ecoa' as const, label: 'ECOA Query', icon: ZapIcon }
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
        {activeTab === 'collections' && renderCollections()}
        {activeTab === 'search' && renderSearch()}
        {activeTab === 'ecoa' && renderECOA()}
      </div>
    </div>
  );
}
