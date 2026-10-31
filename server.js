const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

// Раздаем статические файлы из текущей папки
app.use(express.static(path.join(__dirname)));

// Базовый роут, чтобы сервер не падал при запросах
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
