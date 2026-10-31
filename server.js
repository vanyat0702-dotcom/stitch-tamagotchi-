const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = 'ТОКЕН_ВСТАВИШЬ_ПОТОМ';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const db = new sqlite3.Database('./monsters.db', (err) => {
    if (err) console.error('Ошибка БД:', err.message);
    else console.log('База данных подключена!');
});

db.run(`
    CREATE TABLE IF NOT EXISTS players (
        telegram_id TEXT PRIMARY KEY,
        username TEXT,
        character TEXT,
        level INTEGER DEFAULT 1,
        xp INTEGER DEFAULT 0,
        hunger INTEGER DEFAULT 100,
        energy INTEGER DEFAULT 100,
        happiness INTEGER DEFAULT 100
    )
`);

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `Привет, ${msg.from.first_name}! Открывай наше космическое мини-приложение!`, {
        reply_markup: {
            inline_keyboard: [[
                { text: "🚀 Запустить Игру", web_app: { url: "ТВОЯ_ССЫЛКА_ИЗ_RENDER" } }
            ]]
        }
    });
});

app.get('/api/player/:tgId', (req, res) => {
    db.get("SELECT * FROM players WHERE telegram_id = ?", [req.params.tgId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.json({ registered: false });
        res.json({ registered: true, data: row });
    });
});

app.post('/api/register', (req, res) => {
    const { telegram_id, username, character } = req.body;
    db.run(
        `INSERT INTO players (telegram_id, username, character) VALUES (?, ?, ?)`,
        [telegram_id, username, character],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.post('/api/action', (req, res) => {
    const { telegram_id, action } = req.body;
    db.get("SELECT * FROM players WHERE telegram_id = ?", [telegram_id], (err, player) => {
        if (err || !player) return res.status(400).json({ error: "Игрок не найден" });

        let { hunger, energy, happiness, xp, level } = player;
        if (action === 'feed') hunger = Math.min(100, hunger + 25);
        if (action === 'play') { happiness = Math.min(100, happiness + 20); energy = Math.max(0, energy - 15); xp += 15; }
        if (action === 'sleep') energy = Math.min(100, energy + 40);

        if (xp >= level * 50) { level += 1; xp = 0; }

        db.run(
            `UPDATE players SET hunger = ?, energy = ?, happiness = ?, xp = ?, level = ? WHERE telegram_id = ?`,
            [hunger, energy, happiness, xp, level, telegram_id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ hunger, energy, happiness, xp, level });
            }
        );
    });
});

app.get('/api/partner/:myTgId', (req, res) => {
    db.get("SELECT * FROM players WHERE telegram_id != ?", [req.params.myTgId], (err, partner) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ partner: partner || null });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
