// src/api/controllers/marketNetworkController.js
import MarketNetwork from '../../models/MarketNetwork.js';
import Market from '../../models/Market.js';
import Menu from '../../models/Menu.js';

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
                    model: Market,
                    as: 'markets',
                    required: false,
                    attributes: ['id', 'name', 'created_at']
                },
                {
                    model: Menu,
                    as: 'menus',
                    required: false,
                    attributes: ['id', 'name', 'created_at']
                }
            ],
            order: [
                ['created_at', 'DESC'],
                [{ model: Market, as: 'markets' }, 'created_at', 'DESC'],
                [{ model: Menu, as: 'menus' }, 'created_at', 'DESC']
            ]
        });

        // Transform data for API response
        const formattedNetworks = networks.map(network => ({
            id: network.id,
            name: network.name,
            description: network.description,
            createdAt: network.created_at,
            updatedAt: network.updated_at,
            markets: {
                count: network.markets?.length || 0,
                items: network.markets?.map(market => ({
                    id: market.id,
                    name: market.name,
                    createdAt: market.created_at
                })) || []
            },
            menus: {
                count: network.menus?.length || 0,
                items: network.menus?.map(menu => ({
                    id: menu.id,
                    name: menu.name,
                    createdAt: menu.created_at
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
                    model: Market,
                    as: 'markets',
                    required: false,
                    attributes: ['id', 'name', 'created_at']
                },
                {
                    model: Menu,
                    as: 'menus',
                    required: false,
                    attributes: ['id', 'name', 'created_at']
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
                markets: {
                    count: network.markets?.length || 0,
                    items: network.markets?.map(market => ({
                        id: market.id,
                        name: market.name,
                        createdAt: market.created_at
                    })) || []
                },
                menus: {
                    count: network.menus?.length || 0,
                    items: network.menus?.map(menu => ({
                        id: menu.id,
                        name: menu.name,
                        createdAt: menu.created_at
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