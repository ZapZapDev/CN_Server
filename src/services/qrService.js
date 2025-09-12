// src/services/qrService.js - OPTIMIZED
import QRCode from 'qrcode';
import { config } from '../config/index.js';

class QRService {
    constructor() {
        this.SOLANA_PREFIX = 'solana:';
        this.qrOptions = {
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            width: 400,
            errorCorrectionLevel: 'M'
        };
    }

    // --- ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ---
    ensureSolanaPrefix(data) {
        if (!data.startsWith(this.SOLANA_PREFIX)) {
            console.error('❌ Missing Solana prefix in:', data);
            throw new Error('Invalid Solana Pay URL - missing solana: prefix');
        }
    }

    async generateQR(data) {
        try {
            this.ensureSolanaPrefix(data);
            console.log('Generating QR for:', data);

            const qrCode = await QRCode.toDataURL(data, this.qrOptions);
            console.log('✅ QR generated successfully');
            return qrCode;
        } catch (error) {
            console.error('❌ QR generation failed:', error.message);
            throw new Error('Failed to generate QR code');
        }
    }

    // --- URL-ГЕНЕРАТОРЫ ---
    createSolanaPayUrl(paymentId) {
        const transactionUrl = `${config.baseUrl}/api/payment/${paymentId}/transaction`;
        return `${this.SOLANA_PREFIX}${transactionUrl}`;
    }

    createSimpleTransferUrl(recipient, amount, token, label, message) {
        let url = `${this.SOLANA_PREFIX}${recipient}`;
        const params = new URLSearchParams();

        if (amount && token === 'SOL') params.append('amount', amount.toString());
        if (label) params.append('label', label);
        if (message) params.append('message', message);

        return params.toString() ? `${url}?${params.toString()}` : url;
    }

    // --- ПУБЛИЧНЫЕ МЕТОДЫ ---
    async createPaymentQR(paymentId) {
        console.log('🛒 Creating payment QR for:', paymentId);
        const solanaPayUrl = this.createSolanaPayUrl(paymentId);
        return this.generateQR(solanaPayUrl);
    }

    async createSimpleSOLQR(recipient, amount, label, message) {
        console.log('Creating simple SOL QR for recipient:', recipient);
        const solanaPayUrl = this.createSimpleTransferUrl(recipient, amount, 'SOL', label, message);
        return this.generateQR(solanaPayUrl);
    }
}

export default new QRService();
