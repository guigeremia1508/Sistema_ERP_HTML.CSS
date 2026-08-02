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

// =========================================================
// CONEXÃO COM OS DOIS BANCOS DE DADOS (REAL E DEMO)
// =========================================================
const dbReal = new sqlite3.Database('./banco.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco.db:', err.message);
    } else {
        console.log('📦 Conectado ao Banco REAL (banco.db)!');
        criarTabelas(dbReal, 'banco.db');
    }
});

const dbDemo = new sqlite3.Database('./banco_demo.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco_demo.db:', err.message);
    } else {
        console.log('🧪 Conectado ao Banco DEMO (banco_demo.db)!');
        criarTabelas(dbDemo, 'banco_demo.db', () => {
            // Verifica se o banco demo está vazio. Se estiver, popula automaticamente!
            dbDemo.get(`SELECT COUNT(*) as total FROM produtos`, (errCount, row) => {
                if (!errCount && row && row.total === 0) {
                    console.log('⚡ Banco DEMO está vazio. Populando dados de teste automaticamente...');
                    executarPovoamentoDemo();
                }
            });
        });
    }
});

// Função para identificar qual banco usar em cada requisição (Aceita Header ou Query Param)
function getDb(req) {
    const isHeaderDemo = req.headers['x-modo-demo'] === 'true';
    const isQueryDemo = req.query.demo === 'true' || req.query.isDemo === 'true';
    
    return (isHeaderDemo || isQueryDemo) ? dbDemo : dbReal;
}

// Função genérica para criar as tabelas em um banco
function criarTabelas(database, nomeBanco, callback) {
    database.serialize(() => {
        database.run(`CREATE TABLE IF NOT EXISTS insumos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            quantidade REAL NOT NULL,
            unidade TEXT NOT NULL,
            custo_total REAL NOT NULL
        )`);

        database.run(`CREATE TABLE IF NOT EXISTS receitas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            ingredientes TEXT NOT NULL
        )`);

        database.run(`CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo_barras TEXT UNIQUE NOT NULL,
            nome TEXT NOT NULL,
            quantidade TEXT NOT NULL,
            preco_custo REAL NOT NULL,
            preco_venda REAL NOT NULL,
            data_fabricacao TEXT,
            data_validade TEXT
        )`);

        database.run(`CREATE TABLE IF NOT EXISTS vendas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
            total_venda REAL NOT NULL,
            forma_pagamento TEXT NOT NULL,
            cpf TEXT DEFAULT 'Não Informado'
        )`);

        database.run(`CREATE TABLE IF NOT EXISTS despesas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            descricao TEXT NOT NULL,
            valor REAL NOT NULL,
            data_registro TEXT DEFAULT CURRENT_TIMESTAMP,
            tipo TEXT
        )`);

        database.run(`CREATE TABLE IF NOT EXISTS funcionarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cargo TEXT NOT NULL,
            salario_mensal REAL,
            carga_horaria_diaria REAL,
            senha TEXT NOT NULL,
            ativo INTEGER DEFAULT 1
        )`);

        database.run(`CREATE TABLE IF NOT EXISTS ponto (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_funcionario INTEGER,
            funcionario TEXT,
            entrada TEXT,
            saida TEXT,
            horas_trabalhadas REAL,
            valor_gerado REAL,
            FOREIGN KEY(id_funcionario) REFERENCES funcionarios(id)
        )`);

        database.run(`CREATE TABLE IF NOT EXISTS fluxo_caixa (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL, 
            valor REAL NOT NULL,
            motivo TEXT,
            data_registro TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

        database.run(`CREATE TABLE IF NOT EXISTS pedidos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT NOT NULL,
            tipo TEXT NOT NULL,
            data_hora TEXT NOT NULL,
            localizacao TEXT NOT NULL,
            itens TEXT NOT NULL,
            status TEXT DEFAULT 'Pendente'
        )`);

        console.log(`✅ Tabelas prontas no arquivo ${nomeBanco}!`);
        if (callback) callback();
    });
}

// =========================================================
// ROTAS DE INSUMOS E RECEITAS (COZINHA)
// =========================================================
app.post('/api/insumos', (req, res) => {
    const db = getDb(req);
    const { nome, quantidade, unidade, custo_total } = req.body;
    db.run(`INSERT INTO insumos (nome, quantidade, unidade, custo_total) VALUES (?, ?, ?, ?)`, 
    [nome, quantidade, unidade, custo_total], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Insumo cadastrado com sucesso!', id: this.lastID });
    });
});

app.get('/api/insumos', (req, res) => {
    const db = getDb(req);
    db.all(`SELECT * FROM insumos ORDER BY nome ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

app.post('/api/receitas', (req, res) => {
    const db = getDb(req);
    const { nome, ingredientes } = req.body;
    db.run(`INSERT INTO receitas (nome, ingredientes) VALUES (?, ?)`, 
    [nome, JSON.stringify(ingredientes)], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Receita salva com sucesso!', id: this.lastID });
    });
});

app.get('/api/receitas', (req, res) => {
    const db = getDb(req);
    db.all(`SELECT * FROM receitas ORDER BY nome ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

// =========================================================
// ROTA: COMPRAS (Alimenta o Estoque e as Despesas)
// =========================================================
app.post('/api/compras', (req, res) => {
    const db = getDb(req);
    const { codigo_barras, nome, unidade, quantidade, custo_total, preco_venda } = req.body;
    const precoVendaFinal = preco_venda ? parseFloat(preco_venda) : 0;
    
    db.get(`SELECT id, quantidade FROM produtos WHERE codigo_barras = ?`, [codigo_barras], (err, row) => {
        if (err) return res.status(500).json({ erro: err.message });
        
        if (row) {
            const novaQtd = parseFloat(row.quantidade) + parseFloat(quantidade);
            db.run(`UPDATE produtos SET quantidade = ?, preco_custo = ?, preco_venda = ? WHERE id = ?`, 
            [novaQtd, custo_total, precoVendaFinal, row.id]);
        } else {
            db.run(`INSERT INTO produtos (codigo_barras, nome, quantidade, preco_custo, preco_venda) VALUES (?, ?, ?, ?, ?)`, 
            [codigo_barras, nome, quantidade, custo_total, precoVendaFinal]);
        }
        
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
    const db = getDb(req);
    const { codigo_barras, nome, quantidade, preco_custo, preco_venda, data_fabricacao, data_validade } = req.body;
    const query = `INSERT INTO produtos (codigo_barras, nome, quantidade, preco_custo, preco_venda, data_fabricacao, data_validade) VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.run(query, [codigo_barras, nome, quantidade, preco_custo, preco_venda, data_fabricacao, data_validade], function(err) {
        if (err) return res.status(500).json({ erro: 'Erro ao salvar produto. Código de barras duplicado?' });
        res.json({ mensagem: 'Produção registrada com sucesso!', id: this.lastID });
    });
});

app.get('/api/produtos', (req, res) => {
    const db = getDb(req);
    db.all(`SELECT * FROM produtos ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

app.put('/api/produtos/:id', (req, res) => {
    const db = getDb(req);
    const { id } = req.params;
    const { quantidade, preco_venda } = req.body;
    db.run(`UPDATE produtos SET quantidade = ?, preco_venda = ? WHERE id = ?`, 
    [quantidade, preco_venda, id], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Produto atualizado com sucesso!' });
    });
});

app.delete('/api/produtos/:id', (req, res) => {
    const db = getDb(req);
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
    const db = getDb(req);
    
    // LOG: Isso vai imprimir no seu terminal o que chegou do caixa, ótimo para debugar!
    console.log("🛒 Recebendo nova venda:", req.body); 

    // Aceita vários formatos de nome para garantir que nada passe despercebido
    const total_venda = req.body.total_venda || req.body.total || 0;
    const formaPagto = req.body.metodo_pagamento || req.body.forma_pagamento || 'Dinheiro';
    const cpfCliente = req.body.cpf || 'Não Informado';
    const itens = req.body.itens || [];

    db.run(
        `INSERT INTO vendas (total_venda, forma_pagamento, cpf) VALUES (?, ?, ?)`, 
        [total_venda, formaPagto, cpfCliente], 
        function(err) {
            if (err) {
                console.error("❌ Erro ao salvar a venda:", err.message);
                return res.status(500).json({ erro: err.message });
            }
            
            const idVenda = this.lastID;
            console.log(`✅ Venda #${idVenda} salva com sucesso! Atualizando estoque...`);

            if (Array.isArray(itens) && itens.length > 0) {
                let itensAtualizados = 0;

                itens.forEach(item => {
                    // Cobre todas as possibilidades: ID do produto, ID do item ou Código de Barras
                    const prodId = item.produtoId || item.id || item.codigo_barras; 
                    const qtdVendida = parseFloat(item.quantidade) || 1;

                    // Tenta atualizar o estoque casando pelo ID OU pelo Código de Barras
                    db.run(
                        `UPDATE produtos SET quantidade = CAST(quantidade AS REAL) - ? WHERE id = ? OR codigo_barras = ?`,
                        [qtdVendida, prodId, String(prodId)],
                        (errUpdate) => {
                            if (errUpdate) {
                                console.error(`❌ Erro ao dar baixa no produto ${prodId}:`, errUpdate);
                            } else {
                                console.log(`📦 Baixa de ${qtdVendida} un do produto ${prodId} realizada.`);
                            }
                            
                            itensAtualizados++;
                            
                            // Só devolve a resposta final quando terminar de atualizar todos os itens
                            if (itensAtualizados === itens.length) {
                                res.json({ mensagem: 'Venda registrada e estoque atualizado com sucesso!', id: idVenda });
                            }
                        }
                    );
                });
            } else {
                console.log(`⚠️ Venda #${idVenda} salva, mas sem produtos vinculados.`);
                res.json({ mensagem: 'Venda registrada (sem itens especificados)!', id: idVenda });
            }
        }
    );
});

app.get('/api/vendas', (req, res) => {
    const db = getDb(req);
    db.all(`SELECT * FROM vendas ORDER BY data_hora DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

app.post('/api/despesas', (req, res) => {
    const db = getDb(req);
    const { descricao, valor, tipo } = req.body;
    db.run(`INSERT INTO despesas (descricao, valor, tipo) VALUES (?, ?, ?)`, 
    [descricao, valor, tipo], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Despesa registrada com sucesso!' });
    });
});

app.get('/api/despesas', (req, res) => {
    const db = getDb(req);
    db.all(`SELECT * FROM despesas ORDER BY data_registro DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

// =========================================================
// ROTAS DO CAIXA (SANGRIAS E SUPRIMENTOS)
// =========================================================
app.post('/api/fluxo-caixa', (req, res) => {
    const db = getDb(req);
    const { tipo, valor, motivo } = req.body;
    db.run(`INSERT INTO fluxo_caixa (tipo, valor, motivo) VALUES (?, ?, ?)`, 
    [tipo, valor, motivo], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Movimentação registrada com sucesso!' });
    });
});

app.get('/api/fluxo-caixa', (req, res) => {
    const db = getDb(req);
    db.all(`SELECT * FROM fluxo_caixa ORDER BY data_registro DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

// =========================================================
// ROTAS DE RH (FUNCIONÁRIOS E PONTO)
// =========================================================
app.post('/api/funcionarios', (req, res) => {
    const db = getDb(req);
    const { nome, cargo, salario_mensal, carga_horaria_diaria, senha } = req.body;
    db.run(`INSERT INTO funcionarios (nome, cargo, salario_mensal, carga_horaria_diaria, senha) VALUES (?, ?, ?, ?, ?)`, 
    [nome, cargo, salario_mensal, carga_horaria_diaria, senha], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Funcionário cadastrado com sucesso!' });
    });
});

app.get('/api/funcionarios', (req, res) => {
    const db = getDb(req);
    db.all(`SELECT id, nome, cargo, salario_mensal, carga_horaria_diaria, senha, ativo FROM funcionarios ORDER BY nome ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

app.delete('/api/funcionarios/:id', (req, res) => {
    const db = getDb(req);
    const { id } = req.params;
    db.run(`DELETE FROM funcionarios WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Funcionário excluído com sucesso!' });
    });
});

app.post('/api/ponto', (req, res) => {
    const db = getDb(req);
    const { funcionario_id, entrada, funcionario } = req.body;
    db.run(`INSERT INTO ponto (id_funcionario, funcionario, entrada) VALUES (?, ?, ?)`, 
    [funcionario_id, funcionario, entrada], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Ponto de entrada registrado!', id: this.lastID });
    });
});

app.put('/api/ponto', (req, res) => {
    const db = getDb(req);
    const { funcionario_id, saida, horas_trabalhadas } = req.body;
    
    db.get(`SELECT salario_mensal, carga_horaria_diaria FROM funcionarios WHERE id = ?`, [funcionario_id], (err, func) => {
        let valorGerado = 0;
        if (func && func.salario_mensal && func.carga_horaria_diaria) {
            const valorHora = (func.salario_mensal / 22) / func.carga_horaria_diaria;
            valorGerado = (horas_trabalhadas || 0) * valorHora;
        }

        const query = `
            UPDATE ponto 
            SET saida = ?, horas_trabalhadas = ?, valor_gerado = ? 
            WHERE id = (
                SELECT id FROM ponto 
                WHERE id_funcionario = ? AND saida IS NULL 
                ORDER BY id DESC LIMIT 1
            )
        `;
        
        db.run(query, [saida, horas_trabalhadas, valorGerado, funcionario_id], function(errUpdate) {
            if (errUpdate) return res.status(500).json({ erro: errUpdate.message });
            res.json({ mensagem: 'Ponto de saída registrado com sucesso!' });
        });
    });
});

app.get('/api/ponto', (req, res) => {
    const db = getDb(req);
    const query = `
        SELECT p.id, 
               COALESCE(p.funcionario, f.nome) as funcionario, 
               COALESCE(f.nome, p.funcionario) as nome, 
               p.entrada, 
               p.saida, 
               p.horas_trabalhadas as horas, 
               p.horas_trabalhadas,
               p.valor_gerado as custo,
               p.valor_gerado
        FROM ponto p
        LEFT JOIN funcionarios f ON p.id_funcionario = f.id
        ORDER BY p.id DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

// =========================================================
// ROTAS DE PEDIDOS
// =========================================================
app.get('/api/pedidos', (req, res) => {
    const db = getDb(req);
    db.all(`SELECT * FROM pedidos ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

app.post('/api/pedidos', (req, res) => {
    const db = getDb(req);
    const { codigo, tipo, data_hora, localizacao, itens, status } = req.body;
    db.run(`INSERT INTO pedidos (codigo, tipo, data_hora, localizacao, itens, status) VALUES (?, ?, ?, ?, ?, ?)`,
    [codigo, tipo, data_hora, localizacao, itens, status || 'Pendente'], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Pedido criado com sucesso!', id: this.lastID });
    });
});

app.put('/api/pedidos/:id', (req, res) => {
    const db = getDb(req);
    const { id } = req.params;
    const { status } = req.body;
    db.run(`UPDATE pedidos SET status = ? WHERE id = ?`, [status, id], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Status do pedido atualizado com sucesso!' });
    });
});

// =========================================================
// ROTA E FUNÇÃO: POPULAR EXCLUSIVAMENTE O BANCO DEMO
// =========================================================
function executarPovoamentoDemo(res = null) {
    dbDemo.serialize(() => {
        // 1. Zera APENAS o banco_demo.db
        dbDemo.run(`DELETE FROM insumos`);
        dbDemo.run(`DELETE FROM receitas`);
        dbDemo.run(`DELETE FROM produtos`);
        dbDemo.run(`DELETE FROM vendas`);
        dbDemo.run(`DELETE FROM despesas`);
        dbDemo.run(`DELETE FROM funcionarios`);
        dbDemo.run(`DELETE FROM ponto`);
        dbDemo.run(`DELETE FROM fluxo_caixa`);
        dbDemo.run(`DELETE FROM pedidos`);

        // Data atual no formato YYYY-MM-DD e DD/MM/YYYY
        const hojeData = new Date().toISOString().split('T')[0];
        const dataFormatada = hojeData.split('-').reverse().join('/');

        // 2. Insumos (Cozinha)
        const stmtInsumos = dbDemo.prepare(`INSERT INTO insumos (nome, quantidade, unidade, custo_total) VALUES (?, ?, ?, ?)`);
        stmtInsumos.run('Farinha de Trigo Especial', 150.0, 'Kg', 450.00);
        stmtInsumos.run('Açúcar Refinado', 80.0, 'Kg', 280.00);
        stmtInsumos.run('Fermento Biológico Seco', 12.0, 'Kg', 180.00);
        stmtInsumos.run('Manteiga sem Sal', 25.0, 'Kg', 625.00);
        stmtInsumos.run('Ovos Mantiqueira', 60.0, 'Dúzia', 540.00);
        stmtInsumos.run('Leite Integral', 100.0, 'L', 420.00);
        stmtInsumos.run('Café em Grão Gourmet', 30.0, 'Kg', 1200.00);
        stmtInsumos.run('Queijo Mussarela Fatiado', 20.0, 'Kg', 760.00);
        stmtInsumos.run('Presunto Cozido', 15.0, 'Kg', 420.00);
        stmtInsumos.finalize();

        // 3. Receitas (Cozinha)
        const stmtReceitas = dbDemo.prepare(`INSERT INTO receitas (nome, ingredientes) VALUES (?, ?)`);
        stmtReceitas.run('Pão Francês Tradicional (100 Un)', JSON.stringify([
            { nome: 'Farinha de Trigo Especial', quantidade: 10, unidade: 'Kg' },
            { nome: 'Fermento Biológico Seco', quantidade: 0.2, unidade: 'Kg' },
            { nome: 'Açúcar Refinado', quantidade: 0.1, unidade: 'Kg' }
        ]));
        stmtReceitas.run('Pão de Queijo Mineiro (Lote)', JSON.stringify([
            { nome: 'Queijo Mussarela Fatiado', quantidade: 2, unidade: 'Kg' },
            { nome: 'Ovos Mantiqueira', quantidade: 1, unidade: 'Dúzia' },
            { nome: 'Leite Integral', quantidade: 1, unidade: 'L' }
        ]));
        stmtReceitas.run('Bolo de Cenoura com Cobertura', JSON.stringify([
            { nome: 'Farinha de Trigo Especial', quantidade: 1, unidade: 'Kg' },
            { nome: 'Açúcar Refinado', quantidade: 0.8, unidade: 'Kg' },
            { nome: 'Ovos Mantiqueira', quantidade: 1, unidade: 'Dúzia' }
        ]));
        stmtReceitas.run('Croissant de Presunto e Queijo', JSON.stringify([
            { nome: 'Farinha de Trigo Especial', quantidade: 3, unidade: 'Kg' },
            { nome: 'Manteiga sem Sal', quantidade: 1, unidade: 'Kg' },
            { nome: 'Presunto Cozido', quantidade: 0.5, unidade: 'Kg' },
            { nome: 'Queijo Mussarela Fatiado', quantidade: 0.5, unidade: 'Kg' }
        ]));
        stmtReceitas.finalize();

        // 4. Produtos (Estoque / Vitrine)
        const stmtProdutos = dbDemo.prepare(`INSERT INTO produtos (codigo_barras, nome, quantidade, preco_custo, preco_venda, data_fabricacao, data_validade) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        stmtProdutos.run('789001', 'Pão Francês (Kg)', '45.0', 4.20, 13.90, hojeData, hojeData);
        stmtProdutos.run('789002', 'Pão de Queijo (Kg)', '18.5', 12.00, 38.00, hojeData, hojeData);
        stmtProdutos.run('789003', 'Bolo de Cenoura Inteiro', '6.0', 9.50, 28.00, hojeData, hojeData);
        stmtProdutos.run('789004', 'Café Expresso Tradicional', '150.0', 1.10, 5.50, hojeData, '2026-12-31');
        stmtProdutos.run('789005', 'Croissant Recheado', '22.0', 4.50, 12.50, hojeData, hojeData);
        stmtProdutos.run('789006', 'Coxinha de Frango c/ Catupiry', '30.0', 3.00, 8.50, hojeData, hojeData);
        stmtProdutos.run('789007', 'Suco Natural Laranja 500ml', '20.0', 2.80, 9.00, hojeData, hojeData);
        stmtProdutos.run('789008', 'Tortinha de Morango', '12.0', 5.00, 15.00, hojeData, hojeData);
        stmtProdutos.finalize();

        // 5. Funcionários (RH)
        const stmtFunc = dbDemo.prepare(`INSERT INTO funcionarios (nome, cargo, salario_mensal, carga_horaria_diaria, senha, ativo) VALUES (?, ?, ?, ?, ?, ?)`);
        stmtFunc.run('Roberto Gerente', 'Gerente', 4500.00, 8, 'admin', 1);
        stmtFunc.run('Ana Maria', 'Cozinha, Padeiro', 2600.00, 8, '123', 1);
        stmtFunc.run('Carlos Silva', 'Caixa', 1800.00, 8, '123', 1);
        stmtFunc.run('Juliana Costa', 'Pedidos, Atendente', 1750.00, 8, '123', 1);
        stmtFunc.run('Marcos Souza', 'Repositor', 1700.00, 8, '123', 1);
        stmtFunc.finalize();

        // 6. Despesas (Financeiro)
        const stmtDesp = dbDemo.prepare(`INSERT INTO despesas (descricao, valor, data_registro, tipo) VALUES (?, ?, ?, ?)`);
        stmtDesp.run('Aluguel do Imóvel Comercial', 3200.00, `${hojeData} 08:00:00`, 'Recorrente');
        stmtDesp.run('Conta de Energia (CPFL)', 850.00, `${hojeData} 09:15:00`, 'Recorrente');
        stmtDesp.run('Fornecedor de Farinha & Insumos', 2400.00, `${hojeData} 10:30:00`, 'Compra de Estoque');
        stmtDesp.run('Manutenção do Forno Industrial', 450.00, `${hojeData} 11:45:00`, 'Manutenção');
        stmtDesp.run('Conta de Água e Saneamento', 380.00, `${hojeData} 14:00:00`, 'Recorrente');
        stmtDesp.finalize();

        // 7. Vendas e Histórico de Caixa (120 Registros)
        const stmtVendas = dbDemo.prepare(`INSERT INTO vendas (total_venda, forma_pagamento, data_hora, cpf) VALUES (?, ?, ?, ?)`);
        const metodos = ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro'];
        const cpfsFicticios = ['123.456.789-00', '987.654.321-11', '456.789.123-44', '333.222.111-99', 'Não Informado', 'Não Informado'];
        const valoresTotais = [18.50, 42.00, 85.90, 12.00, 130.40, 27.50, 64.00, 15.00, 92.30, 210.00, 35.00];

        for (let i = 0; i < 120; i++) {
            let dataSimulada;
            const cpfSimulado = cpfsFicticios[i % cpfsFicticios.length];

            if (i >= 100) {
                // Vendas gravadas para HOJE (Caixa e Extrato)
                const hora = Math.floor(Math.random() * 8) + 8;
                const min = Math.floor(Math.random() * 59);
                const horaStr = hora < 10 ? `0${hora}` : `${hora}`;
                const minStr = min < 10 ? `0${min}` : `${min}`;
                dataSimulada = `${hojeData} ${horaStr}:${minStr}:00`;
            } else {
                // Vendas dos últimos meses para o Dashboard do Gerente
                const mes = Math.floor(Math.random() * 5) + 3;
                const dia = Math.floor(Math.random() * 27) + 1;
                const hora = Math.floor(Math.random() * 12) + 7;
                const min = Math.floor(Math.random() * 59);

                const mesFormatado = mes < 10 ? `0${mes}` : `${mes}`;
                const diaFormatado = dia < 10 ? `0${dia}` : `${dia}`;
                const horaFormatada = hora < 10 ? `0${hora}` : `${hora}`;
                const minFormatado = min < 10 ? `0${min}` : `${min}`;

                dataSimulada = `2026-${mesFormatado}-${diaFormatado} ${horaFormatada}:${minFormatado}:00`;
            }

            const valorSimulado = valoresTotais[i % valoresTotais.length] + (Math.random() * 15);
            const metodoSimulado = metodos[i % metodos.length];

            stmtVendas.run(valorSimulado.toFixed(2), metodoSimulado, dataSimulada, cpfSimulado);
        }
        stmtVendas.finalize();

        // 8. Relatório de Ponto (RH)
        const stmtPonto = dbDemo.prepare(`INSERT INTO ponto (id_funcionario, funcionario, entrada, saida, horas_trabalhadas, valor_gerado) VALUES (?, ?, ?, ?, ?, ?)`);
        stmtPonto.run(1, 'Roberto Gerente', `${hojeData} 07:00:00`, `${hojeData} 16:00:00`, 8.0, 163.63);
        stmtPonto.run(2, 'Ana Maria', `${hojeData} 06:00:00`, `${hojeData} 14:00:00`, 8.0, 94.54);
        stmtPonto.run(3, 'Carlos Silva', `${hojeData} 07:30:00`, `${hojeData} 15:30:00`, 8.0, 65.45);
        stmtPonto.run(4, 'Juliana Costa', `${hojeData} 08:00:00`, `${hojeData} 16:00:00`, 8.0, 63.63);
        stmtPonto.run(5, 'Marcos Souza', `${hojeData} 08:30:00`, `${hojeData} 16:30:00`, 8.0, 61.81);
        stmtPonto.finalize();

        // 9. Fluxo de Caixa (Extrato)
        const stmtCaixa = dbDemo.prepare(`INSERT INTO fluxo_caixa (tipo, valor, motivo, data_registro) VALUES (?, ?, ?, ?)`);
        stmtCaixa.run('Suprimento', 200.00, 'Troco Inicial do Caixa', `${hojeData} 07:00:00`);
        stmtCaixa.run('Sangria', 500.00, 'Retirada para Cofre', `${hojeData} 13:00:00`);
        stmtCaixa.finalize();

        // 10. Tela de Pedidos
        const stmtPedidos = dbDemo.prepare(`INSERT INTO pedidos (codigo, tipo, data_hora, localizacao, itens, status) VALUES (?, ?, ?, ?, ?, ?)`);
        stmtPedidos.run('#1041', 'Entrega/Retirada', `${dataFormatada} - 15:30`, 'Rua Sete de Setembro, 442 - Centro', '2x Pão Caseiro\n500g Frios\n1x Coca-Cola 2L', 'Pendente');
        stmtPedidos.run('#1042', 'Entrega/Retirada', `${dataFormatada} - 16:00`, 'Av. Brasil, 1020 - Bairro Novo', '1x Bolo de Cenoura\n10x Pão de Queijo', 'Pendente');
        stmtPedidos.run('#1043', 'Entrega/Retirada', `${dataFormatada} - 17:15`, 'Retirada no Balcão', '30x Pão Francês', 'Pendente');
        stmtPedidos.run('#1044', 'Entrega/Retirada', `${dataFormatada} - 17:45`, 'Rua das Flores, 88 - Jardim', '2x Suco Natural Laranja 500ml\n1x Torta de Frango', 'Pendente');
        stmtPedidos.run('#1045', 'Entrega/Retirada', `${dataFormatada} - 18:10`, 'Av. XV de Novembro, 310', '15x Sonho de Doce de Leite\n1x Café em Grão 500g', 'Pendente');
        stmtPedidos.run('#1046', 'Entrega/Retirada', `${dataFormatada} - 18:30`, 'Retirada no Balcão', '50x Salgadinhos Variados\n2x Guaraná 2L', 'Pendente');
        stmtPedidos.finalize(() => {
            console.log('🚀 Banco DEMO populado com sucesso!');
            if (res && !res.headersSent) {
                res.json({ mensagem: '🚀 Banco DEMO populado com sucesso sem afetar o Banco Real!' });
            }
        });
    });
}

// Aceita requisições GET, POST, etc.
app.all('/api/demo/popular', (req, res) => {
    executarPovoamentoDemo(res);
});

// =========================================================
// MAQUININHA DE CARTÃO
// =========================================================
let estadoMaquininha = { status: 'livre', metodo: '', valor: 0 };

app.get('/api/maquininha/status', (req, res) => {
    res.json(estadoMaquininha);
});

app.post('/api/maquininha/iniciar', (req, res) => {
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