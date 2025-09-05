import { Op } from 'sequelize';
import User from '../models/User.js';
import MarketNetwork from '../models/MarketNetwork.js';
import Market from '../models/Market.js';
import Table from '../models/Table.js';
import Menu from '../models/Menu.js';
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
            order: [['created_at', 'DESC']]
        });

        console.log('📊 Retrieved', networks.length, 'networks for user:', user.sol_wallet.slice(0, 8) + '...');

        res.json({
            success: true,
            data: networks.map(network => ({
                id: network.id,
                name: network.name,
                description: network.description,
                createdAt: network.created_at,
                markets: network.markets || [],
                menus: network.menus || []
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

// ИЗМЕНЕНО: Реальное удаление из БД
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

        // Каскадное удаление: сначала столы, потом маркеты и меню, потом сеть
        await Table.destroy({ where: { market_id: { [Op.in]: await Market.findAll({ where: { market_network_id: network.id }, attributes: ['id'] }).then(m => m.map(x => x.id)) } } });
        await Market.destroy({ where: { market_network_id: network.id } });
        await Menu.destroy({ where: { market_network_id: network.id } });
        await network.destroy();

        console.log('🗑️ MarketNetwork DELETED from DB:', network.id, 'name:', network.name);

        res.json({
            success: true,
            message: 'Network deleted successfully'
        });

    } catch (error) {
        console.error('❌ Delete MarketNetwork error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

// =================== MARKETS ===================

export async function createMarket(req, res) {
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

        const market = await Market.create({
            name: name.trim(),
            user_id: user.id,
            market_network_id: network.id
        });

        console.log('✅ Market created:', market.id, 'in network:', network.id);

        res.json({
            success: true,
            data: {
                id: market.id,
                name: market.name,
                marketNetworkId: market.market_network_id,
                createdAt: market.created_at
            }
        });

    } catch (error) {
        console.error('❌ Create Market error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

export async function getMarkets(req, res) {
    try {
        const { networkId } = req.params;

        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

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

        const markets = await Market.findAll({
            where: {
                market_network_id: network.id,
                user_id: user.id
            },
            include: [{
                model: Table,
                as: 'tables',
                required: false,
                attributes: ['id', 'number', 'created_at']
            }],
            order: [['created_at', 'DESC']]
        });

        res.json({
            success: true,
            data: markets.map(market => ({
                id: market.id,
                name: market.name,
                createdAt: market.created_at,
                tables: market.tables || []
            }))
        });

    } catch (error) {
        console.error('❌ Get Markets error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

export async function updateMarket(req, res) {
    try {
        const { id } = req.params;
        const { name } = req.body;

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

        const market = await Market.findOne({
            where: {
                id: parseInt(id),
                user_id: user.id
            }
        });

        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'Market not found'
            });
        }

        await market.update({
            name: name.trim()
        });

        console.log('✅ Market updated:', market.id);

        res.json({
            success: true,
            data: {
                id: market.id,
                name: market.name,
                updatedAt: market.updated_at
            }
        });

    } catch (error) {
        console.error('❌ Update Market error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

// ИЗМЕНЕНО: Реальное удаление из БД
export async function deleteMarket(req, res) {
    try {
        const { id } = req.params;

        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const market = await Market.findOne({
            where: {
                id: parseInt(id),
                user_id: user.id
            }
        });

        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'Market not found'
            });
        }

        // Сначала удаляем столы, потом маркет
        await Table.destroy({ where: { market_id: market.id } });
        await market.destroy();

        console.log('🗑️ Market DELETED from DB:', market.id, 'name:', market.name);

        res.json({
            success: true,
            message: 'Market deleted successfully'
        });

    } catch (error) {
        console.error('❌ Delete Market error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

// =================== TABLES ===================

export async function createTable(req, res) {
    try {
        const { marketId } = req.body;

        if (!marketId) {
            return res.status(400).json({
                success: false,
                error: 'MarketId is required'
            });
        }

        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const market = await Market.findOne({
            where: {
                id: parseInt(marketId),
                user_id: user.id
            }
        });

        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'Market not found'
            });
        }

        const maxTable = await Table.findOne({
            where: {
                market_id: market.id,
                user_id: user.id
            },
            order: [['number', 'DESC']]
        });

        const nextNumber = maxTable ? maxTable.number + 1 : 1;

        const table = await Table.create({
            number: nextNumber,
            user_id: user.id,
            market_id: market.id
        });

        console.log('✅ Table created:', table.id, 'number:', nextNumber, 'in market:', market.id);

        res.json({
            success: true,
            data: {
                id: table.id,
                number: table.number,
                marketId: table.market_id,
                createdAt: table.created_at
            }
        });

    } catch (error) {
        console.error('❌ Create Table error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

export async function getTables(req, res) {
    try {
        const { marketId } = req.params;

        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const market = await Market.findOne({
            where: {
                id: parseInt(marketId),
                user_id: user.id
            }
        });

        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'Market not found'
            });
        }

        const tables = await Table.findAll({
            where: {
                market_id: market.id,
                user_id: user.id
            },
            order: [['number', 'ASC']]
        });

        res.json({
            success: true,
            data: tables.map(table => ({
                id: table.id,
                number: table.number,
                createdAt: table.created_at
            }))
        });

    } catch (error) {
        console.error('❌ Get Tables error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

// ИЗМЕНЕНО: Реальное удаление из БД
export async function deleteTable(req, res) {
    try {
        const { id } = req.params;

        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const table = await Table.findOne({
            where: {
                id: parseInt(id),
                user_id: user.id
            }
        });

        if (!table) {
            return res.status(404).json({
                success: false,
                error: 'Table not found'
            });
        }

        await table.destroy();

        console.log('🗑️ Table DELETED from DB:', table.id, 'number:', table.number);

        res.json({
            success: true,
            message: 'Table deleted successfully'
        });

    } catch (error) {
        console.error('❌ Delete Table error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

// =================== MENUS ===================

export async function createMenu(req, res) {
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

        const menu = await Menu.create({
            name: name.trim(),
            user_id: user.id,
            market_network_id: network.id
        });

        console.log('✅ Menu created:', menu.id, 'in network:', network.id);

        res.json({
            success: true,
            data: {
                id: menu.id,
                name: menu.name,
                marketNetworkId: menu.market_network_id,
                createdAt: menu.created_at
            }
        });

    } catch (error) {
        console.error('❌ Create Menu error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

export async function getMenus(req, res) {
    try {
        const { networkId } = req.params;

        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

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

        const menus = await Menu.findAll({
            where: {
                market_network_id: network.id,
                user_id: user.id
            },
            order: [['created_at', 'DESC']]
        });

        res.json({
            success: true,
            data: menus.map(menu => ({
                id: menu.id,
                name: menu.name,
                createdAt: menu.created_at
            }))
        });

    } catch (error) {
        console.error('❌ Get Menus error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}

// ИЗМЕНЕНО: Реальное удаление из БД
export async function deleteMenu(req, res) {
    try {
        const { id } = req.params;

        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const menu = await Menu.findOne({
            where: {
                id: parseInt(id),
                user_id: user.id
            }
        });

        if (!menu) {
            return res.status(404).json({
                success: false,
                error: 'Menu not found'
            });
        }

        await menu.destroy();

        console.log('🗑️ Menu DELETED from DB:', menu.id, 'name:', menu.name);

        res.json({
            success: true,
            message: 'Menu deleted successfully'
        });

    } catch (error) {
        console.error('❌ Delete Menu error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
}