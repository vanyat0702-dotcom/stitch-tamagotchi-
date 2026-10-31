const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = '9265514437:AAHYai5uWPbrzK4z_Ko0Pw57MnSUX9W_eUM';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const db = new sqlite3.Database('./monsters.db', (err) => {
    if (err) console.error('Ошибка БД:', err.message);
    else console.log('База данных успешно подключена!');
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
        happiness INTEGER DEFAULT 100,
        status TEXT DEFAULT 'Дома с Настей'
    )
`);

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `🚀 Привет, ${msg.from.first_name}! Открывай галактическое тамагочи Стича и Насти!`, {
        reply_markup: {
            inline_keyboard: [[
                { text: "🎮 Запустить игру", web_app: { url: "https://stitch-game.onrender.com" } }
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
        `INSERT OR REPLACE INTO players (telegram_id, username, character, level, xp, hunger, energy, happiness, status) VALUES (?, ?, ?, 1, 0, 100, 100, 100, 'Дома с Настей')`,
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

        let { hunger, energy, happiness, xp, level, status } = player;
        let message = "Действие выполнено!";

        if (action === 'feed') {
            hunger = Math.min(100, hunger + 30);
            xp += 10;
            message = "Мням! Питомец с аппетитом поел!";
        } else if (action === 'play') {
            happiness = Math.min(100, happiness + 25);
            energy = Math.max(0, energy - 15);
            xp += 20;
            message = "Ухх! Весело поиграли!";
        } else if (action === 'sleep') {
            energy = 100;
            hunger = Math.max(0, hunger - 10);
            message = "Сладкие сны... Энергия на максимуме!";
        } else if (action === 'house_tea') {
            happiness = Math.min(100, happiness + 35);
            energy = Math.min(100, energy + 20);
            xp += 30;
            status = 'Пьет вечерний чай в общем доме ☕';
            message = "Уютный вечерний чай удался на славу! Настроение взлетело!";
        } else if (action === 'visit_gift') {
            happiness = Math.min(100, happiness + 40);
            xp += 25;
            status = 'В гостях у Насти 💕';
            message = "Подарок передан! Питомец в восторге от визита в гости!";
        } else if (action === 'travel_hawaii') {
            happiness = Math.min(100, happiness + 35);
            xp += 40;
            status = 'На пляжах Гавайев 🌴';
            message = "Отличный отдых на пляжах Гавайев! Питомец счастлив!";
        } else if (action === 'travel_space') {
            xp += 60;
            energy = Math.max(0, energy - 20);
            status = 'В галактическом патруле 🌌';
            message = "Миссия в космосе успешно выполнена! Получено много опыта!";
        }

        if (xp >= level * 60) {
            level += 1;
            xp = 0;
            message += ` 🎉 Поздравляем! Питомец поднялся до ${level} уровня!`;
        }

        db.run(
            `UPDATE players SET hunger = ?, energy = ?, happiness = ?, xp = ?, level = ?, status = ? WHERE telegram_id = ?`,
            [hunger, energy, happiness, xp, level, status, telegram_id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                db.get("SELECT * FROM players WHERE telegram_id = ?", [telegram_id], (err, updated) => {
                    res.json({ ...updated, actionMessage: message });
                });
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
app.listen(PORT, () => console.log(`Галактический сервер запущен на порту ${PORT}`));
