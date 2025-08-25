import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
    ComputeBudgetProgram
} from '@solana/web3.js';
import {
    createTransferInstruction,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { config } from '../config/index.js';

class SolanaService {
    constructor() {
        this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
        console.log('🔗 Connected to Solana RPC:', config.solana.rpcUrl);
    }

    /**
     * Создает транзакцию с двумя USDC переводами:
     * 1. Основной платеж
     * 2. Комиссия CryptoNow
     */
    async createDualUSDCTransaction(payerAddress, merchantAddress, amount) {
        console.log('💰 Creating dual USDC transaction:', {
            payer: payerAddress,
            merchant: merchantAddress,
            amount: amount,
            fee: config.cryptonow.feeAmount,
            feeWallet: config.cryptonow.feeWallet
        });

        const payer = new PublicKey(payerAddress);
        const merchant = new PublicKey(merchantAddress);
        const feeWallet = new PublicKey(config.cryptonow.feeWallet);
        const usdcMint = new PublicKey(config.tokens.USDC.mint);

        const transaction = new Transaction();

        // Добавляем compute budget для стабильности
        transaction.add(
            ComputeBudgetProgram.setComputeUnitLimit({
                units: 400_000,
            })
        );

        // Получаем Associated Token Accounts
        const payerUsdcAccount = await getAssociatedTokenAddress(usdcMint, payer);
        const merchantUsdcAccount = await getAssociatedTokenAddress(usdcMint, merchant);
        const feeUsdcAccount = await getAssociatedTokenAddress(usdcMint, feeWallet);

        console.log('🏦 Token accounts:', {
            payer: payerUsdcAccount.toBase58(),
            merchant: merchantUsdcAccount.toBase58(),
            fee: feeUsdcAccount.toBase58()
        });

        // Проверяем и создаем ATA для мерчанта если нужно
        const merchantAccountInfo = await this.connection.getAccountInfo(merchantUsdcAccount);
        if (!merchantAccountInfo) {
            console.log('🏗️ Creating ATA for merchant');
            transaction.add(
                createAssociatedTokenAccountInstruction(
                    payer, // payer
                    merchantUsdcAccount, // ata
                    merchant, // owner
                    usdcMint // mint
                )
            );
        }

        // Проверяем и создаем ATA для кошелька комиссий если нужно
        const feeAccountInfo = await this.connection.getAccountInfo(feeUsdcAccount);
        if (!feeAccountInfo) {
            console.log('🏗️ Creating ATA for fee wallet');
            transaction.add(
                createAssociatedTokenAccountInstruction(
                    payer, // payer
                    feeUsdcAccount, // ata
                    feeWallet, // owner
                    usdcMint // mint
                )
            );
        }

        // Конвертируем суммы в минимальные единицы (6 decimals для USDC)
        const merchantAmountLamports = Math.floor(amount * Math.pow(10, config.tokens.USDC.decimals));
        const feeAmountLamports = Math.floor(config.cryptonow.feeAmount * Math.pow(10, config.tokens.USDC.decimals));

        console.log('💵 Transfer amounts:', {
            merchantAmount: `${merchantAmountLamports} lamports (${amount} USDC)`,
            feeAmount: `${feeAmountLamports} lamports (${config.cryptonow.feeAmount} USDC)`
        });

        // ИНСТРУКЦИЯ 1: Основной платеж мерчанту
        transaction.add(
            createTransferInstruction(
                payerUsdcAccount, // from
                merchantUsdcAccount, // to
                payer, // owner
                merchantAmountLamports, // amount
                [], // multiSigners
                TOKEN_PROGRAM_ID // programId
            )
        );

        // ИНСТРУКЦИЯ 2: Комиссия CryptoNow
        transaction.add(
            createTransferInstruction(
                payerUsdcAccount, // from
                feeUsdcAccount, // to
                payer, // owner
                feeAmountLamports, // amount
                [], // multiSigners
                TOKEN_PROGRAM_ID // programId
            )
        );

        // Получаем свежий blockhash
        console.log('🔄 Getting recent blockhash...');
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = payer;

        console.log('✅ Dual USDC transaction created:', {
            instructions: transaction.instructions.length,
            blockhash: blockhash.slice(0, 8) + '...',
            lastValidBlockHeight
        });

        return transaction;
    }

    /**
     * Создает транзакцию для других токенов (SOL, USDT)
     */
    async createTransaction(payerAddress, merchantAddress, amount, token) {
        if (token === 'USDC') {
            return this.createDualUSDCTransaction(payerAddress, merchantAddress, amount);
        }

        console.log('💰 Creating transaction for token:', token);

        const payer = new PublicKey(payerAddress);
        const merchant = new PublicKey(merchantAddress);
        const feeWallet = new PublicKey(config.cryptonow.feeWallet);
        const transaction = new Transaction();

        // Добавляем compute budget
        transaction.add(
            ComputeBudgetProgram.setComputeUnitLimit({
                units: 400_000,
            })
        );

        if (token === 'SOL') {
            // SOL переводы
            const merchantLamports = Math.floor(amount * LAMPORTS_PER_SOL);
            const feeLamports = Math.floor(0.001 * LAMPORTS_PER_SOL); // 0.001 SOL комиссия

            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: payer,
                    toPubkey: merchant,
                    lamports: merchantLamports
                })
            );

            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: payer,
                    toPubkey: feeWallet,
                    lamports: feeLamports
                })
            );

        } else {
            // SPL токены (USDT и другие)
            const tokenConfig = config.tokens[token];
            if (!tokenConfig) {
                throw new Error(`Token ${token} not supported`);
            }

            const tokenMint = new PublicKey(tokenConfig.mint);
            const payerTokenAccount = await getAssociatedTokenAddress(tokenMint, payer);
            const merchantTokenAccount = await getAssociatedTokenAddress(tokenMint, merchant);
            const feeTokenAccount = await getAssociatedTokenAddress(tokenMint, feeWallet);

            // Создаем ATA если нужно (аналогично USDC)
            const merchantAccountInfo = await this.connection.getAccountInfo(merchantTokenAccount);
            if (!merchantAccountInfo) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(payer, merchantTokenAccount, merchant, tokenMint)
                );
            }

            const feeAccountInfo = await this.connection.getAccountInfo(feeTokenAccount);
            if (!feeAccountInfo) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(payer, feeTokenAccount, feeWallet, tokenMint)
                );
            }

            // Переводы токенов
            const merchantAmount = Math.floor(amount * Math.pow(10, tokenConfig.decimals));
            const feeAmount = Math.floor(config.cryptonow.feeAmount * Math.pow(10, tokenConfig.decimals));

            transaction.add(
                createTransferInstruction(payerTokenAccount, merchantTokenAccount, payer, merchantAmount)
            );

            transaction.add(
                createTransferInstruction(payerTokenAccount, feeTokenAccount, payer, feeAmount)
            );
        }

        // Устанавливаем blockhash и fee payer
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = payer;

        console.log(`✅ ${token} transaction created with ${transaction.instructions.length} instructions`);
        return transaction;
    }

    /**
     * Проверяет валидность адреса Solana
     */
    validateAddress(address) {
        try {
            new PublicKey(address);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Проверяет поддержку токена
     */
    isTokenSupported(token) {
        return token in config.tokens;
    }

    /**
     * Возвращает информацию о токене
     */
    getTokenInfo(token) {
        return config.tokens[token] || null;
    }

    /**
     * Возвращает список поддерживаемых токенов
     */
    getSupportedTokens() {
        return Object.keys(config.tokens);
    }

    /**
     * Проверяет транзакцию в блокчейне
     */
    async verifyTransaction(signature) {
        try {
            console.log('🔍 Verifying transaction:', signature);

            const txInfo = await this.connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });

            if (!txInfo) {
                return {
                    success: false,
                    error: 'Transaction not found'
                };
            }

            if (txInfo.meta?.err) {
                return {
                    success: false,
                    error: 'Transaction failed',
                    details: txInfo.meta.err
                };
            }

            console.log('✅ Transaction verified successfully');
            return {
                success: true,
                signature,
                blockTime: txInfo.blockTime,
                slot: txInfo.slot,
                fee: txInfo.meta?.fee || 0
            };

        } catch (error) {
            console.error('❌ Transaction verification failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Возвращает баланс USDC кошелька
     */
    async getUSDCBalance(walletAddress) {
        try {
            const wallet = new PublicKey(walletAddress);
            const usdcMint = new PublicKey(config.tokens.USDC.mint);
            const usdcAccount = await getAssociatedTokenAddress(usdcMint, wallet);

            const balance = await this.connection.getTokenAccountBalance(usdcAccount);
            return {
                success: true,
                balance: parseFloat(balance.value.uiAmountString || '0'),
                raw: balance.value.amount
            };
        } catch (error) {
            return {
                success: false,
                balance: 0,
                error: error.message
            };
        }
    }
}

export default new SolanaService();