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
        // --- TABELAS ORIGINAIS (Cozinha e Estoque) ---
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
            quantidade TEXT NOT NULL,
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

        // --- NOVAS TABELAS (Gerente, RH e Financeiro) ---
        db.run(`CREATE TABLE IF NOT EXISTS despesas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            descricao TEXT NOT NULL,
            valor REAL NOT NULL,
            data_registro TEXT DEFAULT CURRENT_TIMESTAMP,
            tipo TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS funcionarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cargo TEXT NOT NULL,
            salario_mensal REAL,
            carga_horaria_diaria REAL,
            senha TEXT NOT NULL,
            ativo INTEGER DEFAULT 1
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS ponto (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_funcionario INTEGER,
            entrada TEXT,
            saida TEXT,
            horas_trabalhadas REAL,
            valor_gerado REAL,
            FOREIGN KEY(id_funcionario) REFERENCES funcionarios(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS fluxo_caixa (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL, 
            valor REAL NOT NULL,
            motivo TEXT,
            data_registro TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

        console.log('✅ Tabelas prontas no banco.db (incluindo Módulo Gerente e Financeiro)!');
    });
}

// =========================================================
// ROTAS DE INSUMOS E RECEITAS (COZINHA)
// =========================================================
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

// =========================================================
// ROTA NOVA: COMPRAS (Alimenta o Estoque e as Despesas)
// =========================================================
app.post('/api/compras', (req, res) => {
    const { codigo_barras, nome, unidade, quantidade, custo_total, preco_venda } = req.body;
    
    // Garante que se o preço de venda vier vazio, ele salve como 0
    const precoVendaFinal = preco_venda ? parseFloat(preco_venda) : 0;
    
    // 1. Verifica se o produto já existe no estoque
    db.get(`SELECT id, quantidade FROM produtos WHERE codigo_barras = ?`, [codigo_barras], (err, row) => {
        if (err) return res.status(500).json({ erro: err.message });
        
        if (row) {
            // Se existir, atualiza a quantidade somando a compra nova
            const novaQtd = parseFloat(row.quantidade) + parseFloat(quantidade);
            db.run(`UPDATE produtos SET quantidade = ?, preco_custo = ?, preco_venda = ? WHERE id = ?`, 
            [novaQtd, custo_total, precoVendaFinal, row.id]);
        } else {
            // Se não existir, cadastra como um produto novo
            db.run(`INSERT INTO produtos (codigo_barras, nome, quantidade, preco_custo, preco_venda) VALUES (?, ?, ?, ?, ?)`, 
            [codigo_barras, nome, quantidade, custo_total, precoVendaFinal]);
        }
        
        // 2. Lança o custo total dessa compra no financeiro (despesas)
        db.run(`INSERT INTO despesas (descricao, valor, tipo) VALUES (?, ?, ?)`, 
        [`Compra de Estoque: ${nome}`, custo_total, 'Compra de Estoque'], function(err2) {
            if (err2) return res.status(500).json({ erro: err2.message });
            res.status(201).json({ mensagem: 'Compra registrada! Estoque e financeiro atualizados.' });
        });
    });
});

// =========================================================
// ROTAS DE PRODUTOS (ESTOQUE)
// =========================================================
app.post('/api/produtos', (req, res) => {
    const { codigo_barras, nome, quantidade, preco_custo, preco_venda, data_fabricacao, data_validade } = req.body;
    const query = `INSERT INTO produtos (codigo_barras, nome, quantidade, preco_custo, preco_venda, data_fabricacao, data_validade) VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.run(query, [codigo_barras, nome, quantidade, preco_custo, preco_venda, data_fabricacao, data_validade], function(err) {
        if (err) return res.status(500).json({ erro: 'Erro ao salvar produto. Código de barras duplicado?' });
        res.json({ mensagem: 'Produção registrada com sucesso!', id: this.lastID });
    });
});

app.get('/api/produtos', (req, res) => {
    db.all(`SELECT * FROM produtos ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

app.put('/api/produtos/:id', (req, res) => {
    const { id } = req.params;
    const { quantidade, preco_venda } = req.body;
    db.run(`UPDATE produtos SET quantidade = ?, preco_venda = ? WHERE id = ?`, 
    [quantidade, preco_venda, id], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Produto atualizado com sucesso!' });
    });
});

app.delete('/api/produtos/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM produtos WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Produto excluído com sucesso!' });
    });
});

// =========================================================
// ROTAS DO FINANCEIRO (VENDAS E DESPESAS)
// =========================================================
app.post('/api/vendas', (req, res) => {
    const { total_venda, forma_pagamento } = req.body;
    db.run(`INSERT INTO vendas (total_venda, forma_pagamento) VALUES (?, ?)`, 
    [total_venda, forma_pagamento], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Venda registrada com sucesso!', id: this.lastID });
    });
});

app.get('/api/vendas', (req, res) => {
    db.all(`SELECT * FROM vendas ORDER BY data_hora DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

app.post('/api/despesas', (req, res) => {
    const { descricao, valor, tipo } = req.body;
    db.run(`INSERT INTO despesas (descricao, valor, tipo) VALUES (?, ?, ?)`, 
    [descricao, valor, tipo], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Despesa registrada com sucesso!' });
    });
});

app.get('/api/despesas', (req, res) => {
    db.all(`SELECT * FROM despesas ORDER BY data_registro DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

// =========================================================
// ROTAS DO CAIXA (SANGRIAS E SUPRIMENTOS)
// =========================================================
app.post('/api/fluxo-caixa', (req, res) => {
    const { tipo, valor, motivo } = req.body;
    db.run(`INSERT INTO fluxo_caixa (tipo, valor, motivo) VALUES (?, ?, ?)`, 
    [tipo, valor, motivo], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Movimentação registrada com sucesso!' });
    });
});

app.get('/api/fluxo-caixa', (req, res) => {
    db.all(`SELECT * FROM fluxo_caixa ORDER BY data_registro DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

// =========================================================
// ROTAS DE RH (FUNCIONÁRIOS E PONTO) -> ATUALIZADAS!
// =========================================================
app.post('/api/funcionarios', (req, res) => {
    const { nome, cargo, salario_mensal, carga_horaria_diaria, senha } = req.body;
    db.run(`INSERT INTO funcionarios (nome, cargo, salario_mensal, carga_horaria_diaria, senha) VALUES (?, ?, ?, ?, ?)`, 
    [nome, cargo, salario_mensal, carga_horaria_diaria, senha], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Funcionário cadastrado com sucesso!' });
    });
});

app.get('/api/funcionarios', (req, res) => {
    // Não enviamos a senha para a tela por segurança
    db.all(`SELECT id, nome, cargo, salario_mensal, carga_horaria_diaria, ativo FROM funcionarios ORDER BY nome ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

app.get('/api/ponto', (req, res) => {
    const query = `
        SELECT p.id, f.nome, p.entrada, p.saida, p.horas_trabalhadas, p.valor_gerado 
        FROM ponto p
        JOIN funcionarios f ON p.id_funcionario = f.id
        ORDER BY p.entrada DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

// =========================================================
// SISTEMA DA MAQUININHA DE CARTÃO / PIX (CELULAR)
// =========================================================
let estadoMaquininha = { status: 'livre', metodo: '', valor: 0 };

app.get('/api/maquininha/status', (req, res) => {
    res.json(estadoMaquininha);
});

app.post('/api/maquininha/iniciar', express.json(), (req, res) => {
    estadoMaquininha = { 
        status: 'aguardando', 
        metodo: req.body.metodo, 
        valor: req.body.valor 
    };
    res.json({ success: true });
});

app.post('/api/maquininha/pagar', (req, res) => {
    estadoMaquininha.status = 'aprovado';
    res.json({ success: true });
});

app.post('/api/maquininha/reset', (req, res) => {
    estadoMaquininha = { status: 'livre', metodo: '', valor: 0 };
    res.json({ success: true });
});

// Inicialização do Servidor
app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🌐 Servidor rodando em: http://localhost:${PORT}`);
    console.log(`==================================================`);
});