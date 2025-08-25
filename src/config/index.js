// src/config/index.js - УЛЬТРА-БЫСТРАЯ КОНФИГУРАЦИЯ

import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: process.env.PORT || 8080,
    baseUrl: process.env.BASE_URL || 'https://zapzap666.xyz',

    solana: {
        rpcUrl: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
        network: 'mainnet-beta'
    },

    // CryptoNow настройки
    cryptonow: {
        feeWallet: process.env.CRYPTONOW_FEE_WALLET || '9E9ME8Xjrnnz5tyLqPWUbXVbPjXusEp9NdjKeugDjW5t',
        feeAmount: parseFloat(process.env.CRYPTONOW_FEE_AMOUNT) || 0.1,
        name: 'CryptoNow',
        icon: 'https://zapzap666.xyz/icon.png',
        website: 'https://zapzap666.xyz'
    },

    // Поддерживаемые токены
    tokens: {
        SOL: {
            symbol: 'SOL',
            name: 'Solana',
            decimals: 9,
            mint: null
        },
        USDC: {
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        },
        USDT: {
            symbol: 'USDT',
            name: 'Tether USD',
            decimals: 6,
            mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
        }
    },

    // Настройки платежей
    payment: {
        defaultExpirationMinutes: 30,
        maxAmount: 1000000,
        minAmount: 0.01
    }
};