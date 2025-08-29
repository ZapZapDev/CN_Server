import express from 'express';
import { config } from './src/config/index.js';
import paymentController from './src/controllers/paymentController.js';
import { login, validate, logout, getSessions, getSecurityStats } from './src/controllers/authController.js';
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

async function initDatabase() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Синхронизируем модели в правильном порядке
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

        // Показываем SERVER_SECRET статус (без значения!)
        const hasSecret = !!process.env.SERVER_SECRET;
        console.log('🔐 HMAC Secret:', hasSecret ? 'CONFIGURED' : 'USING DEFAULT (set SERVER_SECRET in .env)');

    } catch (error) {
        console.error('❌ Database error:', error);
    }
}

// Автоочистка каждые 8 часов (более мягкая)
function startCleanup() {
    console.log('🧹 Auto-cleanup enabled (every 8 hours)');

    setInterval(() => {
        authService.cleanupSessions();
    }, 8 * 60 * 60 * 1000);

    // Первая очистка через 10 минут
    setTimeout(() => {
        authService.cleanupSessions();
    }, 10 * 60 * 1000);
}

app.get('/', (req, res) => {
    res.json({
        name: "CryptoNow Server",
        status: "running",
        version: "5.2.0-with-menus",
        features: {
            multiDevice: true,
            hmacSecurity: true,
            autoExtension: true,
            ipFlexible: true,
            merchantSystem: true,
            tablesSupport: true,
            menusSupport: true
        }
    });
});

app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'Balanced security server ready',
        auth: {
            multiDevice: 'enabled',
            hmacValidation: 'enabled',
            autoExtension: 'enabled',
            ipBinding: 'flexible'
        },
        merchant: {
            marketNetworks: 'enabled',
            markets: 'enabled',
            tables: 'enabled',
            menus: 'enabled',
            ownershipValidation: 'enabled'
        }
    });
});

// BALANCED AUTH ENDPOINTS
app.post('/api/auth/login', login);
app.post('/api/auth/validate', validate);
app.post('/api/auth/logout', logout);
app.post('/api/auth/sessions', getSessions);

// MERCHANT ENDPOINTS
// MarketNetwork CRUD
app.post('/api/merchant/networks', createMarketNetwork);
app.post('/api/merchant/networks/list', getMarketNetworks);
app.put('/api/merchant/networks/:id', updateMarketNetwork);
app.delete('/api/merchant/networks/:id', deleteMarketNetwork);

// Market CRUD
app.post('/api/merchant/markets', createMarket);
app.post('/api/merchant/markets/:networkId/list', getMarkets);
app.put('/api/merchant/markets/:id', updateMarket);
app.delete('/api/merchant/markets/:id', deleteMarket);

// Table CRUD
app.post('/api/merchant/tables', createTable);
app.post('/api/merchant/tables/:marketId/list', getTables);
app.delete('/api/merchant/tables/:id', deleteTable);

// Menu CRUD
app.post('/api/merchant/menus', createMenu);
app.post('/api/merchant/menus/:networkId/list', getMenus);
app.delete('/api/merchant/menus/:id', deleteMenu);

// ADMIN ENDPOINTS
app.get('/api/admin/security/stats', getSecurityStats);

// PAYMENTS (без изменений)
app.get('/api/payment/:id/transaction', paymentController.getTransaction);
app.post('/api/payment/:id/transaction', paymentController.createTransaction);
app.post('/api/payment/create', paymentController.createPayment);
app.post('/api/payment/:id/verify', paymentController.verifyPayment);
app.get('/api/payment/:id/status', paymentController.getPaymentStatus);

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
        console.log('🚀 CryptoNow Server with Tables Support Started');
        console.log(`📍 Port: ${port}`);
        console.log(`🌐 URL: ${config.baseUrl}`);
        console.log('⚖️ BALANCED SECURITY FEATURES:');
        console.log('  ✅ Multi-device sessions');
        console.log('  ✅ HMAC session validation');
        console.log('  ✅ Auto session extension');
        console.log('  ✅ Flexible IP handling');
        console.log('  ✅ Suspicious activity logging');
        console.log('  ⏰ Session TTL: 2-7 days');
        console.log('🏪 MERCHANT FEATURES:');
        console.log('  ✅ Secure MarketNetwork CRUD');
        console.log('  ✅ Secure Market CRUD');
        console.log('  ✅ Secure Table CRUD');
        console.log('  ✅ Secure Menu CRUD');
        console.log('  ✅ Auto table numbering');
        console.log('  ✅ Wallet ownership validation');
        console.log('💡 Perfect balance: Security + Usability');

        startCleanup();
    });
});

export default app;