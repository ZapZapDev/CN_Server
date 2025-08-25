import dotenv from 'dotenv';
dotenv.config(); // ВАЖНО: вызываем в самом начале

import express from 'express';
import { config } from './src/config/index.js';
import paymentController from './src/controllers/paymentController.js';
import { login, validate, logout } from './src/controllers/authController.js';
import sequelize from './src/config/database.js';
import User from './src/models/User.js';

const app = express();

// Trust proxy для получения реального IP
app.set('trust proxy', true);

// Быстрые CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.use(express.json({ limit: '10mb' }));

// Минимальное логирование
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Инициализация БД
async function initDatabase() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // ПРИНУДИТЕЛЬНАЯ синхронизация - создает таблицу если ее нет
        await User.sync({ force: false, alter: true });
        console.log('✅ Users table synchronized');

        // Проверяем что таблица создалась
        const tableExists = await sequelize.getQueryInterface().showAllTables();
        console.log('📊 Available tables:', tableExists);

    } catch (error) {
        console.error('❌ Database error:', error);
        console.error('Connection details:', {
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            user: process.env.DB_USER
        });
    }
}

// Health check
app.get('/', (req, res) => {
    res.json({
        name: "CryptoNow Server with Auth",
        status: "running",
        version: "3.1.0-auth",
        features: ["wallet_auth", "session_management", "ip_tracking"]
    });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'Server with auth ready',
        supported_tokens: ['USDC', 'USDT', 'SOL'],
        auth_enabled: true
    });
});

// AUTH ENDPOINTS
app.post('/api/auth/login', login);
app.post('/api/auth/validate', validate);
app.post('/api/auth/logout', logout);

// PAYMENT ENDPOINTS (существующие)
app.get('/api/payment/:id/transaction', paymentController.getTransaction);
app.post('/api/payment/:id/transaction', paymentController.createTransaction);
app.post('/api/payment/create', paymentController.createPayment);
app.post('/api/payment/:id/verify', paymentController.verifyPayment);
app.get('/api/payment/:id/status', paymentController.getPaymentStatus);

// 404
app.use('*', (req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
});

// Error handler
app.use((error, req, res, next) => {
    console.error('❌ Server error:', error.message);
    res.status(500).json({ success: false, error: 'Server error' });
});

const port = config.port;

initDatabase().then(() => {
    app.listen(port, '0.0.0.0', () => {
        console.log('🚀 CryptoNow Server with Auth Started');
        console.log(`📍 Port: ${port}`);
        console.log(`🌐 URL: ${config.baseUrl}`);
        console.log('🔐 AUTH FEATURES:');
        console.log('  - Wallet session management');
        console.log('  - IP-based security');
        console.log('  - Automatic session keys');
        console.log('✅ Ready for authenticated payments!');
    });
});

export default app;