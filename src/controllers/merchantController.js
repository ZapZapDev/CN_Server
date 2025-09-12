// src/controllers/merchantController.js
import User from '../models/User.js';
import MarketNetwork from '../models/MarketNetwork.js';
import QRCode from '../models/QRCode.js';
import authService from '../services/authService.js';

/**
 * Хелпер для ответа с ошибкой
 */
function errorResponse(res, code, message) {
    return res.status(code).json({ success: false, error: message });
}

/**
 * Аутентификация пользователя
 */
async function getAuthenticatedUser(req) {
    const { walletAddress, sessionKey } = req.body;
    if (!walletAddress || !sessionKey) return null;

    const validation = await authService.validateSession(
        walletAddress,
        sessionKey,
        req.ip,
        req.get('User-Agent')
    );

    if (!validation.success) return null;

    return await User.findOne({
        where: { sol_wallet: walletAddress, session_key: sessionKey }
    });
}

// =================== MARKET NETWORKS ===================

export async function createMarketNetwork(req, res) {
    try {
        const { name, description } = req.body;
        if (!name?.trim()) return errorResponse(res, 400, 'Name is required');

        const user = await getAuthenticatedUser(req);
        if (!user) return errorResponse(res, 401, 'Authentication required');

        const marketNetwork = await MarketNetwork.create({
            name: name.trim(),
            description: description?.trim() || null,
            user_id: user.id
        });

        console.log(`✅ MarketNetwork created [${marketNetwork.id}] by ${user.sol_wallet.slice(0, 8)}...`);

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
        console.error('MarketNetwork create error:', error);
        errorResponse(res, 500, 'Server error');
    }
}

export async function getMarketNetworks(req, res) {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return errorResponse(res, 401, 'Authentication required');

        const networks = await MarketNetwork.findAll({
            where: { user_id: user.id },
            order: [['created_at', 'DESC']]
        });

        res.json({
            success: true,
            data: networks.map(n => ({
                id: n.id,
                name: n.name,
                description: n.description,
                createdAt: n.created_at
            }))
        });
    } catch (error) {
        console.error('MarketNetworks get error:', error);
        errorResponse(res, 500, 'Server error');
    }
}

export async function updateMarketNetwork(req, res) {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        if (!name?.trim()) return errorResponse(res, 400, 'Name is required');

        const user = await getAuthenticatedUser(req);
        if (!user) return errorResponse(res, 401, 'Authentication required');

        const network = await MarketNetwork.findOne({
            where: { id: parseInt(id), user_id: user.id }
        });
        if (!network) return errorResponse(res, 404, 'Network not found');

        await network.update({
            name: name.trim(),
            description: description?.trim() || null
        });

        console.log(`✅ MarketNetwork updated [${network.id}]`);

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
        console.error('MarketNetwork update error:', error);
        errorResponse(res, 500, 'Server error');
    }
}

export async function deleteMarketNetwork(req, res) {
    try {
        const { id } = req.params;
        const user = await getAuthenticatedUser(req);
        if (!user) return errorResponse(res, 401, 'Authentication required');

        const network = await MarketNetwork.findOne({
            where: { id: parseInt(id), user_id: user.id }
        });
        if (!network) return errorResponse(res, 404, 'Network not found');

        const deletedQRCodes = await QRCode.destroy({ where: { market_network_id: network.id } });
        await network.destroy();

        console.log(`🗑️ MarketNetwork deleted [${network.id}], QR codes: ${deletedQRCodes}`);

        res.json({
            success: true,
            message: 'Network deleted successfully',
            deleted: { network: 1, qrCodes: deletedQRCodes }
        });
    } catch (error) {
        console.error('MarketNetwork delete error:', error);
        errorResponse(res, 500, 'Server error');
    }
}

// =================== QR CODES ===================

export async function createQRCode(req, res) {
    try {
        const { name, marketNetworkId } = req.body;
        if (!name?.trim() || !marketNetworkId) {
            return errorResponse(res, 400, 'Name and marketNetworkId are required');
        }

        const user = await getAuthenticatedUser(req);
        if (!user) return errorResponse(res, 401, 'Authentication required');

        const network = await MarketNetwork.findOne({
            where: { id: parseInt(marketNetworkId), user_id: user.id }
        });
        if (!network) return errorResponse(res, 404, 'Network not found');

        const qrCode = await QRCode.create({
            name: name.trim(),
            user_id: user.id,
            market_network_id: network.id
        });

        console.log(`✅ QR Code created [${qrCode.qr_id}] for network [${network.id}]`);

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
        console.error('QR Code create error:', error);
        errorResponse(res, 500, 'Server error');
    }
}

export async function getQRCodes(req, res) {
    try {
        const { networkId } = req.params;
        const user = await getAuthenticatedUser(req);
        if (!user) return errorResponse(res, 401, 'Authentication required');

        const network = await MarketNetwork.findOne({
            where: { id: parseInt(networkId), user_id: user.id }
        });
        if (!network) return errorResponse(res, 404, 'Network not found');

        const qrCodes = await QRCode.findAll({
            where: { market_network_id: network.id, user_id: user.id, is_active: true },
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
        console.error('QR Codes get error:', error);
        errorResponse(res, 500, 'Server error');
    }
}

export async function deleteQRCode(req, res) {
    try {
        const { id } = req.params;
        const user = await getAuthenticatedUser(req);
        if (!user) return errorResponse(res, 401, 'Authentication required');

        const qrCode = await QRCode.findOne({
            where: { qr_id: parseInt(id), user_id: user.id, is_active: true }
        });
        if (!qrCode) return errorResponse(res, 404, 'QR Code not found');

        await qrCode.update({ is_active: false, deleted_at: new Date() });

        console.log(`🗑️ QR Code soft deleted [${qrCode.qr_id}]`);

        res.json({ success: true, message: 'QR Code deleted successfully' });
    } catch (error) {
        console.error('QR Code delete error:', error);
        errorResponse(res, 500, 'Server error');
    }
}
