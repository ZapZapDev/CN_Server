// src/api/middleware/auth.js
import API from '../../models/API.js';
import rateLimit from 'express-rate-limit';

// Rate limiting store (in-memory for now, use Redis in production)
const rateLimitStore = new Map();

/**
 * API Authentication Middleware
 * Validates API key and attaches user to request
 */
export async function authenticateAPI(req, res, next) {
    try {
        const apiKey = extractApiKey(req);

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API key required',
                code: 'MISSING_API_KEY'
            });
        }

        const apiRecord = await API.findValidKey(apiKey);

        if (!apiRecord) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired API key',
                code: 'INVALID_API_KEY'
            });
        }

        // Check rate limiting
        const rateLimitExceeded = await checkRateLimit(apiRecord);
        if (rateLimitExceeded) {
            return res.status(429).json({
                success: false,
                error: 'Rate limit exceeded',
                code: 'RATE_LIMIT_EXCEEDED',
                limit: apiRecord.rate_limit
            });
        }

        // Record usage (async, don't wait)
        apiRecord.recordUsage().catch(err =>
            console.error('Failed to record API usage:', err)
        );

        // Attach to request
        req.api = apiRecord;
        req.user = apiRecord.user;
        req.userId = apiRecord.user.id;

        next();
    } catch (error) {
        console.error('API auth error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication failed',
            code: 'AUTH_ERROR'
        });
    }
}

/**
 * Extract API key from request headers or query params
 */
function extractApiKey(req) {
    // Priority: Authorization header > X-API-Key header > query param
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    return req.headers['x-api-key'] || req.query.api_key;
}

/**
 * Simple rate limiting implementation
 * In production, use Redis with sliding window
 */
async function checkRateLimit(apiRecord) {
    const key = `rate_limit_${apiRecord.id}`;
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour

    if (!rateLimitStore.has(key)) {
        rateLimitStore.set(key, { count: 0, resetTime: now + windowMs });
    }

    const rateData = rateLimitStore.get(key);

    // Reset if window expired
    if (now > rateData.resetTime) {
        rateData.count = 0;
        rateData.resetTime = now + windowMs;
    }

    rateData.count++;

    return rateData.count > apiRecord.rate_limit;
}

/**
 * Request logging middleware for API calls
 */
export function logAPIRequest(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const apiKey = req.api?.api_key?.substring(0, 12) + '...';
        const userId = req.userId;

        console.log(`API: ${req.method} ${req.path} | Key: ${apiKey} | User: ${userId} | ${res.statusCode} | ${duration}ms`);
    });

    next();
}

/**
 * Error handling middleware for API routes
 */
export function handleAPIError(error, req, res, next) {
    console.error('API Error:', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        apiKey: req.api?.api_key?.substring(0, 12) + '...',
        userId: req.userId
    });

    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV !== 'production';

    res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        ...(isDevelopment && { details: error.message })
    });
}