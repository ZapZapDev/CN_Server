// src/controllers/merchantController.js - CLEAN VERSION (only MarketNetwork + QRCode)
import User from '../models/User.js';
import MarketNetwork from '../models/MarketNetwork.js';
import QRCode from '../models/QRCode.js';
import authService from '../services/authService.js';

// Middleware для проверки сессии
async function getAuthenticatedUser(req) {
    const { walletAddress, sessionKey } = req.body;

    if (!walletAddress || !sessionKey) {
        return null;
    }

    const validation = await authService.validateSession(
        walletAddress,
        sessionKey,
        req.ip,
        req.get('User-Agent')
    );

    if (!validation.success) {
        return null;
    }

    const user = await User.findOne({
        where: {
            sol_wallet: walletAddress,
            session_key: sessionKey
        }
    });

    return user;
}

// =================== MARKET NETWORKS ===================

export async function createMarketNetwork(req, res) {
    try {
        const { name, description } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Name is required'
            });
        }

        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const marketNetwork = await MarketNetwork.create({
            name: name.trim(),
            description: description?.trim() || null,
            user_id: user.id
        });

        console.log('✅ MarketNetwork created:', marketNetwork.id, 'by user:', user.sol_wallet.slice(0, 8) + '...');

        res.json({
            success: true,
            data: {
                id: marketNetwork.id,
                name: marketNetwork.name,
                description: marketNetwork.description,
                createdAt: marketNetwork.created_at
            }
        });

    } catch (error) {
        console.error('❌ Create MarketNetwork error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

export async function getMarketNetworks(req, res) {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const networks = await MarketNetwork.findAll({
            where: {
                user_id: user.id
            },
            order: [['created_at', 'DESC']]
        });

        console.log('📊 Retrieved', networks.length, 'networks for user:', user.sol_wallet.slice(0, 8) + '...');

        res.json({
            success: true,
            data: networks.map(network => ({
                id: network.id,
                name: network.name,
                description: network.description,
                createdAt: network.created_at
            }))
        });

    } catch (error) {
        console.error('❌ Get MarketNetworks error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

export async function updateMarketNetwork(req, res) {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Name is required'
            });
        }

        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const network = await MarketNetwork.findOne({
            where: {
                id: parseInt(id),
                user_id: user.id
            }
        });

        if (!network) {
            return res.status(404).json({
                success: false,
                error: 'Network not found'
            });
        }

        await network.update({
            name: name.trim(),
            description: description?.trim() || null
        });

        console.log('✅ MarketNetwork updated:', network.id);

        res.json({
            success: true,
            data: {
                id: network.id,
                name: network.name,
                description: network.description,
                updatedAt: network.updated_at
            }
        });

    } catch (error) {
        console.error('❌ Update MarketNetwork error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

export async function deleteMarketNetwork(req, res) {
    try {
        const { id } = req.params;

        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const network = await MarketNetwork.findOne({
            where: {
                id: parseInt(id),
                user_id: user.id
            }
        });

        if (!network) {
            return res.status(404).json({
                success: false,
                error: 'Network not found'
            });
        }

        // SIMPLIFIED: Удаляем только QR Codes
        console.log('🗑️ Starting delete for MarketNetwork:', network.id);

        const deletedQRCodes = await QRCode.destroy({
            where: { market_network_id: network.id }
        });
        console.log('🗑️ Deleted', deletedQRCodes, 'QR codes');

        await network.destroy();

        console.log('🗑️ MarketNetwork DELETED:', network.id, 'name:', network.name);

        res.json({
            success: true,
            message: 'Network deleted successfully',
            deleted: {
                network: 1,
                qrCodes: deletedQRCodes
            }
        });

    } catch (error) {
        console.error('❌ Delete MarketNetwork error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

// =================== QR CODES ===================

export async function createQRCode(req, res) {
    try {
        const { name, marketNetworkId } = req.body;

        if (!name || !name.trim() || !marketNetworkId) {
            return res.status(400).json({
                success: false,
                error: 'Name and marketNetworkId are required'
            });
        }

        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        // Verify network ownership
        const network = await MarketNetwork.findOne({
            where: {
                id: parseInt(marketNetworkId),
                user_id: user.id
            }
        });

        if (!network) {
            return res.status(404).json({
                success: false,
                error: 'Network not found'
            });
        }

        const qrCode = await QRCode.create({
            name: name.trim(),
            user_id: user.id,
            market_network_id: network.id
        });

        console.log('✅ QR Code created:', qrCode.qr_id, 'for network:', network.id);

        res.json({
            success: true,
            data: {
                qrId: qrCode.qr_id,
                name: qrCode.name,
                marketNetworkId: qrCode.market_network_id,
                qrUrl: `https://cryptonow.com/${qrCode.qr_id}`,
                createdAt: qrCode.created_at
            }
        });

    } catch (error) {
        console.error('❌ Create QR Code error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

export async function getQRCodes(req, res) {
    try {
        const { networkId } = req.params;

        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        // Verify network ownership
        const network = await MarketNetwork.findOne({
            where: {
                id: parseInt(networkId),
                user_id: user.id
            }
        });

        if (!network) {
            return res.status(404).json({
                success: false,
                error: 'Network not found'
            });
        }

        const qrCodes = await QRCode.findAll({
            where: {
                market_network_id: network.id,
                user_id: user.id,
                is_active: true
            },
            order: [['created_at', 'DESC']]
        });

        res.json({
            success: true,
            data: qrCodes.map(qr => ({
                qrId: qr.qr_id,
                name: qr.name,
                qrUrl: `https://cryptonow.com/${qr.qr_id}`,
                createdAt: qr.created_at
            }))
        });

    } catch (error) {
        console.error('❌ Get QR Codes error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

export async function deleteQRCode(req, res) {
    try {
        const { id } = req.params;

        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const qrCode = await QRCode.findOne({
            where: {
                qr_id: parseInt(id),
                user_id: user.id,
                is_active: true
            }
        });

        if (!qrCode) {
            return res.status(404).json({
                success: false,
                error: 'QR Code not found'
            });
        }

        // Soft delete - mark as inactive
        await qrCode.update({
            is_active: false,
            deleted_at: new Date()
        });

        console.log('🗑️ QR Code soft deleted:', qrCode.qr_id, 'name:', qrCode.name);

        res.json({
            success: true,
            message: 'QR Code deleted successfully'
        });

    } catch (error) {
        console.error('❌ Delete QR Code error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}