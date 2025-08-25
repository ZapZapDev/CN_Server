import QRCode from 'qrcode';
import { config } from '../config/index.js';

class QRService {
    // Создает Solana Pay URL для интерактивных транзакций
    createSolanaPayUrl(paymentId) {
        const transactionUrl = `${config.baseUrl}/api/payment/${paymentId}/transaction`;
        return `solana:${transactionUrl}`;
    }

    // Создает простой transfer URL для базовых переводов
    createSimpleTransferUrl(recipient, amount, token, label, message) {
        let url = `solana:${recipient}`;
        const params = new URLSearchParams();

        if (amount && token === 'SOL') {
            params.append('amount', amount.toString());
        }

        if (label) {
            params.append('label', label);
        }

        if (message) {
            params.append('message', message);
        }

        const queryString = params.toString();
        if (queryString) {
            url += `?${queryString}`;
        }

        return url;
    }

    async generateQR(data) {
        try {
            console.log('🎨 Generating QR code for data:', data);

            // ВАЖНО: Проверяем что data содержит solana: префикс
            if (!data.startsWith('solana:')) {
                console.error('❌ QR data missing solana: prefix:', data);
                throw new Error('Invalid Solana Pay URL - missing solana: prefix');
            }

            const qrOptions = {
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

            const qrCode = await QRCode.toDataURL(data, qrOptions);
            console.log('✅ QR code generated successfully');
            console.log('📋 QR contains prefix check:', data.substring(0, 20) + '...');

            return qrCode;
        } catch (error) {
            console.error('❌ QR generation failed:', error.message);
            throw new Error('Failed to generate QR code');
        }
    }

    async createPaymentQR(paymentId, payment) {
        console.log('🛒 Creating Solana Pay QR for payment:', paymentId);

        // Всегда используем интерактивный режим с префиксом solana:
        const solanaPayUrl = this.createSolanaPayUrl(paymentId);
        console.log('🔗 Generated Solana Pay URL:', solanaPayUrl);

        return this.generateQR(solanaPayUrl);
    }

    // Генерирует простой QR для базовых SOL переводов (опционально)
    async createSimpleSOLQR(recipient, amount, label, message) {
        const solanaPayUrl = this.createSimpleTransferUrl(recipient, amount, 'SOL', label, message);
        console.log('🔗 Generated simple SOL URL:', solanaPayUrl);

        return this.generateQR(solanaPayUrl);
    }
}

export default new QRService();