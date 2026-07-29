const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

// Configurações
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conexão e Criação do Banco de Dados
const db = new sqlite3.Database('./banco.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err.message);
    } else {
        console.log('📦 Conectado ao banco de dados SQLite!');
        criarTabelas();
    }
});

// Função para criar as tabelas do sistema
function criarTabelas() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS insumos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            quantidade REAL NOT NULL,
            unidade TEXT NOT NULL,
            custo_total REAL NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS receitas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            ingredientes TEXT NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo_barras TEXT UNIQUE NOT NULL,
            nome TEXT NOT NULL,
            quantidade INTEGER NOT NULL,
            preco_custo REAL NOT NULL,
            preco_venda REAL NOT NULL,
            data_fabricacao TEXT,
            data_validade TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS vendas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
            total_venda REAL NOT NULL,
            forma_pagamento TEXT NOT NULL
        )`);
        console.log('✅ Tabelas prontas no banco.db!');
    });
}

// --- ROTAS DA COZINHA ---

app.post('/api/insumos', (req, res) => {
    const { nome, quantidade, unidade, custo_total } = req.body;
    db.run(`INSERT INTO insumos (nome, quantidade, unidade, custo_total) VALUES (?, ?, ?, ?)`, 
    [nome, quantidade, unidade, custo_total], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Insumo cadastrado com sucesso!', id: this.lastID });
    });
});

app.get('/api/insumos', (req, res) => {
    db.all(`SELECT * FROM insumos ORDER BY nome ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

app.post('/api/receitas', (req, res) => {
    const { nome, ingredientes } = req.body;
    db.run(`INSERT INTO receitas (nome, ingredientes) VALUES (?, ?)`, 
    [nome, JSON.stringify(ingredientes)], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Receita salva com sucesso!', id: this.lastID });
    });
});

app.get('/api/receitas', (req, res) => {
    db.all(`SELECT * FROM receitas ORDER BY nome ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

// NOVA: Cadastrar Produto Pronto (Produção)
app.post('/api/produtos', (req, res) => {
    const { codigo_barras, nome, quantidade, preco_custo, preco_venda, data_fabricacao, data_validade } = req.body;
    const query = `INSERT INTO produtos (codigo_barras, nome, quantidade, preco_custo, preco_venda, data_fabricacao, data_validade) VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.run(query, [codigo_barras, nome, quantidade, preco_custo, preco_venda, data_fabricacao, data_validade], function(err) {
        if (err) return res.status(500).json({ erro: 'Erro ao salvar produto. Código de barras duplicado?' });
        res.json({ mensagem: 'Produção registrada com sucesso! Produto foi para o estoque.', id: this.lastID });
    });
});

// NOVA: Buscar Estoque de Produtos Prontos
app.get('/api/produtos', (req, res) => {
    db.all(`SELECT * FROM produtos ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🌐 Servidor rodando em: http://localhost:${PORT}`);
    console.log(`==================================================`);
});