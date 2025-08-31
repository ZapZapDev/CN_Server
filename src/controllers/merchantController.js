// src/controllers/merchantControllers.js - ИСПРАВЛЕННАЯ ВЕРСИЯ без Category
import { MerchantBaseController } from './merchantBaseController.js';
import MarketNetwork from '../models/MarketNetwork.js';
import Market from '../models/Market.js';
import Table from '../models/Table.js';
import Menu from '../models/Menu.js';

// =================== MARKET NETWORK CONTROLLER ===================

class MarketNetworkController extends MerchantBaseController {
    constructor() {
        super(MarketNetwork, 'MarketNetwork', {
            include: [
                {
                    model: Market,
                    as: 'markets',
                    where: { is_active: true },
                    required: false,
                    attributes: ['id', 'name', 'created_at']
                },
                {
                    model: Menu,
                    as: 'menus',
                    where: { is_active: true },
                    required: false,
                    attributes: ['id', 'name', 'created_at']
                }
            ]
        });
    }

    prepareCreateData(body, user) {
        const { name, description } = body;
        return {
            name: name?.trim(),
            description: description?.trim() || null,
            user_id: user.id
        };
    }

    prepareUpdateData(body) {
        const { name, description } = body;
        return {
            name: name?.trim(),
            description: description?.trim() || null
        };
    }

    validateCreateData(data) {
        return data.name && data.name.length > 0;
    }

    validateUpdateData(data) {
        return data.name && data.name.length > 0;
    }

    async deactivateChildResources(network) {
        // При удалении сети деактивируем все её маркеты
        await Market.update(
            { is_active: false },
            { where: { market_network_id: network.id } }
        );
    }

    getAdditionalFields(resource) {
        return {
            description: resource.description,
            markets: resource.markets || [],
            menus: resource.menus || []
        };
    }
}

// =================== MARKET CONTROLLER ===================

class MarketController extends MerchantBaseController {
    constructor() {
        super(Market, 'Market', {
            include: [{
                model: Table,
                as: 'tables',
                where: { is_active: true },
                required: false,
                attributes: ['id', 'number', 'created_at']
            }]
        });
    }

    prepareCreateData(body, user) {
        const { name, marketNetworkId } = body;
        return {
            name: name?.trim(),
            user_id: user.id,
            market_network_id: parseInt(marketNetworkId)
        };
    }

    prepareUpdateData(body) {
        const { name } = body;
        return {
            name: name?.trim()
        };
    }

    validateCreateData(data) {
        return data.name &&
            data.name.length > 0 &&
            data.market_network_id &&
            !isNaN(data.market_network_id);
    }

    validateUpdateData(data) {
        return data.name && data.name.length > 0;
    }

    buildWhereCondition(req, user) {
        const { networkId } = req.params;
        return {
            market_network_id: parseInt(networkId),
            user_id: user.id,
            is_active: true
        };
    }

    // Переопределяем create для дополнительной валидации MarketNetwork
    create = async (req, res) => {
        try {
            const { marketNetworkId } = req.body;
            const user = req.authenticatedUser;

            // Проверяем, что MarketNetwork принадлежит пользователю
            const network = await MarketNetwork.findOne({
                where: {
                    id: parseInt(marketNetworkId),
                    user_id: user.id,
                    is_active: true
                }
            });

            if (!network) {
                return res.status(404).json({
                    success: false,
                    error: 'Network not found'
                });
            }

            // Вызываем базовый метод create
            return super.create(req, res);

        } catch (error) {
            console.error('❌ Create Market error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error'
            });
        }
    }

    getAdditionalFields(resource) {
        return {
            marketNetworkId: resource.market_network_id,
            tables: resource.tables || []
        };
    }
}

// =================== TABLE CONTROLLER ===================

class TableController extends MerchantBaseController {
    constructor() {
        super(Table, 'Table');
    }

    async prepareCreateData(body, user) {
        const { marketId } = body;
        const marketIdParsed = parseInt(marketId);

        // Находим максимальный номер стола в маркете
        const maxTable = await Table.findOne({
            where: {
                market_id: marketIdParsed,
                user_id: user.id,
                is_active: true
            },
            order: [['number', 'DESC']]
        });

        const nextNumber = maxTable ? maxTable.number + 1 : 1;

        return {
            number: nextNumber,
            user_id: user.id,
            market_id: marketIdParsed
        };
    }

    validateCreateData(data) {
        return data.market_id &&
            !isNaN(data.market_id) &&
            data.number &&
            data.number > 0;
    }

    buildWhereCondition(req, user) {
        const { marketId } = req.params;
        return {
            market_id: parseInt(marketId),
            user_id: user.id,
            is_active: true
        };
    }

    // Переопределяем create для дополнительной валидации Market
    create = async (req, res) => {
        try {
            const { marketId } = req.body;
            const user = req.authenticatedUser;

            // Проверяем, что Market принадлежит пользователю
            const market = await Market.findOne({
                where: {
                    id: parseInt(marketId),
                    user_id: user.id,
                    is_active: true
                }
            });

            if (!market) {
                return res.status(404).json({
                    success: false,
                    error: 'Market not found'
                });
            }

            // Вызываем базовый метод create
            return super.create(req, res);

        } catch (error) {
            console.error('❌ Create Table error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error'
            });
        }
    }

    // Переопределяем getList для правильной сортировки столов
    getList = async (req, res) => {
        try {
            const user = req.authenticatedUser;
            const { marketId } = req.params;

            // Проверяем доступ к маркету
            const market = await Market.findOne({
                where: {
                    id: parseInt(marketId),
                    user_id: user.id,
                    is_active: true
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
                    user_id: user.id,
                    is_active: true
                },
                order: [['number', 'ASC']] // Столы сортируем по номеру, а не по дате
            });

            res.json({
                success: true,
                data: tables.map(table => this.formatResource(table))
            });

        } catch (error) {
            console.error('❌ Get Tables error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error'
            });
        }
    }

    getAdditionalFields(resource) {
        return {
            number: resource.number,
            marketId: resource.market_id
        };
    }
}

// =================== MENU CONTROLLER ===================

class MenuController extends MerchantBaseController {
    constructor() {
        super(Menu, 'Menu');
    }

    prepareCreateData(body, user) {
        const { name, marketNetworkId } = body;
        return {
            name: name?.trim(),
            user_id: user.id,
            market_network_id: parseInt(marketNetworkId)
        };
    }

    prepareUpdateData(body) {
        const { name } = body;
        return {
            name: name?.trim()
        };
    }

    validateCreateData(data) {
        return data.name &&
            data.name.length > 0 &&
            data.market_network_id &&
            !isNaN(data.market_network_id);
    }

    validateUpdateData(data) {
        return data.name && data.name.length > 0;
    }

    buildWhereCondition(req, user) {
        const { networkId } = req.params;
        return {
            market_network_id: parseInt(networkId),
            user_id: user.id,
            is_active: true
        };
    }

    // Переопределяем create для дополнительной валидации MarketNetwork
    create = async (req, res) => {
        try {
            const { marketNetworkId } = req.body;
            const user = req.authenticatedUser;

            // Проверяем, что MarketNetwork принадлежит пользователю
            const network = await MarketNetwork.findOne({
                where: {
                    id: parseInt(marketNetworkId),
                    user_id: user.id,
                    is_active: true
                }
            });

            if (!network) {
                return res.status(404).json({
                    success: false,
                    error: 'Network not found'
                });
            }

            // Вызываем базовый метод create
            return super.create(req, res);

        } catch (error) {
            console.error('❌ Create Menu error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error'
            });
        }
    }

    getAdditionalFields(resource) {
        return {
            marketNetworkId: resource.market_network_id
        };
    }
}

// =================== СОЗДАЁМ ЭКЗЕМПЛЯРЫ КОНТРОЛЛЕРОВ ===================

const marketNetworkController = new MarketNetworkController();
const marketController = new MarketController();
const tableController = new TableController();
const menuController = new MenuController();

// =================== ЭКСПОРТИРУЕМ МЕТОДЫ ДЛЯ ИСПОЛЬЗОВАНИЯ В РОУТАХ ===================

// MarketNetwork CRUD
export const createMarketNetwork = marketNetworkController.create;
export const getMarketNetworks = marketNetworkController.getList;
export const updateMarketNetwork = marketNetworkController.update;
export const deleteMarketNetwork = marketNetworkController.delete;

// Market CRUD
export const createMarket = marketController.create;
export const getMarkets = marketController.getList;
export const updateMarket = marketController.update;
export const deleteMarket = marketController.delete;

// Table CRUD
export const createTable = tableController.create;
export const getTables = tableController.getList;
export const deleteTable = tableController.delete;

// Menu CRUD
export const createMenu = menuController.create;
export const getMenus = menuController.getList;
export const deleteMenu = menuController.delete;