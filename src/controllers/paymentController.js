// src/controllers/paymentController.js - ПОЛНЫЙ ИСПРАВЛЕННЫЙ КОД

import solanaService from '../services/solanaService.js';
import qrService from '../services/qrService.js';
import storageService from '../services/storageService.js';
import { config } from '../config/index.js';
import WebSocket from 'ws';

// WebSocket подключение к Solana
let solanaWS = null;
let wsConnected = false;
let subscriptionId = 1;

// Карта мониторинга: subscriptionId -> paymentData
const balanceMonitors = new Map();

// Подключение к Solana WebSocket
function connectSolanaWebSocket() {
    console.log('🔌 Connecting to Solana WebSocket...');
    solanaWS = new WebSocket('wss://api.mainnet-beta.solana.com/');

    solanaWS.on('open', () => {
        console.log('✅ Connected to Solana WebSocket for balance monitoring');
        wsConnected = true;
    });

    solanaWS.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleSolanaMessage(message);
        } catch (error) {
            console.error('❌ WebSocket message parse error:', error);
        }
    });

    solanaWS.on('close', () => {
        console.log('🔌 Solana WebSocket disconnected, reconnecting...');
        wsConnected = false;
        setTimeout(connectSolanaWebSocket, 5000);
    });

    solanaWS.on('error', (error) => {
        console.error('❌ Solana WebSocket error:', error);
    });
}

// Обработка сообщений от Solana WebSocket
function handleSolanaMessage(message) {
    // Обрабатываем ответы на подписки
    if (message.result && typeof message.result === 'number' && message.id) {
        const realSubscriptionId = message.result;
        const requestId = message.id;

        console.log('📡 Got real subscription ID:', realSubscriptionId, 'for request:', requestId);

        // Ищем временный монитор и переносим на реальный ID
        const tempMonitor = balanceMonitors.get(requestId);
        if (tempMonitor) {
            balanceMonitors.set(realSubscriptionId, tempMonitor);
            balanceMonitors.delete(requestId);
            console.log('✅ Monitor moved to real subscription ID:', realSubscriptionId);
        }
        return;
    }

    // Обрабатываем изменения баланса
    if (message.method === 'accountNotification') {
        const result = message.params?.result;
        const subscriptionIdFromMessage = message.params?.subscription;

        console.log('💰 Account balance changed! Subscription:', subscriptionIdFromMessage);

        const monitorData = balanceMonitors.get(subscriptionIdFromMessage);
        if (monitorData) {
            console.log('🎯 Found matching monitor for payment:', monitorData.paymentId);
            handleBalanceChange(monitorData, result);
        } else {
            console.log('⚠️ No monitor found for subscription:', subscriptionIdFromMessage);
            console.log('Active monitors:', Array.from(balanceMonitors.keys()));
        }
    }
}

async function handleBalanceChange(monitorData, result) {
    const { paymentId, recipientAccount, expectedAmount } = monitorData;

    console.log('💰 Processing balance change for payment:', paymentId);
    console.log('💰 Recipient account:', recipientAccount);
    console.log('Expected amount:', expectedAmount);

    try {
        // ИСПРАВЛЕНИЕ: Создаем PublicKey из строки
        const { PublicKey } = await import('@solana/web3.js');
        const accountPublicKey = new PublicKey(recipientAccount);

        const signatures = await solanaService.connection.getSignaturesForAddress(
            accountPublicKey,
            { limit: 5, commitment: 'confirmed' }
        );

        console.log('🔍 Found', signatures.length, 'recent signatures for account');

        // Проверяем каждую транзакцию
        for (const sigInfo of signatures) {
            // Проверяем только транзакции за последние 2 минуты
            if (sigInfo.blockTime && sigInfo.blockTime * 1000 > Date.now() - 2 * 60 * 1000) {
                console.log('🔍 Checking signature:', sigInfo.signature.slice(0, 8) + '...');

                const isValidPayment = await quickValidateTransaction(sigInfo.signature);

                if (isValidPayment) {
                    console.log('🎉 VALID PAYMENT FOUND!');
                    console.log('Payment ID:', paymentId);
                    console.log('Signature:', sigInfo.signature);

                    // Обновляем статус платежа
                    const updated = storageService.updatePaymentStatus(paymentId, 'completed', sigInfo.signature);
                    console.log('💾 Payment status updated:', updated);

                    // Удаляем ВСЕ мониторинги для этого платежа
                    cleanupMonitorsForPayment(paymentId);

                    return;
                }
            }
        }

        console.log('❌ No valid payment found in recent transactions');

    } catch (error) {
        console.error('❌ Error processing balance change:', error);
        console.error('❌ Error details:', error.message);
    }
}

// Валидация транзакции
async function quickValidateTransaction(signature) {
    try {
        console.log('🔍 Validating transaction:', signature.slice(0, 12) + '...');

        const txInfo = await solanaService.connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });

        if (!txInfo || txInfo.meta?.err) {
            console.log('❌ Transaction failed or not found');
            return false;
        }

        // Проверяем изменения балансов USDC (двойной перевод)
        const preBalances = txInfo.meta.preTokenBalances || [];
        const postBalances = txInfo.meta.postTokenBalances || [];

        let transfersFound = 0;
        const usdcMint = config.tokens.USDC.mint;

        console.log('🔍 Checking USDC balance changes...');
        console.log('Pre-balances:', preBalances.length);
        console.log('Post-balances:', postBalances.length);

        // Считаем УВЕЛИЧЕНИЯ баланса USDC (incoming transfers)
        for (const postBalance of postBalances) {
            if (postBalance.mint === usdcMint) {
                const preBalance = preBalances.find(pre =>
                    pre.accountIndex === postBalance.accountIndex &&
                    pre.mint === postBalance.mint
                );

                if (preBalance) {
                    const preAmount = parseFloat(preBalance.uiTokenAmount.uiAmountString || '0');
                    const postAmount = parseFloat(postBalance.uiTokenAmount.uiAmountString || '0');

                    if (postAmount > preAmount) {
                        transfersFound++;
                        const transferAmount = postAmount - preAmount;
                        console.log(`✅ Found USDC transfer #${transfersFound}: +${transferAmount.toFixed(6)} USDC`);
                    }
                }
            }
        }

        console.log(`🔍 Total USDC transfers found: ${transfersFound}`);

        if (transfersFound >= 2) {
            console.log('✅ DUAL TRANSFER CONFIRMED! Found', transfersFound, 'USDC transfers');
            return true;
        }

        console.log('❌ Not a dual transfer. Found only', transfersFound, 'transfers, need 2+');
        return false;

    } catch (error) {
        console.error('❌ Transaction validation error:', error);
        return false;
    }
}

// Очистка мониторингов для платежа
function cleanupMonitorsForPayment(paymentId) {
    console.log('🧹 Cleaning up monitors for payment:', paymentId);

    const toDelete = [];
    for (const [subscriptionId, data] of balanceMonitors) {
        if (data.paymentId === paymentId) {
            toDelete.push(subscriptionId);
        }
    }

    for (const subscriptionId of toDelete) {
        unsubscribeFromAccount(subscriptionId);
        balanceMonitors.delete(subscriptionId);
        console.log('🗑️ Deleted monitor subscription:', subscriptionId);
    }
}

// Подписка на изменения баланса аккаунта
function subscribeToAccountBalance(account, paymentData) {
    if (!wsConnected || !solanaWS) {
        console.log('⚠️ WebSocket not connected, cannot subscribe to account');
        return false;
    }

    const currentSubscriptionId = subscriptionId++;

    const subscribeMessage = {
        jsonrpc: '2.0',
        id: currentSubscriptionId,
        method: 'accountSubscribe',
        params: [
            account,
            {
                commitment: 'confirmed',
                encoding: 'jsonParsed'
            }
        ]
    };

    try {
        solanaWS.send(JSON.stringify(subscribeMessage));

        // Сохраняем с requestId, потом переносим на realId
        balanceMonitors.set(currentSubscriptionId, {
            ...paymentData,
            subscriptionId: currentSubscriptionId,
            subscribedAt: Date.now()
        });

        console.log('📡 SUBSCRIBED to account balance:', account.slice(0, 8) + '...', 'for payment:', paymentData.paymentId);
        console.log('📊 Total active monitors:', balanceMonitors.size);
        return true;
    } catch (error) {
        console.error('❌ Failed to subscribe to account:', error);
        return false;
    }
}

// Отписка от аккаунта
function unsubscribeFromAccount(subscriptionId) {
    if (!wsConnected || !solanaWS) return;

    const unsubscribeMessage = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'accountUnsubscribe',
        params: [subscriptionId]
    };

    try {
        solanaWS.send(JSON.stringify(unsubscribeMessage));
        console.log('🚫 Unsubscribed from account monitoring:', subscriptionId);
    } catch (error) {
        console.error('❌ Failed to unsubscribe:', error);
    }
}

// Проверка двойных переводов
async function quickCheckDualTransfers(signature) {
    try {
        const txInfo = await solanaService.connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });

        if (!txInfo || txInfo.meta?.err) return false;
        return txInfo.transaction.message.instructions.length >= 2;
    } catch (error) {
        console.error('❌ Dual transfer check error:', error);
        return false;
    }
}

// Создание платежа
async function createPayment(req, res) {
    try {
        const { recipient, amount, token = 'USDC', label, message } = req.body;

        if (!recipient || !amount || !solanaService.validateAddress(recipient)) {
            return res.status(400).json({ success: false, error: 'Invalid data' });
        }

        const paymentAmount = parseFloat(amount);
        if (paymentAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }

        const payment = storageService.createPayment(
            recipient,
            paymentAmount,
            token,
            label || `CryptoNow: ${paymentAmount} ${token}`,
            message || `Payment ${paymentAmount} ${token}`
        );

        const transactionUrl = `${config.baseUrl}/api/payment/${payment.id}/transaction`;
        const solanaPayUrl = `solana:${transactionUrl}`;
        const qrCode = await qrService.generateQR(solanaPayUrl);

        console.log('💰 Payment created with balance monitoring:', payment.id);

        res.json({
            success: true,
            data: {
                id: payment.id,
                merchant: recipient,
                amount: paymentAmount,
                token,
                solana_pay_url: solanaPayUrl,
                qr_code: qrCode,
                fee_info: {
                    amount: config.cryptonow.feeAmount,
                    wallet: config.cryptonow.feeWallet,
                    token
                },
                status: payment.status,
                createdAt: payment.createdAt,
                expiresAt: payment.expiresAt,
                balance_monitoring: wsConnected
            }
        });

    } catch (error) {
        console.error('❌ Create payment error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
}

// GET transaction metadata
async function getTransaction(req, res) {
    try {
        const payment = storageService.getPayment(req.params.id);
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        res.json({
            label: payment.label,
            icon: "https://solana.com/src/img/branding/solanaLogoMark.svg"
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
}

// POST create transaction
async function createTransaction(req, res) {
    try {
        const { id } = req.params;
        const { account } = req.body;

        const payment = storageService.getPayment(id);
        if (!payment || !account || !solanaService.validateAddress(account)) {
            return res.status(400).json({ error: 'Invalid request' });
        }

        const transaction = await solanaService.createTransaction(
            account,
            payment.recipient,
            payment.amount,
            payment.token
        );

        const serializedTransaction = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false
        });

        storageService.updatePaymentStatus(id, 'pending', account);

        console.log('🔨 Transaction created for payment:', id);
        console.log('👤 Payer account:', account.slice(0, 8) + '...');
        console.log('💰 Recipient:', payment.recipient.slice(0, 8) + '...');

        // УСТАНАВЛИВАЕМ МОНИТОРИНГ БАЛАНСОВ
        try {
            const { PublicKey } = await import('@solana/web3.js');
            const { getAssociatedTokenAddress } = await import('@solana/spl-token');

            if (payment.token === 'USDC') {
                const usdcMint = new PublicKey(config.tokens.USDC.mint);

                // Получаем USDC аккаунты
                const recipientUSDC = await getAssociatedTokenAddress(usdcMint, new PublicKey(payment.recipient));
                const feeUSDC = await getAssociatedTokenAddress(usdcMint, new PublicKey(config.cryptonow.feeWallet));

                console.log('📡 Setting up monitors for:');
                console.log('Recipient USDC:', recipientUSDC.toBase58().slice(0, 8) + '...');
                console.log('Fee USDC:', feeUSDC.toBase58().slice(0, 8) + '...');

                // Подписываемся на оба аккаунта с правильными данными
                const recipientPaymentData = {
                    paymentId: id,
                    recipientAccount: recipientUSDC.toBase58(),
                    feeAccount: config.cryptonow.feeWallet,
                    expectedAmount: payment.amount,
                    expectedFee: config.cryptonow.feeAmount,
                    token: payment.token
                };

                const feePaymentData = {
                    paymentId: id,
                    recipientAccount: feeUSDC.toBase58(),
                    feeAccount: config.cryptonow.feeWallet,
                    expectedAmount: config.cryptonow.feeAmount,
                    expectedFee: config.cryptonow.feeAmount,
                    token: payment.token
                };

                subscribeToAccountBalance(recipientUSDC.toBase58(), recipientPaymentData);
                subscribeToAccountBalance(feeUSDC.toBase58(), feePaymentData);

                console.log('✅ Subscribed to USDC balance changes for instant detection');
            }
        } catch (error) {
            console.error('❌ Failed to setup balance monitoring:', error);
        }

        res.json({
            transaction: serializedTransaction.toString('base64'),
            message: payment.message
        });

    } catch (error) {
        console.error('❌ Create transaction error:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
}

// Проверка статуса
async function getPaymentStatus(req, res) {
    try {
        const { id } = req.params;

        const payment = storageService.getPayment(id);
        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        let dualTransfersCompleted = false;

        if (payment.signature && payment.status === 'completed') {
            dualTransfersCompleted = await quickCheckDualTransfers(payment.signature);
        }

        res.json({
            success: true,
            data: {
                id: payment.id,
                status: payment.status,
                merchant: payment.recipient,
                amount: payment.amount,
                token: payment.token,
                signature: payment.signature,
                createdAt: payment.createdAt,
                verifiedAt: payment.verifiedAt,
                expiresAt: payment.expiresAt,
                dual_transfers_completed: dualTransfersCompleted,
                balance_monitoring: wsConnected,
                active_monitors: balanceMonitors.size
            }
        });

    } catch (error) {
        console.error('❌ Status check error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
}

// Верификация платежа
async function verifyPayment(req, res) {
    try {
        const { id } = req.params;
        const { signature } = req.body;

        console.log('🔍 Verifying payment:', id, 'with signature:', signature?.slice(0, 8) + '...');

        const payment = storageService.getPayment(id);
        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        if (signature) {
            const verification = await solanaService.verifyTransaction(signature);
            if (verification.success) {
                storageService.updatePaymentStatus(id, 'completed', signature);
                const dualTransfersCompleted = await quickCheckDualTransfers(signature);

                // Очищаем мониторинги
                cleanupMonitorsForPayment(id);

                console.log('✅ Payment verified successfully');

                return res.json({
                    success: true,
                    status: 'completed',
                    signature,
                    dual_transfers_completed: dualTransfersCompleted,
                    verified_at: new Date().toISOString()
                });
            }
        }

        res.json({
            success: false,
            status: payment.status,
            message: 'Payment not confirmed yet'
        });

    } catch (error) {
        console.error('❌ Verify payment error:', error);
        res.status(500).json({ success: false, error: 'Verification failed' });
    }
}

// Инициализация WebSocket при запуске
connectSolanaWebSocket();

// Очистка старых мониторингов каждые 10 минут
setInterval(() => {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;

    for (const [subscriptionId, data] of balanceMonitors) {
        if (now - data.subscribedAt > tenMinutes) {
            unsubscribeFromAccount(subscriptionId);
            balanceMonitors.delete(subscriptionId);
            console.log('🧹 Cleaned up old balance monitor:', data.paymentId);
        }
    }
}, 10 * 60 * 1000);

// Экспортируем объект с функциями
export default {
    createPayment,
    getTransaction,
    createTransaction,
    getPaymentStatus,
    verifyPayment
};