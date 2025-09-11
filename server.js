// server.js - CLEAN VERSION (only MarketNetwork + QRCode)
import express from 'express';
import { config } from './src/config/index.js';
import paymentController from './src/controllers/paymentController.js';
import {
    login, validate, logout, getSessions, getSecurityStats,
    getApiKeys, createApiKey, deleteApiKey
} from './src/controllers/authController.js';
import {
    createMarketNetwork,
    getMarketNetworks,
    updateMarketNetwork,
    deleteMarketNetwork,
    createQRCode,
    getQRCodes,
    deleteQRCode
} from './src/controllers/merchantController.js';
import sequelize from './src/config/database.js';
import User from './src/models/User.js';
import MarketNetwork from './src/models/MarketNetwork.js';
import API from './src/models/API.js';
import authService from './src/services/authService.js';
import apiService from './src/services/apiService.js';
import QRCode from './src/models/QRCode.js';

// API Routes Import
import apiV1Routes from './src/api/routes/v1.js';

const app = express();

app.set('trust proxy', true);

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
});

app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

async function initDatabase() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Sync models in correct order
        await User.sync({ force: false, alter: true });
        console.log('✅ Users table ready (multi-device support)');

        await API.sync({ force: false, alter: true });
        console.log('✅ API Keys table ready');

        await MarketNetwork.sync({ force: false, alter: true });
        console.log('✅ MarketNetworks table ready');

        await QRCode.sync({ force: false, alter: true });
        console.log('✅ QR Codes table ready');

        // Show SERVER_SECRET status
        const hasSecret = !!process.env.SERVER_SECRET;
        console.log('🔐 HMAC Secret:', hasSecret ? 'CONFIGURED' : 'USING DEFAULT (set SERVER_SECRET in .env)');

    } catch (error) {
        console.error('❌ Database error:', error);
    }
}

// Auto-cleanup every 8 hours
function startCleanup() {
    console.log('🧹 Auto-cleanup enabled (every 8 hours)');

    setInterval(async () => {
        await authService.cleanupSessions();
        await apiService.cleanupExpiredKeys();
    }, 8 * 60 * 60 * 1000);

    // First cleanup after 10 minutes
    setTimeout(async () => {
        await authService.cleanupSessions();
        await apiService.cleanupExpiredKeys();
    }, 10 * 60 * 1000);
}

app.get('/', (req, res) => {
    res.json({
        name: "CryptoNow Server",
        status: "running",
        version: "7.0.0-simplified",
        features: {
            multiDevice: true,
            hmacSecurity: true,
            autoExtension: true,
            ipFlexible: true,
            merchantSystem: true,
            qrCodesSupport: true,
            deleteSupport: true,
            apiAccess: true,
            apiKeyManagement: true
        }
    });
});

app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'CryptoNow Server Simplified ready',
        auth: {
            multiDevice: 'enabled',
            hmacValidation: 'enabled',
            autoExtension: 'enabled',
            ipBinding: 'flexible'
        },
        merchant: {
            marketNetworks: 'enabled',
            qrCodes: 'enabled',
            ownershipValidation: 'enabled',
            deleteSupport: 'enabled'
        },
        api: {
            version: 'v1',
            authentication: 'api-key',
            rateLimit: 'per-key',
            endpoints: ['/api/v1/market-networks']
        }
    });
});

// ============ AUTHENTICATION ENDPOINTS ============
app.post('/api/auth/login', login);
app.post('/api/auth/validate', validate);
app.post('/api/auth/logout', logout);
app.post('/api/auth/sessions', getSessions);

// ============ API KEY MANAGEMENT ENDPOINTS ============
app.post('/api/auth/api-keys', getApiKeys);
app.post('/api/auth/api-keys/create', createApiKey);
app.post('/api/auth/api-keys/delete', deleteApiKey);

// ============ MERCHANT ENDPOINTS ============
// MarketNetwork CRUD
app.post('/api/merchant/networks', createMarketNetwork);
app.post('/api/merchant/networks/list', getMarketNetworks);
app.put('/api/merchant/networks/:id', updateMarketNetwork);
app.delete('/api/merchant/networks/:id', deleteMarketNetwork);

// QR Code CRUD
app.post('/api/merchant/qr-codes', createQRCode);
app.post('/api/merchant/qr-codes/:networkId/list', getQRCodes);
app.delete('/api/merchant/qr-codes/:id', deleteQRCode);

// ============ EXTERNAL API ENDPOINTS ============
app.use('/api/v1', apiV1Routes);

// ============ PAYMENT ENDPOINTS ============
app.get('/api/payment/:id/transaction', paymentController.getTransaction);
app.post('/api/payment/:id/transaction', paymentController.createTransaction);
app.post('/api/payment/create', paymentController.createPayment);
app.post('/api/payment/:id/verify', paymentController.verifyPayment);
app.get('/api/payment/:id/status', paymentController.getPaymentStatus);

// ============ ADMIN ENDPOINTS ============
app.get('/api/admin/security/stats', getSecurityStats);

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
});

// Error Handler
app.use((error, req, res, next) => {
    console.error('❌ Server error:', error.message);
    res.status(500).json({ success: false, error: 'Server error' });
});

const port = config.port;

initDatabase().then(() => {
    app.listen(port, '0.0.0.0', () => {
        console.log('🚀 CryptoNow Server Simplified Started');
        console.log(`📍 Port: ${port}`);
        console.log(`🌐 URL: ${config.baseUrl}`);
        console.log('🔑 API Endpoints:');
        console.log(`   GET ${config.baseUrl}/api/v1/health`);
        console.log(`   GET ${config.baseUrl}/api/v1/market-networks`);
        console.log(`   GET ${config.baseUrl}/api/v1/market-networks/:id`);
        console.log(`   POST ${config.baseUrl}/api/merchant/qr-codes`);
        console.log(`   POST ${config.baseUrl}/api/merchant/qr-codes/:networkId/list`);
        console.log(`   DELETE ${config.baseUrl}/api/merchant/qr-codes/:id`);
        startCleanup();
    });
});

export default app;