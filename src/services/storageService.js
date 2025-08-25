class StorageService {
    constructor() {
        this.payments = new Map();
        console.log('💾 Storage service initialized for CryptoNow');
        this.cleanup();
    }

    createPayment(recipient, amount, token, label = null, message = null) {
        const paymentId = this._generatePaymentId();
        const payment = {
            id: paymentId,
            recipient,
            amount: parseFloat(amount),
            token,
            label,
            message,
            status: 'pending',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
            signature: null,
            verifiedAt: null
        };

        this.payments.set(paymentId, payment);
        console.log('💰 Payment created and stored:', {
            id: paymentId,
            recipient: recipient.slice(0, 8) + '...',
            amount: payment.amount,
            token,
            label,
            message,
            expiresAt: payment.expiresAt
        });
        return payment;
    }

    getPayment(paymentId) {
        console.log('📖 Getting payment:', paymentId);
        const payment = this.payments.get(paymentId);
        if (!payment) {
            console.log('❌ Payment not found in storage:', paymentId);
            return null;
        }

        if (this._isExpired(payment)) {
            console.log('⏰ Payment expired:', paymentId);
            payment.status = 'expired';
        }

        console.log('✅ Payment retrieved:', {
            id: payment.id,
            status: payment.status,
            amount: payment.amount,
            token: payment.token,
            label: payment.label,
            message: payment.message
        });
        return payment;
    }

    updatePaymentStatus(paymentId, status, signature = null) {
        console.log('🔄 Updating payment status:', paymentId, 'to', status);
        const payment = this.payments.get(paymentId);
        if (!payment) {
            console.log('❌ Payment not found for status update:', paymentId);
            return false;
        }

        payment.status = status;
        if (signature) {
            payment.signature = signature;
            payment.verifiedAt = new Date();
            console.log('✅ Payment signature added:', signature.slice(0, 8) + '...');
        }

        console.log('✅ Payment status updated successfully');
        return true;
    }

    getAllPayments() {
        const payments = Array.from(this.payments.values());
        console.log('📊 Retrieved all payments, count:', payments.length);
        return payments;
    }

    cleanup() {
        setInterval(() => {
            const now = new Date();
            let cleaned = 0;
            for (const [id, payment] of this.payments.entries()) {
                if (payment.expiresAt < now) {
                    this.payments.delete(id);
                    cleaned++;
                }
            }
            if (cleaned > 0) {
                console.log('🧹 Cleaned up expired payments:', cleaned);
            }
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    _generatePaymentId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        const id = `cryptonow_${timestamp}_${random}`;
        console.log('🆔 Generated payment ID:', id);
        return id;
    }

    _isExpired(payment) {
        return new Date() > payment.expiresAt;
    }

    // Статистика для CryptoNow
    getStats() {
        const payments = Array.from(this.payments.values());
        const stats = {
            total: payments.length,
            pending: 0,
            completed: 0,
            expired: 0,
            totalVolume: 0
        };

        payments.forEach(payment => {
            stats[payment.status]++;
            if (payment.status === 'completed') {
                stats.totalVolume += payment.amount;
            }
        });

        return stats;
    }
}

export default new StorageService();