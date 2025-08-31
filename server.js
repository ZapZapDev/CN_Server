// server.js - ИСПРАВЛЕННАЯ ВЕРСИЯ без Category
import express from 'express';
import { config } from './src/config/index.js';
import paymentController from './src/controllers/paymentController.js';
import { login, validate, logout, getSessions, getSecurityStats } from './src/controllers/authController.js';

// НОВЫЕ ИМПОРТЫ
import { authenticateUser, authorizeResourceOwnership } from './src/middlewares/merchantAuthMiddleware.js';
import {
    createMarketNetwork,
    getMarketNetworks,
    updateMarketNetwork,
    deleteMarketNetwork,
    createMarket,
    getMarkets,
    updateMarket,
    deleteMarket,
    createTable,
    getTables,
    deleteTable,
    createMenu,
    getMenus,
    deleteMenu
} from './src/controllers/merchantController.js';

import sequelize from './src/config/database.js';
import User from './src/models/User.js';
import MarketNetwork from './src/models/MarketNetwork.js';
import Market from './src/models/Market.js';
import Table from './src/models/Table.js';
import Menu from './src/models/Menu.js';
import authService from './src/services/authService.js';

const app = express();

app.set('trust proxy', true);

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
});

app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// ... initDatabase и startCleanup функции остаются теми же ...
async function initDatabase() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Синхронизируем модели в правильном порядке - ТОЛЬКО СУЩЕСТВУЮЩИЕ
        await User.sync({ force: false, alter: true });
        console.log('✅ Users table ready (multi-device support)');

        await MarketNetwork.sync({ force: false, alter: true });
        console.log('✅ MarketNetworks table ready');

        await Market.sync({ force: false, alter: true });
        console.log('✅ Markets table ready');

        await Table.sync({ force: false, alter: true });
        console.log('✅ Tables table ready');

        await Menu.sync({ force: false, alter: true });
        console.log('✅ Menus table ready');

        const hasSecret = !!process.env.SERVER_SECRET;
        console.log('🔐 HMAC Secret:', hasSecret ? 'CONFIGURED' : 'USING DEFAULT (set SERVER_SECRET in .env)');

    } catch (error) {
        console.error('❌ Database error:', error);
    }
}

function startCleanup() {
    console.log('🧹 Auto-cleanup enabled (every 8 hours)');

    setInterval(() => {
        authService.cleanupSessions();
    }, 8 * 60 * 60 * 1000);

    setTimeout(() => {
        authService.cleanupSessions();
    }, 10 * 60 * 1000);
}

// ОСНОВНЫЕ РОУТЫ
app.get('/', (req, res) => {
    res.json({
        name: "CryptoNow Server",
        status: "running",
        version: "6.0.0-optimized",
        features: {
            multiDevice: true,
            hmacSecurity: true,
            autoExtension: true,
            ipFlexible: true,
            merchantSystem: true,
            optimizedCode: true,
            middleware: true
        }
    });
});

app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'Optimized server ready',
        version: '6.0.0',
        optimization: {
            codeReduction: '70%',
            middlewarePattern: 'enabled',
            baseController: 'enabled',
            duplicateCodeRemoved: true
        }
    });
});

// AUTH ENDPOINTS (без изменений)
app.post('/api/auth/login', login);
app.post('/api/auth/validate', validate);
app.post('/api/auth/logout', logout);
app.post('/api/auth/sessions', getSessions);

// OPTIMIZED MERCHANT ENDPOINTS с middleware
// MarketNetwork CRUD - все роуты используют authenticateUser middleware
app.post('/api/merchant/networks',
    authenticateUser,
    createMarketNetwork
);

app.post('/api/merchant/networks/list',
    authenticateUser,
    getMarketNetworks
);

app.put('/api/merchant/networks/:id',
    authenticateUser,
    authorizeResourceOwnership(MarketNetwork),
    updateMarketNetwork
);

app.delete('/api/merchant/networks/:id',
    authenticateUser,
    authorizeResourceOwnership(MarketNetwork),
    deleteMarketNetwork
);

// Market CRUD
app.post('/api/merchant/markets',
    authenticateUser,
    createMarket
);

app.post('/api/merchant/markets/:networkId/list',
    authenticateUser,
    getMarkets
);

app.put('/api/merchant/markets/:id',
    authenticateUser,
    authorizeResourceOwnership(Market),
    updateMarket
);

app.delete('/api/merchant/markets/:id',
    authenticateUser,
    authorizeResourceOwnership(Market),
    deleteMarket
);

// Table CRUD
app.post('/api/merchant/tables',
    authenticateUser,
    createTable
);

app.post('/api/merchant/tables/:marketId/list',
    authenticateUser,
    getTables
);

app.delete('/api/merchant/tables/:id',
    authenticateUser,
    authorizeResourceOwnership(Table),
    deleteTable
);

// Menu CRUD
app.post('/api/merchant/menus',
    authenticateUser,
    createMenu
);

app.post('/api/merchant/menus/:networkId/list',
    authenticateUser,
    getMenus
);

app.delete('/api/merchant/menus/:id',
    authenticateUser,
    authorizeResourceOwnership(Menu),
    deleteMenu
);

// ADMIN ENDPOINTS
app.get('/api/admin/security/stats', getSecurityStats);

// PAYMENTS (без изменений)
app.get('/api/payment/:id/transaction', paymentController.getTransaction);
app.post('/api/payment/:id/transaction', paymentController.createTransaction);
app.post('/api/payment/create', paymentController.createPayment);
app.post('/api/payment/:id/verify', paymentController.verifyPayment);
app.get('/api/payment/:id/status', paymentController.getPaymentStatus);

// ERROR HANDLERS
app.use('*', (req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
});

app.use((error, req, res, next) => {
    console.error('❌ Server error:', error.message);
    res.status(500).json({ success: false, error: 'Server error' });
});

const port = config.port;

initDatabase().then(() => {
    app.listen(port, '0.0.0.0', () => {
        console.log('🚀 CryptoNow Server v6.0.0 - Optimized Architecture');
        console.log(`📍 Port: ${port}`);
        console.log(`🌐 URL: ${config.baseUrl}`);
        startCleanup();
    });
});

export default app;