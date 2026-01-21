"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const aliexpress_1 = require("../services/aliexpress");
const router = express_1.default.Router();
router.post('/', async (req, res) => {
    try {
        const product = req.body;
        if (!product || !product.title || !product.price) {
            res.status(400).json({ error: 'Invalid product data' });
            return;
        }
        const match = await (0, aliexpress_1.searchAliExpress)(product);
        const response = {
            found: !!match,
            match: match || undefined
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error in comparison route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
