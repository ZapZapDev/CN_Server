// src/api/routes/v1.js
import express from 'express';
import { authenticateAPI, logAPIRequest, handleAPIError } from '../middleware/auth.js';
import { getMarketNetworks, getMarketNetwork } from '../controllers/marketNetworkController.js';

const router = express.Router();

// Apply middleware to all API routes
router.use(logAPIRequest);
router.use(authenticateAPI);

/**
 * @route GET /api/v1/health
 * @desc Health check endpoint
 * @access Private (requires API key)
 */
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'API is healthy',
        user: {
            id: req.userId,
            wallet: req.user.sol_wallet?.substring(0, 8) + '...'
        },
        timestamp: new Date().toISOString()
    });
});

/**
 * @route GET /api/v1/market-networks
 * @desc Get all market networks for the authenticated user
 * @access Private (requires API key)
 */
router.get('/market-networks', getMarketNetworks);

/**
 * @route GET /api/v1/market-networks/:id
 * @desc Get a specific market network by ID
 * @access Private (requires API key)
 */
router.get('/market-networks/:id', getMarketNetwork);

// Error handling middleware (must be last)
router.use(handleAPIError);

export default router;