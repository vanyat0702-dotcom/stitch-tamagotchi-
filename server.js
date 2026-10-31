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
        status TEXT DEFAULT 'Дома с Настей',
        travel_end INTEGER DEFAULT 0
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT,
        item_name TEXT,
        item_type TEXT,
        quantity INTEGER DEFAULT 1
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
    db.get("SELECT * FROM players WHERE telegram_id = ?", [req.params.tgId], (err, player) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!player) return res.json({ registered: false });

        const now = Date.now();
        if (player.travel_end > 0 && now >= player.travel_end) {
            const lootTable = [
                { name: 'Гавайский кокос 🥥', type: 'food' },
                { name: 'Космический бургер 🍔', type: 'food' },
                { name: 'Лазерный мячик 🎾', type: 'toy' },
                { name: 'Сэндвич Рубена 🥪', type: 'food' }
            ];
            const foundItem = lootTable[Math.floor(Math.random() * lootTable.length)];

            db.get("SELECT * FROM inventory WHERE telegram_id = ? AND item_name = ?", [req.params.tgId, foundItem.name], (err, row) => {
                if (row) {
                    db.run("UPDATE inventory SET quantity = quantity + 1 WHERE id = ?", [row.id]);
                } else {
                    db.run("INSERT INTO inventory (telegram_id, item_name, item_type, quantity) VALUES (?, ?, ?, 1)", [req.params.tgId, foundItem.name, foundItem.type]);
                }
            });

            db.run("UPDATE players SET travel_end = 0, status = 'Вернулся из путешествия 🏆', xp = xp + 50 WHERE telegram_id = ?", [req.params.tgId]);
            bot.sendMessage(req.params.tgId, `🎉 Питомец вернулся из галактического путешествия и принес на склад предмет: *${foundItem.name}*!`, { parse_mode: 'Markdown' });
            
            player.travel_end = 0;
            player.status = 'Вернулся из путешествия 🏆';
            player.xp += 50;
        }

        db.all("SELECT * FROM inventory WHERE telegram_id = ?", [req.params.tgId], (err, inventory) => {
            res.json({ registered: true, data: player, inventory: inventory || [] });
        });
    });
});

app.post('/api/register', (req, res) => {
    const { telegram_id, username, character } = req.body;
    db.run(
        `INSERT OR REPLACE INTO players (telegram_id, username, character, level, xp, hunger, energy, happiness, status, travel_end) VALUES (?, ?, ?, 1, 0, 100, 100, 100, 'Дома', 0)`,
        [telegram_id, username, character],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run(`INSERT INTO inventory (telegram_id, item_name, item_type, quantity) VALUES (?, 'Гавайский кокос 🥥', 'food', 2)`, [telegram_id]);
            res.json({ success: true });
        }
    );
});

app.post('/api/use-item', (req, res) => {
    const { telegram_id, item_name } = req.body;
    db.get("SELECT * FROM inventory WHERE telegram_id = ? AND item_name = ?", [telegram_id, item_name], (err, item) => {
        if (!item || item.quantity <= 0) return res.status(400).json({ error: "Предмет закончился на складе!" });

        db.get("SELECT * FROM players WHERE telegram_id = ?", [telegram_id], (err, player) => {
            let { hunger, happiness, xp, level } = player;
            
            if (item.item_type === 'food') {
                hunger = Math.min(100, hunger + 35);
                xp += 15;
            } else {
                happiness = Math.min(100, happiness + 30);
                xp += 15;
            }

            if (xp >= level * 60) { level += 1; xp = 0; }

            if (item.quantity === 1) {
                db.run("DELETE FROM inventory WHERE id = ?", [item.id]);
            } else {
                db.run("UPDATE inventory SET quantity = quantity - 1 WHERE id = ?", [item.id]);
            }

            db.run("UPDATE players SET hunger = ?, happiness = ?, xp = ?, level = ? WHERE telegram_id = ?", [hunger, happiness, xp, level, telegram_id], () => {
                res.json({ success: true });
            });
        });
    });
});

app.post('/api/action', (req, res) => {
    const { telegram_id, action } = req.body;
    db.get("SELECT * FROM players WHERE telegram_id = ?", [telegram_id], (err, player) => {
        if (err || !player) return res.status(400).json({ error: "Игрок не найден" });

        let { happiness, status } = player;
        let message = "Действие выполнено!";

        if (action === 'house_tea') {
            happiness = Math.min(100, happiness + 35);
            status = 'Пьет вечерний чай в общем доме ☕';
            message = "Уютный вечерний чай удался! Настроение на высоте.";
        } else if (action === 'visit_gift') {
            happiness = Math.min(100, happiness + 40);
            status = 'В гостях у Насти 💕';
            message = "Подарок передан! Питомец в восторге от визита!";
        }

        db.run(`UPDATE players SET happiness = ?, status = ? WHERE telegram_id = ?`, [happiness, status, telegram_id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            db.get("SELECT * FROM players WHERE telegram_id = ?", [telegram_id], (err, updated) => {
                res.json({ ...updated, actionMessage: message });
            });
        });
    });
});

app.post('/api/start-travel', (req, res) => {
    const { telegram_id } = req.body;
    const travelDuration = 30 * 60 * 1000;
    const travelEnd = Date.now() + travelDuration;

    db.run("UPDATE players SET travel_end = ?, status = 'Ушел наводить бардак в галактике 🚀' WHERE telegram_id = ?", [travelEnd, telegram_id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        bot.sendMessage(telegram_id, "🚀 Питомец отправился на поиски приключений! Жди уведомления через 30 минут.");
        res.json({ success: true, travel_end: travelEnd });
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
