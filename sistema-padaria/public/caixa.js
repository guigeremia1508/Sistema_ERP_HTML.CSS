// =========================================================
// VARIÁVEIS GLOBAIS DO CAIXA
// =========================================================
let carrinho = [];
let produtosEstoque = [];
let cpfCliente = 'Não Informado';
let vendaUltimaSucesso = null;

// Verifica se está rodando no Modo Demo
function isModoDemo() {
    return localStorage.getItem('modoDemo') === 'true';
}

function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'x-modo-demo': isModoDemo() ? 'true' : 'false'
    };
}

// =========================================================
// NAVEGAÇÃO ENTRE TELAS DO CAIXA
// =========================================================
function voltarAoMenuCaixa() {
    // Esconde todas as consultas e a tela do PDV
    document.querySelectorAll('.tela-consulta').forEach(el => el.style.display = 'none');
    const telaPdv = document.getElementById('tela-pdv');
    if (telaPdv) {
        telaPdv.style.display = 'none';
        telaPdv.classList.remove('ativo');
    }
    
    // Exibe o menu principal do caixa
    const telaMenu = document.getElementById('tela-menu');
    if (telaMenu) telaMenu.style.display = 'flex';

    // Fecha qualquer modal aberto
    fecharModais();
}

function abrirConsulta(tipo) {
    const telaMenu = document.getElementById('tela-menu');
    if (telaMenu) telaMenu.style.display = 'none';

    document.querySelectorAll('.tela-consulta').forEach(el => el.style.display = 'none');

    if (tipo === 'estoque') {
        document.getElementById('tela-consulta-estoque').style.display = 'block';
        carregarConsultaEstoque();
    } else if (tipo === 'extrato') {
        document.getElementById('tela-consulta-extrato').style.display = 'block';
        carregarConsultaExtrato();
    } else if (tipo === 'historico') {
        document.getElementById('tela-consulta-historico').style.display = 'block';
        carregarConsultaHistorico();
    }
}

function fecharModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.style.display = 'none';
}

function fecharModais() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
}

// =========================================================
// 1. CARREGAR CONSULTAS (ESTOQUE, EXTRATO E HISTÓRICO)
// =========================================================

// A) CONSULTAR ESTOQUE
async function carregarConsultaEstoque() {
    const tbody = document.getElementById('lista-consulta-estoque');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando estoque...</td></tr>';

    try {
        const res = await fetch('/api/produtos', { headers: getHeaders() });
        const produtos = await res.json();

        tbody.innerHTML = '';
        if (!produtos || produtos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum produto cadastrado.</td></tr>';
            return;
        }

        produtos.forEach(p => {
            const fab = p.data_fabricacao ? new Date(p.data_fabricacao).toLocaleDateString('pt-BR') : '-';
            tbody.innerHTML += `
                <tr>
                    <td>${p.codigo_barras}</td>
                    <td><strong>${p.nome}</strong></td>
                    <td>${fab}</td>
                    <td>${p.quantidade}</td>
                </tr>
            `;
        });
    } catch (err) {
        console.error('Erro ao carregar estoque:', err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Erro ao buscar produtos.</td></tr>';
    }
}

// B) CONSULTAR EXTRATO
async function carregarConsultaExtrato() {
    const elQtd = document.getElementById('extrato-qtd');
    const elValor = document.getElementById('extrato-valor');

    try {
        const res = await fetch('/api/vendas', { headers: getHeaders() });
        const vendas = await res.json();

        let faturamento = 0;
        let totalVendas = vendas.length || 0;

        vendas.forEach(v => {
            faturamento += parseFloat(v.total_venda || 0);
        });

        if (elQtd) elQtd.innerText = totalVendas;
        if (elValor) elValor.innerText = faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch (err) {
        console.error('Erro ao carregar extrato:', err);
    }
}

// C) CONSULTAR HISTÓRICO DE VENDAS
async function carregarConsultaHistorico() {
    const tbody = document.getElementById('lista-consulta-historico');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando histórico...</td></tr>';

    try {
        const res = await fetch('/api/vendas', { headers: getHeaders() });
        const vendas = await res.json();

        tbody.innerHTML = '';
        if (!vendas || vendas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhuma venda realizada.</td></tr>';
            return;
        }

        vendas.forEach(v => {
            const horaStr = new Date(v.data_hora).toLocaleString('pt-BR');
            const valorTotalStr = parseFloat(v.total_venda).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            tbody.innerHTML += `
                <tr>
                    <td>${horaStr}</td>
                    <td>${v.cpf || 'Não Informado'}</td>
                    <td><span style="background:#e1f5fe; padding:3px 8px; border-radius:4px; font-size:0.85rem;">${v.forma_pagamento}</span></td>
                    <td><strong>${valorTotalStr}</strong></td>
                </tr>
            `;
        });
    } catch (err) {
        console.error('Erro ao carregar histórico:', err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Erro ao buscar histórico de vendas.</td></tr>';
    }
}

// =========================================================
// 2. FLUXO DE VENDA (PDV)
// =========================================================

function iniciarVenda() {
    document.getElementById('input-cpf').value = '0';
    document.getElementById('modal-cpf').style.display = 'flex';
}

async function confirmarCPF() {
    const valCpf = document.getElementById('input-cpf').value.trim();
    cpfCliente = (valCpf === '0' || valCpf === '') ? 'Não Informado' : valCpf;

    document.getElementById('cliente-cpf-display').innerText = `CPF: ${cpfCliente}`;
    fecharModal('modal-cpf');

    // Abre o Layout do PDV
    document.getElementById('tela-menu').style.display = 'none';
    const pdv = document.getElementById('tela-pdv');
    pdv.style.display = 'flex';
    pdv.classList.add('ativo');

    // Reseta carrinho e busca produtos do estoque para pesquisa rápida
    carrinho = [];
    atualizarCarrinhoTela();
    
    try {
        const res = await fetch('/api/produtos', { headers: getHeaders() });
        produtosEstoque = await res.json();
    } catch (e) {
        console.error('Erro ao buscar produtos:', e);
    }

    const inputBarra = document.getElementById('input-codigo');
    if (inputBarra) {
        inputBarra.value = '';
        inputBarra.focus();
    }
}

// Adicionar produto ao carrinho via Leitor / Pesquisa
function buscarEAdicionarProduto(busca) {
    if (!busca) return;
    const termo = busca.trim().toLowerCase();

    const produtoEncontrado = produtosEstoque.find(p => 
        p.codigo_barras.toLowerCase() === termo || 
        p.nome.toLowerCase().includes(termo)
    );

    if (produtoEncontrado) {
        const itemExistente = carrinho.find(item => item.id === produtoEncontrado.id);
        if (itemExistente) {
            itemExistente.quantidade += 1;
        } else {
            carrinho.push({
                id: produtoEncontrado.id,
                nome: produtoEncontrado.nome,
                preco: parseFloat(produtoEncontrado.preco_venda),
                quantidade: 1
            });
        }

        document.getElementById('ultimo-item').innerText = `${produtoEncontrado.nome} (R$ ${parseFloat(produtoEncontrado.preco_venda).toFixed(2)})`;
        atualizarCarrinhoTela();
    } else {
        alert('Produto não encontrado!');
    }

    const inputBarra = document.getElementById('input-codigo');
    if (inputBarra) {
        inputBarra.value = '';
        inputBarra.focus();
    }
}

function removerDoCarrinho(index) {
    carrinho.splice(index, 1);
    atualizarCarrinhoTela();
}

function calcularTotalCarrinho() {
    return carrinho.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
}

function atualizarCarrinhoTela() {
    const tbody = document.getElementById('lista-carrinho');
    tbody.innerHTML = '';

    carrinho.forEach((item, index) => {
        const totalItem = (item.preco * item.quantidade).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const valorUnit = item.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        tbody.innerHTML += `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${item.nome}</strong></td>
                <td>${item.quantidade}</td>
                <td>${valorUnit}</td>
                <td>${totalItem}</td>
                <td><button class="btn-remover" onclick="removerDoCarrinho(${index})">X</button></td>
            </tr>
        `;
    });

    const total = calcularTotalCarrinho();
    document.getElementById('total-compra').innerText = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function cancelarVenda() {
    if (confirm('Tem certeza que deseja cancelar esta venda?')) {
        carrinho = [];
        voltarAoMenuCaixa();
    }
}

// =========================================================
// 3. PAGAMENTO E FINALIZAÇÃO DA VENDA
// =========================================================

function abrirPagamento() {
    if (carrinho.length === 0) {
        alert('O carrinho está vazio!');
        return;
    }

    const total = calcularTotalCarrinho();
    document.getElementById('pag-total-txt').innerText = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    atualizarCamposPagamento();
    document.getElementById('modal-pagamento').style.display = 'flex';
}

function atualizarCamposPagamento() {
    const metodo = document.getElementById('select-pagamento').value;
    const blocoDinheiro = document.getElementById('bloco-dinheiro');
    const blocoCredito = document.getElementById('bloco-credito');

    if (blocoDinheiro) blocoDinheiro.style.display = (metodo === 'dinheiro') ? 'block' : 'none';
    if (blocoCredito) blocoCredito.style.display = (metodo === 'credito') ? 'block' : 'none';

    calcularTroco();
}

function calcularTroco() {
    const total = calcularTotalCarrinho();
    const recebidoInput = document.getElementById('input-dinheiro-recebido');
    const txtTroco = document.getElementById('txt-troco');

    if (!recebidoInput || !txtTroco) return;

    const recebido = parseFloat(recebidoInput.value) || 0;
    const troco = recebido - total;

    txtTroco.innerText = (troco > 0 ? troco : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function processarPagamento() {
    const total = calcularTotalCarrinho();
    const metodoSelect = document.getElementById('select-pagamento');
    const metodo = metodoSelect.options[metodoSelect.selectedIndex].text;

    const dadosVenda = {
        total_venda: total,
        metodo_pagamento: metodo,
        cpf: cpfCliente,
        itens: carrinho
    };

    try {
        const response = await fetch('/api/vendas', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(dadosVenda)
        });

        const res = await response.json();

        if (response.ok) {
            vendaUltimaSucesso = { ...dadosVenda, id: res.id, data: new Date().toLocaleString('pt-BR') };
            
            fecharModal('modal-pagamento');
            document.getElementById('modal-pos-venda').style.display = 'flex';
        } else {
            alert(`Erro ao registrar venda: ${res.erro}`);
        }
    } catch (err) {
        console.error('Erro de conexão ao salvar venda:', err);
        alert('Erro ao se conectar ao servidor.');
    }
}

// Ações pós-venda
function acaoImprimirRecibo() {
    alert('🖨️ Enviando cupom para a impressora...');
    acaoFinalizarSemRecibo();
}

function acaoFinalizarSemRecibo() {
    fecharModal('modal-pos-venda');
    document.getElementById('modal-nova-ou-voltar').style.display = 'flex';
}

function acaoNovaVendaDirect() {
    fecharModal('modal-nova-ou-voltar');
    iniciarVenda();
}

function acaoVoltarMenu() {
    fecharModal('modal-nova-ou-voltar');
    voltarAoMenuCaixa();
}

// =========================================================
// INICIALIZAÇÃO DE EVENTOS TECLADO E COMPONENTES
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    // Evento de Enter no input de código de barras
    const inputBarra = document.getElementById('input-codigo');
    if (inputBarra) {
        inputBarra.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                buscarEAdicionarProduto(inputBarra.value);
            }
        });
    }

    // Atalhos de Teclado
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
            e.preventDefault();
            const pdv = document.getElementById('tela-pdv');
            if (pdv && pdv.style.display !== 'none') {
                abrirPagamento();
            }
        }
    });
});