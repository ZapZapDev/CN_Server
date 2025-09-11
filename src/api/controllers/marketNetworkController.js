// src/api/controllers/marketNetworkController.js - CLEAN VERSION
import MarketNetwork from '../../models/MarketNetwork.js';
import QRCode from '../../models/QRCode.js';

/**
 * Get all market networks for the authenticated user
 * @route GET /api/v1/market-networks
 */
export async function getMarketNetworks(req, res) {
    try {
        const userId = req.userId;

        const networks = await MarketNetwork.findAll({
            where: {
                user_id: userId
            },
            include: [
                {
                    model: QRCode,
                    as: 'qrCodes',
                    required: false,
                    where: { is_active: true },
                    attributes: ['qr_id', 'name', 'created_at']
                }
            ],
            order: [
                ['created_at', 'DESC'],
                [{ model: QRCode, as: 'qrCodes' }, 'created_at', 'DESC']
            ]
        });

        // Transform data for API response
        const formattedNetworks = networks.map(network => ({
            id: network.id,
            name: network.name,
            description: network.description,
            createdAt: network.created_at,
            updatedAt: network.updated_at,
            qrCodes: {
                count: network.qrCodes?.length || 0,
                items: network.qrCodes?.map(qr => ({
                    qrId: qr.qr_id,
                    name: qr.name,
                    createdAt: qr.created_at
                })) || []
            }
        }));

        res.json({
            success: true,
            data: {
                networks: formattedNetworks,
                total: formattedNetworks.length
            },
            meta: {
                timestamp: new Date().toISOString(),
                version: 'v1'
            }
        });

    } catch (error) {
        console.error('Get market networks API error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch market networks',
            code: 'FETCH_ERROR'
        });
    }
}

/**
 * Get a specific market network by ID
 * @route GET /api/v1/market-networks/:id
 */
export async function getMarketNetwork(req, res) {
    try {
        const { id } = req.params;
        const userId = req.userId;

        const network = await MarketNetwork.findOne({
            where: {
                id: parseInt(id),
                user_id: userId
            },
            include: [
                {
                    model: QRCode,
                    as: 'qrCodes',
                    required: false,
                    where: { is_active: true },
                    attributes: ['qr_id', 'name', 'created_at']
                }
            ]
        });

        if (!network) {
            return res.status(404).json({
                success: false,
                error: 'Market network not found',
                code: 'NOT_FOUND'
            });
        }

        res.json({
            success: true,
            data: {
                id: network.id,
                name: network.name,
                description: network.description,
                createdAt: network.created_at,
                updatedAt: network.updated_at,
                qrCodes: {
                    count: network.qrCodes?.length || 0,
                    items: network.qrCodes?.map(qr => ({
                        qrId: qr.qr_id,
                        name: qr.name,
                        createdAt: qr.created_at
                    })) || []
                }
            },
            meta: {
                timestamp: new Date().toISOString(),
                version: 'v1'
            }
        });

    } catch (error) {
        console.error('Get market network API error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch market network',
            code: 'FETCH_ERROR'
        });
    }
}