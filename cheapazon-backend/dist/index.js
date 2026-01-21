"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
const compare_1 = __importDefault(require("./routes/compare"));
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/api/compare', compare_1.default);
app.get('/', (req, res) => {
    res.send('Cheapazon Backend is running');
});
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
exports.default = app;
