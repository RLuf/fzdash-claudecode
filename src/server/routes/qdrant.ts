/**
 * Qdrant API Routes
 * Endpoints for vector database operations
 */

import { Router, Request, Response } from 'express';
import { QdrantService } from '../services/qdrant.js';
import { sendResponse, sendError } from './api.js';
import { QdrantSearchRequest } from '../../shared/types.js';

const router = Router();
const qdrantService = new QdrantService();

// Health check
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const healthy = await qdrantService.healthCheck();
    sendResponse(res, { healthy, url: process.env.QDRANT_URL || 'http://localhost:6363' });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// List all collections
router.get('/collections', async (_req: Request, res: Response) => {
  try {
    const collections = await qdrantService.listCollections();
    sendResponse(res, collections);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get collection info
router.get('/collection/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const info = await qdrantService.getCollectionInfo(name);
    
    if (!info) {
      return sendError(res, 'Collection not found', 404);
    }

    sendResponse(res, info);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Create collection
router.post('/collection', async (req: Request, res: Response) => {
  try {
    const { name, vectorSize, distance } = req.body;
    
    if (!name || !vectorSize) {
      return sendError(res, 'Name and vectorSize are required', 400);
    }

    await qdrantService.createCollection(name, vectorSize, distance || 'Cosine');
    sendResponse(res, { created: true, name }, 201);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Delete collection
router.delete('/collection/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    await qdrantService.deleteCollection(name);
    sendResponse(res, { deleted: true, name });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Search in collection
router.post('/search', async (req: Request, res: Response) => {
  try {
    const request = req.body as QdrantSearchRequest;
    
    if (!request.collection || !request.query) {
      return sendError(res, 'Collection and query are required', 400);
    }

    const results = await qdrantService.search(request);
    sendResponse(res, results);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Semantic search with text (uses embedding)
router.post('/semantic-search', async (req: Request, res: Response) => {
  try {
    const { collection, text, limit, filter, collections } = req.body;
    
    if (!text) {
      return sendError(res, 'Text query is required', 400);
    }

    // If collections array provided, search multiple
    if (collections && Array.isArray(collections)) {
      const results = await qdrantService.searchMultipleCollections(
        text,
        collections,
        limit || 10
      );
      return sendResponse(res, results);
    }

    // Single collection search
    if (!collection) {
      return sendError(res, 'Collection name is required', 400);
    }

    const results = await qdrantService.semanticSearch(collection, text, limit, filter);
    sendResponse(res, results);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Upsert points
router.post('/points', async (req: Request, res: Response) => {
  try {
    const { collection, points } = req.body;
    
    if (!collection || !points || !Array.isArray(points)) {
      return sendError(res, 'Collection and points array are required', 400);
    }

    await qdrantService.upsertPoints(collection, points);
    sendResponse(res, { upserted: true, count: points.length });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Get points by IDs
router.post('/points/get', async (req: Request, res: Response) => {
  try {
    const { collection, ids, withPayload, withVector } = req.body;
    
    if (!collection || !ids || !Array.isArray(ids)) {
      return sendError(res, 'Collection and IDs array are required', 400);
    }

    const points = await qdrantService.getPoints(collection, ids, withPayload, withVector);
    sendResponse(res, points);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Delete points
router.delete('/points', async (req: Request, res: Response) => {
  try {
    const { collection, ids, filter } = req.body;
    
    if (!collection || (!ids && !filter)) {
      return sendError(res, 'Collection and IDs or filter are required', 400);
    }

    await qdrantService.deletePoints(collection, ids, filter);
    sendResponse(res, { deleted: true });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Scroll through collection (pagination)
router.get('/scroll/:collection', async (req: Request, res: Response) => {
  try {
    const { collection } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = req.query.offset as string;
    const withPayload = req.query.withPayload !== 'false';
    const withVector = req.query.withVector === 'true';

    const result = await qdrantService.scroll(collection, limit, offset, withPayload, withVector);
    sendResponse(res, result);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Count points in collection
router.get('/count/:collection', async (req: Request, res: Response) => {
  try {
    const { collection } = req.params;
    const count = await qdrantService.countPoints(collection);
    sendResponse(res, { collection, count });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// === ECOA Integration (FazAI) ===

// Get ECOA collections
router.get('/ecoa/collections', async (_req: Request, res: Response) => {
  try {
    const collections = await qdrantService.getECOACollections();
    sendResponse(res, collections);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// ECOA quantum retrieval
router.post('/ecoa/retrieve', async (req: Request, res: Response) => {
  try {
    const { query, collections, limit, threshold, destinationHints } = req.body;
    
    if (!query) {
      return sendError(res, 'Query is required', 400);
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
    sendError(res, (error as Error).message);
  }
});

// Store in ECOA
router.post('/ecoa/store', async (req: Request, res: Response) => {
  try {
    const { collection, content, metadata, type } = req.body;
    
    if (!collection || !content) {
      return sendError(res, 'Collection and content are required', 400);
    }

    const id = await qdrantService.ecoaStore(collection, content, metadata, type);
    sendResponse(res, { stored: true, id }, 201);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Index code file
router.post('/ecoa/index-file', async (req: Request, res: Response) => {
  try {
    const { filePath, content, language } = req.body;
    
    if (!filePath || !content) {
      return sendError(res, 'File path and content are required', 400);
    }

    await qdrantService.indexCodeFile(filePath, content, language);
    sendResponse(res, { indexed: true, filePath });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Batch index code files
router.post('/ecoa/index-batch', async (req: Request, res: Response) => {
  try {
    const { files } = req.body;
    
    if (!files || !Array.isArray(files)) {
      return sendError(res, 'Files array is required', 400);
    }

    const results = await qdrantService.batchIndexFiles(files);
    sendResponse(res, { 
      indexed: results.success, 
      failed: results.failed,
      total: files.length 
    });
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

// Search code
router.post('/ecoa/search-code', async (req: Request, res: Response) => {
  try {
    const { query, language, limit } = req.body;
    
    if (!query) {
      return sendError(res, 'Query is required', 400);
    }

    const results = await qdrantService.searchCode(query, language, limit);
    sendResponse(res, results);
  } catch (error) {
    sendError(res, (error as Error).message);
  }
});

export default router;
