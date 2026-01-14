/**
 * Qdrant Service
 * Manages vector database operations for ECOA and FazAI-NG
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { SocketService } from './socket.js';

export interface CollectionInfo {
  name: string;
  vectorsCount: number;
  indexedVectorsCount: number;
  pointsCount: number;
  segmentsCount: number;
  status: 'green' | 'yellow' | 'red';
  vectorSize: number;
  distance: string;
}

export interface SearchResult {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
  vector?: number[];
}

export interface UpsertPoint {
  id: string | number;
  vector: number[];
  payload: Record<string, unknown>;
}

export class QdrantService {
  private client: QdrantClient | null = null;
  private socketService: SocketService;
  private connected: boolean = false;
  private qdrantUrl: string;

  // FazAI-NG collections
  private readonly COLLECTIONS = [
    'fazai_personality',
    'fazai_memory', 
    'fazai_learning',
    'fazai_kb',
    'fazai_inference',
    'fazai_source',
    'fazai_semantic_cache',
    'claudio_soul',
    'claudio_sources'
  ];

  constructor(socketService: SocketService) {
    this.socketService = socketService;
    this.qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6363';
  }

  async connect(): Promise<void> {
    try {
      this.client = new QdrantClient({ 
        url: this.qdrantUrl,
        timeout: 10000
      });
      
      // Test connection
      await this.client.getCollections();
      this.connected = true;
      console.log(`✓ Connected to Qdrant at ${this.qdrantUrl}`);
    } catch (error) {
      console.warn(`⚠ Could not connect to Qdrant: ${error}`);
      this.connected = false;
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getCollections(): Promise<CollectionInfo[]> {
    if (!this.client) return [];

    try {
      const response = await this.client.getCollections();
      const collections: CollectionInfo[] = [];

      for (const col of response.collections) {
        try {
          const info = await this.client.getCollection(col.name);
          collections.push({
            name: col.name,
            vectorsCount: info.indexed_vectors_count || 0,
            indexedVectorsCount: info.indexed_vectors_count || 0,
            pointsCount: info.points_count || 0,
            segmentsCount: info.segments_count || 0,
            status: info.status as 'green' | 'yellow' | 'red',
            vectorSize: typeof info.config?.params?.vectors === 'object' 
              ? (info.config.params.vectors as { size?: number }).size || 768
              : 768,
            distance: typeof info.config?.params?.vectors === 'object'
              ? (info.config.params.vectors as { distance?: string }).distance || 'Cosine'
              : 'Cosine'
          });
        } catch {
          // Skip problematic collections
        }
      }

      return collections;
    } catch (error) {
      console.error('Error getting collections:', error);
      return [];
    }
  }

  async search(collectionName: string, vector: number[], limit: number = 10, filter?: Record<string, unknown>): Promise<SearchResult[]> {
    if (!this.client) return [];

    try {
      const results = await this.client.search(collectionName, {
        vector,
        limit,
        filter: filter as never,
        with_payload: true,
        with_vector: false
      });

      this.socketService.emitQdrantUpdate({
        collection: collectionName,
        action: 'search',
        count: results.length
      });

      return results.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload as Record<string, unknown>
      }));
    } catch (error) {
      console.error(`Search error in ${collectionName}:`, error);
      return [];
    }
  }

  async searchMultiCollection(_query: string, collections?: string[]): Promise<Map<string, SearchResult[]>> {
    const targetCollections = collections || this.COLLECTIONS;
    const results = new Map<string, SearchResult[]>();

    // For now, return empty - would need embedding service
    // In production, integrate with universal-embedder.ts
    for (const col of targetCollections) {
      results.set(col, []);
    }

    return results;
  }

  async upsert(collectionName: string, points: UpsertPoint[]): Promise<boolean> {
    if (!this.client) return false;

    try {
      await this.client.upsert(collectionName, {
        wait: true,
        points: points.map(p => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload
        }))
      });

      this.socketService.emitQdrantUpdate({
        collection: collectionName,
        action: 'upsert',
        count: points.length
      });

      return true;
    } catch (error) {
      console.error(`Upsert error in ${collectionName}:`, error);
      return false;
    }
  }

  async deletePoints(collectionName: string, ids: (string | number)[]): Promise<boolean> {
    if (!this.client) return false;

    try {
      await this.client.delete(collectionName, {
        wait: true,
        points: ids
      });

      this.socketService.emitQdrantUpdate({
        collection: collectionName,
        action: 'delete',
        count: ids.length
      });

      return true;
    } catch (error) {
      console.error(`Delete error in ${collectionName}:`, error);
      return false;
    }
  }

  async getPoint(collectionName: string, id: string | number): Promise<SearchResult | null> {
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
          score: 1.0,
          payload: result[0].payload as Record<string, unknown>,
          vector: result[0].vector as number[]
        };
      }

      return null;
    } catch (error) {
      console.error(`Get point error in ${collectionName}:`, error);
      return null;
    }
  }

  async scroll(collectionName: string, limit: number = 100, offset?: string | number): Promise<{
    points: SearchResult[];
    nextOffset?: string | number;
  }> {
    if (!this.client) return { points: [] };

    try {
      const result = await this.client.scroll(collectionName, {
        limit,
        offset: offset as never,
        with_payload: true,
        with_vector: false
      });

      return {
        points: result.points.map(p => ({
          id: p.id,
          score: 1.0,
          payload: p.payload as Record<string, unknown>
        })),
        nextOffset: result.next_page_offset as string | number
      };
    } catch (error) {
      console.error(`Scroll error in ${collectionName}:`, error);
      return { points: [] };
    }
  }

  async createCollection(name: string, vectorSize: number = 768): Promise<boolean> {
    if (!this.client) return false;

    try {
      await this.client.createCollection(name, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine'
        }
      });
      return true;
    } catch (error) {
      console.error(`Create collection error:`, error);
      return false;
    }
  }

  async deleteCollection(name: string): Promise<boolean> {
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
  async storeExecutionBlock(block: {
    content: string;
    sourceContext: string;
    validDestinations: string[];
    destinationHints: Array<{ concept: string; relevance: number }>;
    vector: number[];
  }): Promise<boolean> {
    const id = `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return this.upsert('fazai_learning', [{
      id,
      vector: block.vector,
      payload: {
        content: block.content,
        source_context: block.sourceContext,
        valid_destinations: block.validDestinations,
        destination_hints: block.destinationHints,
        verified: true,
        created_at: new Date().toISOString(),
        use_count: 0,
        success_count: 0
      }
    }]);
  }

  // ECOA-specific: Find blocks by destination
  async findBlocksByDestination(destination: string, limit: number = 10): Promise<SearchResult[]> {
    if (!this.client) return [];

    try {
      const result = await this.client.scroll('fazai_learning', {
        limit,
        filter: {
          should: [
            {
              key: 'valid_destinations',
              match: { value: destination }
            },
            {
              key: 'valid_destinations',
              match: { value: '*' }
            }
          ]
        },
        with_payload: true
      });

      return result.points.map(p => ({
        id: p.id,
        score: 1.0,
        payload: p.payload as Record<string, unknown>
      }));
    } catch (error) {
      console.error('Find blocks error:', error);
      return [];
    }
  }
}
