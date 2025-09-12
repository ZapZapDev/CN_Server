// src/controllers/paymentController.js
import solanaService from '../services/solanaService.js';
import qrService from '../services/qrService.js';
import storageService from '../services/storageService.js';
import { config } from '../config/index.js';
import WebSocket from 'ws';

// WebSocket connection to Solana
let solanaWS = null;
let wsConnected = false;
let nextRequestId = 1; // temporary request id -> server will return real subscription id

// subscriptionId -> paymentData
const balanceMonitors = new Map();

// ------------ Helpers ------------
function log(...args) {
    console.log(...args);
}
function logError(...args) {
    console.error(...args);
}
function safeSend(ws, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
        ws.send(JSON.stringify(payload));
        return true;
    } catch (err) {
        logError('WS send failed', err);
        return false;
    }
}

// ------------ WebSocket connect / handlers ------------
function connectSolanaWebSocket() {
    const wsUrl = config.solana?.wsUrl || 'wss://api.mainnet-beta.solana.com/';
    log('Connecting to Solana WebSocket...');
    solanaWS = new WebSocket(wsUrl);

    solanaWS.on('open', () => {
        wsConnected = true;
        log('Connected to Solana WebSocket');
    });

    solanaWS.on('message', data => {
        try {
            const message = JSON.parse(data.toString());
            handleSolanaMessage(message);
        } catch (err) {
            logError('WS message parse error', err);
        }
    });

    solanaWS.on('close', () => {
        wsConnected = false;
        log('Solana WebSocket disconnected — reconnecting in 5s');
        setTimeout(connectSolanaWebSocket, 5000);
    });

    solanaWS.on('error', err => {
        wsConnected = false;
        logError('Solana WebSocket error', err);
    });
}

function handleSolanaMessage(message) {
    // Map temporary request id -> real subscription id
    if (message.result && typeof message.result === 'number' && message.id) {
        const realId = message.result;
        const reqId = message.id;
        const temp = balanceMonitors.get(reqId);
        if (temp) {
            balanceMonitors.set(realId, { ...temp, subscriptionId: realId });
            balanceMonitors.delete(reqId);
            log('Monitor mapped to real subscription id', realId, 'for payment', temp.paymentId);
        }
        return;
    }

    // accountNotification -> balance change
    if (message.method === 'accountNotification') {
        const params = message.params || {};
        const subscription = params.subscription;
        const result = params.result;
        const monitor = balanceMonitors.get(subscription);
        if (monitor) {
            handleBalanceChange(monitor, result).catch(err => logError('handleBalanceChange error', err));
        } else {
            // keep only minimal log to help debugging
            log('Account notification for unknown subscription', subscription);
        }
    }
}

// ------------ Balance change processing ------------
async function handleBalanceChange(monitorData, result) {
    const { paymentId, recipientAccount } = monitorData;
    try {
        // create PublicKey and fetch recent signatures
        const { PublicKey } = await import('@solana/web3.js');
        const accountPub = new PublicKey(recipientAccount);

        const signatures = await solanaService.connection.getSignaturesForAddress(
            accountPub,
            { limit: 5, commitment: 'confirmed' }
        );

        if (!signatures || signatures.length === 0) return;

        for (const sigInfo of signatures) {
            // consider only recent signatures (last 2 minutes)
            if (sigInfo.blockTime && sigInfo.blockTime * 1000 > Date.now() - 2 * 60 * 1000) {
                const sig = sigInfo.signature;
                const valid = await quickValidateTransaction(sig);
                if (valid) {
                    storageService.updatePaymentStatus(paymentId, 'completed', sig);
                    cleanupMonitorsForPayment(paymentId);
                    log('Valid payment found', { paymentId, signature: sig });
                    return;
                }
            }
        }
    } catch (err) {
        logError('Error processing balance change for payment ' + monitorData.paymentId, err);
    }
}

// ------------ Transaction validation helpers ------------
async function quickValidateTransaction(signature) {
    try {
        const txInfo = await solanaService.connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });

        if (!txInfo || txInfo.meta?.err) return false;

        const pre = txInfo.meta.preTokenBalances || [];
        const post = txInfo.meta.postTokenBalances || [];
        const usdcMint = config.tokens.USDC.mint;

        let transfersFound = 0;

        // count incoming USDC increases by accountIndex
        for (const p of post) {
            if (p.mint === usdcMint) {
                const preItem = pre.find(x => x.accountIndex === p.accountIndex && x.mint === p.mint);
                if (preItem) {
                    const preAmount = parseFloat(preItem.uiTokenAmount.uiAmountString || '0');
                    const postAmount = parseFloat(p.uiTokenAmount.uiAmountString || '0');
                    if (postAmount > preAmount) {
                        transfersFound++;
                    }
                }
            }
        }

        return transfersFound >= 2;
    } catch (err) {
        logError('Transaction validation error', err);
        return false;
    }
}

async function quickCheckDualTransfers(signature) {
    try {
        const txInfo = await solanaService.connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });
        if (!txInfo || txInfo.meta?.err) return false;
        return (txInfo.transaction?.message?.instructions?.length || 0) >= 2;
    } catch (err) {
        logError('Dual transfer check error', err);
        return false;
    }
}

// ------------ Monitors management ------------
function cleanupMonitorsForPayment(paymentId) {
    const toRemove = [];
    for (const [subId, data] of balanceMonitors) {
        if (data.paymentId === paymentId) toRemove.push(subId);
    }
    toRemove.forEach(subId => {
        unsubscribeFromAccount(subId);
        balanceMonitors.delete(subId);
        log('Removed monitor', subId, 'for payment', paymentId);
    });
}

function subscribeToAccountBalance(account, paymentData) {
    if (!wsConnected || !solanaWS) {
        log('WS not connected — cannot subscribe to', account);
        return false;
    }

    const requestId = nextRequestId++;
    const msg = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'accountSubscribe',
        params: [account, { commitment: 'confirmed', encoding: 'jsonParsed' }]
    };

    if (!safeSend(solanaWS, msg)) {
        logError('Failed to send subscribe message for', account);
        return false;
    }

    // store under temporary requestId; later server returns real subscription id in message.result
    balanceMonitors.set(requestId, {
        ...paymentData,
        subscriptionId: requestId,
        subscribedAt: Date.now()
    });

    log('Subscribed (tempId)', requestId, 'to account', account.slice(0, 8) + '...', 'payment', paymentData.paymentId);
    return true;
}

function unsubscribeFromAccount(subscriptionId) {
    if (!wsConnected || !solanaWS) return;

    const msg = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'accountUnsubscribe',
        params: [subscriptionId]
    };

    try {
        safeSend(solanaWS, msg);
        log('Unsubscribe requested for', subscriptionId);
    } catch (err) {
        logError('Failed to unsubscribe', err);
    }
}

// ------------ Controllers (exported) ------------
async function createPayment(req, res) {
    try {
        const { recipient, amount, token = 'USDC', label, message } = req.body;
        if (!recipient || !amount || !solanaService.validateAddress(recipient)) {
            return res.status(400).json({ success: false, error: 'Invalid data' });
        }

        const paymentAmount = parseFloat(amount);
        if (Number.isNaN(paymentAmount) || paymentAmount <= 0) {
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

        log('Payment created', payment.id);

        return res.json({
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
    } catch (err) {
        logError('Create payment error', err);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
}

async function getTransaction(req, res) {
    try {
        const payment = storageService.getPayment(req.params.id);
        if (!payment) return res.status(404).json({ error: 'Payment not found' });

        return res.json({
            label: payment.label,
            icon: 'https://solana.com/src/img/branding/solanaLogoMark.svg'
        });
    } catch (err) {
        logError('Get transaction error', err);
        return res.status(500).json({ error: 'Server error' });
    }
}

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

        // Setup balance monitoring for USDC payments
        if (payment.token === 'USDC') {
            try {
                const { PublicKey } = await import('@solana/web3.js');
                const { getAssociatedTokenAddress } = await import('@solana/spl-token');

                const usdcMint = new PublicKey(config.tokens.USDC.mint);
                const recipientUSDC = await getAssociatedTokenAddress(usdcMint, new PublicKey(payment.recipient));
                const feeUSDC = await getAssociatedTokenAddress(usdcMint, new PublicKey(config.cryptonow.feeWallet));

                const recipientPaymentData = {
                    paymentId: id,
                    recipientAccount: recipientUSDC.toBase58(),
                    expectedAmount: payment.amount,
                    token: payment.token
                };

                const feePaymentData = {
                    paymentId: id,
                    recipientAccount: feeUSDC.toBase58(),
                    expectedAmount: config.cryptonow.feeAmount,
                    token: payment.token
                };

                subscribeToAccountBalance(recipientUSDC.toBase58(), recipientPaymentData);
                subscribeToAccountBalance(feeUSDC.toBase58(), feePaymentData);

                log('Subscribed to USDC balance changes for payment', id);
            } catch (err) {
                logError('Failed to setup balance monitoring', err);
            }
        }

        log('Transaction created for payment', id);
        return res.json({
            transaction: serializedTransaction.toString('base64'),
            message: payment.message
        });
    } catch (err) {
        logError('Create transaction error', err);
        return res.status(500).json({ error: 'Failed to create transaction' });
    }
}

async function getPaymentStatus(req, res) {
    try {
        const { id } = req.params;
        const payment = storageService.getPayment(id);
        if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });

        let dualTransfersCompleted = false;
        if (payment.signature && payment.status === 'completed') {
            dualTransfersCompleted = await quickCheckDualTransfers(payment.signature);
        }

        return res.json({
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
    } catch (err) {
        logError('Status check error', err);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
}

async function verifyPayment(req, res) {
    try {
        const { id } = req.params;
        const { signature } = req.body;

        const payment = storageService.getPayment(id);
        if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });

        if (signature) {
            const verification = await solanaService.verifyTransaction(signature);
            if (verification.success) {
                storageService.updatePaymentStatus(id, 'completed', signature);
                const dualTransfersCompleted = await quickCheckDualTransfers(signature);
                cleanupMonitorsForPayment(id);
                log('Payment verified', id);
                return res.json({
                    success: true,
                    status: 'completed',
                    signature,
                    dual_transfers_completed: dualTransfersCompleted,
                    verified_at: new Date().toISOString()
                });
            }
        }

        return res.json({ success: false, status: payment.status, message: 'Payment not confirmed yet' });
    } catch (err) {
        logError('Verify payment error', err);
        return res.status(500).json({ success: false, error: 'Verification failed' });
    }
}

// Init WS at startup
connectSolanaWebSocket();

// Periodic cleanup of stale monitors (every 10 minutes)
setInterval(() => {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;

    for (const [subId, data] of balanceMonitors) {
        if (now - data.subscribedAt > tenMinutes) {
            unsubscribeFromAccount(subId);
            balanceMonitors.delete(subId);
            log('Cleaned up old monitor for payment', data.paymentId);
        }
    }
}, 10 * 60 * 1000);

// Export API
export default {
    createPayment,
    getTransaction,
    createTransaction,
    getPaymentStatus,
    verifyPayment
};
