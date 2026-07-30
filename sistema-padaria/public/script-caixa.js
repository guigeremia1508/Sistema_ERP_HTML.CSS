let produtosPDV = [];
let carrinho = [];
let totalVenda = 0;
let contadorItens = 0;
let cpfAtual = "0";

// Variável para controlar a comunicação com o Celular (Maquininha)
let intervalMaquininha = null;

// Variáveis para o Histórico/Extrato do Gerente
let totalVendasRealizadas = 0;
let faturamentoDiario = 0;
let ultimoMetodoPagamento = ''; 
let historicoVendas = []; // Guarda a lista de vendas

window.onload = async () => {
    await carregarProdutosParaVenda();
};

async function carregarProdutosParaVenda() {
    try {
        const res = await fetch('/api/produtos');
        produtosPDV = await res.json();
    } catch (error) {
        console.error("Erro ao carregar produtos:", error);
    }
}

// ---------------------------------------------------
// CONTROLE DE TELAS E MENUS
// ---------------------------------------------------
function voltarAoMenuCaixa() {
    document.getElementById('tela-menu').style.display = 'flex';
    document.getElementById('tela-pdv').classList.remove('ativo');
    document.querySelectorAll('.tela-consulta').forEach(t => t.style.display = 'none');
    document.getElementById('titulo-header').textContent = '🛒 Frente de Caixa';
}

function abrirConsulta(tipo) {
    document.getElementById('tela-menu').style.display = 'none';
    
    if (tipo === 'estoque') {
        document.getElementById('tela-consulta-estoque').style.display = 'block';
        const tbody = document.getElementById('lista-consulta-estoque');
        tbody.innerHTML = '';
        produtosPDV.forEach(p => {
            const val = p.data_fabricacao ? p.data_fabricacao.split('-').reverse().join('/') : '-';
            tbody.innerHTML += `<tr><td>${p.codigo_barras}</td><td>${p.nome}</td><td>${val}</td><td>${p.quantidade}</td></tr>`;
        });
    } 
    else if (tipo === 'extrato') {
        // TELA DE RESUMO
        document.getElementById('tela-consulta-extrato').style.display = 'block';
        document.getElementById('extrato-qtd').textContent = totalVendasRealizadas;
        document.getElementById('extrato-valor').textContent = `R$ ${faturamentoDiario.toFixed(2).replace('.', ',')}`;
    }
    else if (tipo === 'historico') {
        // TELA DE HISTÓRICO DETALHADO
        document.getElementById('tela-consulta-historico').style.display = 'block';
        const tbody = document.getElementById('lista-consulta-historico');
        tbody.innerHTML = '';
        
        if (historicoVendas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhuma venda realizada ainda.</td></tr>';
        } else {
            historicoVendas.forEach(venda => {
                tbody.innerHTML += `<tr>
                    <td>${venda.hora}</td>
                    <td>${venda.cpf}</td>
                    <td style="text-transform: capitalize;">${venda.metodo}</td>
                    <td style="color: green; font-weight: bold;">R$ ${venda.valor.toFixed(2).replace('.', ',')}</td>
                </tr>`;
            });
        }
    }
}

// ---------------------------------------------------
// FLUXO DE NOVA VENDA E MODAIS
// ---------------------------------------------------
function iniciarVenda() {
    document.getElementById('tela-menu').style.display = 'none';
    document.getElementById('tela-pdv').classList.add('ativo');
    document.getElementById('titulo-header').textContent = '🛒 Caixa Aberto - Nova Venda';
    
    limparVenda(); 

    document.getElementById('modal-cpf').style.display = 'flex';
    document.getElementById('input-cpf').value = '0';
    document.getElementById('input-cpf').focus();
}

function confirmarCPF() {
    let cpf = document.getElementById('input-cpf').value.trim();
    cpfAtual = (cpf === '0' || cpf === '') ? "Não informado" : cpf;
    
    document.getElementById('modal-cpf').style.display = 'none';
    document.getElementById('cliente-cpf-display').textContent = `CPF: ${cpfAtual}`;
    
    document.getElementById('input-codigo').focus();
}

function cancelarVenda() {
    if (confirm("Deseja realmente cancelar esta venda?")) {
        limparVenda();
        voltarAoMenuCaixa();
    }
}

async function limparVenda() {
    carrinho = [];
    totalVenda = 0;
    contadorItens = 0;
    document.getElementById('lista-carrinho').innerHTML = '';
    document.getElementById('ultimo-item').textContent = 'Caixa Livre';
    document.getElementById('total-compra').textContent = 'R$ 0,00';
    document.getElementById('input-codigo').value = '';
    document.getElementById('cliente-cpf-display').textContent = `CPF: Aguardando...`;

    // Reset da Maquininha no Celular ao cancelar/limpar
    try { await fetch('/api/maquininha/reset', { method: 'POST' }); } catch(e){}
    if (intervalMaquininha) clearInterval(intervalMaquininha);
}

// ---------------------------------------------------
// LEITURA DE CÓDIGO E CARRINHO
// ---------------------------------------------------
document.getElementById('input-codigo').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const texto = this.value.trim().toLowerCase();
        if (texto !== '') {
            processarProduto(texto);
            this.value = '';
        }
    }
});

function processarProduto(busca) {
    let produtoEncontrado = null;
    let precoFinalItem = 0;
    let nomeFinal = "";
    
    // Identifica código de barras de balança (ex: 2000100500 -> R$ 5,00)
    if (busca.startsWith('2') && busca.length >= 10 && !isNaN(busca)) {
        const idProdutoStr = busca.substring(1, 5);
        const valorCentavosStr = busca.substring(5, 10);
        const idProduto = parseInt(idProdutoStr, 10);
        const valorReais = parseInt(valorCentavosStr, 10) / 100;
        
        const prodBanco = produtosPDV.find(p => p.id == idProduto);
        if (prodBanco) {
            produtoEncontrado = prodBanco;
            precoFinalItem = valorReais;
            nomeFinal = `${prodBanco.nome} (Pesado)`;
        }
    } else {
        const prodBanco = produtosPDV.find(p => p.codigo_barras === busca || p.nome.toLowerCase().includes(busca));
        if (prodBanco) {
            produtoEncontrado = prodBanco;
            precoFinalItem = prodBanco.preco_venda;
            nomeFinal = prodBanco.nome;
        }
    }

    if (produtoEncontrado) adicionarAoCarrinho(nomeFinal, precoFinalItem, contadorItens + 1);
    else alert("Produto não encontrado!");
}

function adicionarAoCarrinho(nome, preco, idUnico) {
    contadorItens++;
    const item = { id: idUnico, numero: contadorItens, nome: nome, quantidade: 1, precoUnitario: preco, total: preco };
    carrinho.push(item);
    recalcularTotal();
    renderizarCarrinho();
}

function removerItem(idUnico) {
    carrinho = carrinho.filter(item => item.id !== idUnico);
    recalcularTotal();
    renderizarCarrinho();
    document.getElementById('input-codigo').focus();
}

function recalcularTotal() {
    totalVenda = carrinho.reduce((sum, item) => sum + item.total, 0);
    document.getElementById('total-compra').textContent = `R$ ${totalVenda.toFixed(2).replace('.', ',')}`;
    
    if (carrinho.length > 0) {
        let ultimo = carrinho[carrinho.length - 1];
        document.getElementById('ultimo-item').textContent = `${ultimo.nome} - R$ ${ultimo.total.toFixed(2)}`;
    } else {
        document.getElementById('ultimo-item').textContent = 'Caixa Livre';
    }
}

function renderizarCarrinho() {
    const tbody = document.getElementById('lista-carrinho');
    tbody.innerHTML = '';
    carrinho.forEach((item, index) => {
        item.numero = index + 1;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.numero}</td>
            <td><strong>${item.nome}</strong></td>
            <td>${item.quantidade}</td>
            <td>R$ ${item.precoUnitario.toFixed(2)}</td>
            <td><strong>R$ ${item.total.toFixed(2)}</strong></td>
            <td><button class="btn-remover" onclick="removerItem(${item.id})">🗑️</button></td>
        `;
        tbody.appendChild(tr);
    });
    const containerTabela = document.querySelector('.cupom-tabela-container');
    containerTabela.scrollTop = containerTabela.scrollHeight;
}

// ---------------------------------------------------
// PAGAMENTO E FINALIZAÇÃO
// ---------------------------------------------------
function fecharModal(id) { document.getElementById(id).style.display = 'none'; }

function abrirPagamento() {
    if (carrinho.length === 0) { alert("Passe algum produto!"); return; }
    document.getElementById('modal-pagamento').style.display = 'flex';
    document.getElementById('pag-total-txt').textContent = `R$ ${totalVenda.toFixed(2)}`;
    document.getElementById('select-pagamento').value = 'dinheiro';
    atualizarCamposPagamento();
}

function atualizarCamposPagamento() {
    const metodo = document.getElementById('select-pagamento').value;
    document.getElementById('bloco-dinheiro').style.display = (metodo === 'dinheiro') ? 'block' : 'none';
    document.getElementById('bloco-credito').style.display = (metodo === 'credito') ? 'block' : 'none';
    if (metodo === 'dinheiro') {
        document.getElementById('input-dinheiro-recebido').value = '';
        document.getElementById('txt-troco').textContent = 'R$ 0,00';
    }
}

function calcularTroco() {
    const recebido = parseFloat(document.getElementById('input-dinheiro-recebido').value) || 0;
    const troco = recebido - totalVenda;
    document.getElementById('txt-troco').textContent = troco >= 0 ? `R$ ${troco.toFixed(2)}` : 'R$ 0,00';
}

function processarPagamento() {
    const metodo = document.getElementById('select-pagamento').value;
    let valorFinalComTaxa = totalVenda;

    if (metodo === 'dinheiro') {
        const recebido = parseFloat(document.getElementById('input-dinheiro-recebido').value) || 0;
        if (recebido < totalVenda) { alert("Valor recebido é menor que o total da compra!"); return; }
        finalizarERegistrarVenda(metodo, valorFinalComTaxa);
    } 
    else if (metodo === 'credito') {
        valorFinalComTaxa = totalVenda * 1.05;
        iniciarSimulacaoTEF("APROXIME OU INSIRA O CARTÃO...", metodo, valorFinalComTaxa);
    }
    else if (metodo === 'debito') {
        iniciarSimulacaoTEF("APROXIME OU INSIRA O CARTÃO...", metodo, valorFinalComTaxa);
    }
    else if (metodo === 'pix') {
        iniciarSimulacaoTEF("ESCANEIE O QR CODE PIX...", metodo, valorFinalComTaxa);
    }
}

// INTEGRAÇÃO EM TEMPO REAL COM O CELULAR (MAQUININHA)
async function iniciarSimulacaoTEF(mensagem, metodo, valor) {
    document.getElementById('modal-pagamento').style.display = 'none';
    document.getElementById('modal-maquininha').style.display = 'flex';
    document.getElementById('texto-maquininha').textContent = "AGUARDANDO PAGAMENTO NO CELULAR...";
    document.getElementById('texto-maquininha').style.color = "#fff";

    // 1. Avisa o servidor para ligar a maquininha do celular
    try {
        await fetch('/api/maquininha/iniciar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ metodo: metodo, valor: valor })
        });
    } catch (e) {
        console.error("Erro ao conectar com a maquininha:", e);
    }

    // 2. Fica checando de 1 em 1 segundo se o cliente tocou na tela do celular
    intervalMaquininha = setInterval(async () => {
        try {
            const res = await fetch('/api/maquininha/status');
            const dados = await res.json();

            if (dados.status === 'aprovado') {
                clearInterval(intervalMaquininha); // Para de checar
                
                document.getElementById('texto-maquininha').textContent = "TRANSAÇÃO APROVADA!";
                document.getElementById('texto-maquininha').style.color = "#2ecc71";
                
                setTimeout(async () => {
                    document.getElementById('modal-maquininha').style.display = 'none';
                    // Libera a maquininha para o próximo cliente
                    await fetch('/api/maquininha/reset', { method: 'POST' });
                    // Finaliza a venda no sistema
                    finalizarERegistrarVenda(metodo, valor);
                }, 1500);
            }
        } catch(e) {
            console.log("Aguardando sinal do celular...");
        }
    }, 1000);
}

// ---------------------------------------------------
// FLUXO PÓS-VENDA E REGISTRO NO HISTÓRICO
// ---------------------------------------------------
function finalizarERegistrarVenda(metodo, valorCobrado) {
    document.getElementById('modal-pagamento').style.display = 'none';
    
    // Atualiza Total Geral
    totalVendasRealizadas++;
    faturamentoDiario += valorCobrado;
    ultimoMetodoPagamento = metodo; 
    
    // REGISTRA NA LISTA DE HISTÓRICO
    historicoVendas.push({
        hora: new Date().toLocaleTimeString(),
        cpf: cpfAtual,
        metodo: metodo,
        valor: valorCobrado
    });

    // Mostra o Modal de Decisão de Impressão
    document.getElementById('modal-pos-venda').style.display = 'flex';
}

function acaoFinalizarSemRecibo() {
    document.getElementById('modal-pos-venda').style.display = 'none';
    document.getElementById('modal-nova-ou-voltar').style.display = 'flex';
}

function acaoImprimirRecibo() {
    document.getElementById('modal-pos-venda').style.display = 'none';
    prepararEImprimirCupom(ultimoMetodoPagamento);
}

function acaoNovaVendaDirect() {
    document.getElementById('modal-nova-ou-voltar').style.display = 'none';
    iniciarVenda(); 
}

function acaoVoltarMenu() {
    document.getElementById('modal-nova-ou-voltar').style.display = 'none';
    limparVenda();
    voltarAoMenuCaixa();
}

function prepararEImprimirCupom(metodo) {
    const area = document.getElementById('area-impressao');
    area.innerHTML = `
        <div style="font-family: monospace; width: 58mm; padding: 2mm; margin: 0 auto; color: black; background: white;">
            <h3 style="text-align: center; margin: 0 0 5px 0;">PADARIA PÃO BRIOCHE</h3>
            <p style="text-align: center; font-size: 0.7rem; margin: 0 0 10px 0;">Recibo Não-Fiscal</p>
            <p style="font-size: 0.7rem;">CPF Consumidor: ${cpfAtual}</p>
            <p style="font-size: 0.7rem; border-bottom: 1px dashed #000; padding-bottom: 5px;">Data: ${new Date().toLocaleString()}</p>
            
            <table style="width: 100%; font-size: 0.7rem; margin-top: 5px;">
                ${carrinho.map(i => `<tr><td>${i.quantidade}x</td><td>${i.nome.substring(0, 12)}</td><td style="text-align: right;">${i.total.toFixed(2)}</td></tr>`).join('')}
            </table>
            
            <p style="text-align: right; font-weight: bold; font-size: 0.9rem; margin-top: 10px; border-top: 1px dashed #000; padding-top: 5px;">TOTAL: R$ ${totalVenda.toFixed(2)}</p>
            <p style="text-align: right; font-size: 0.7rem;">Pgto: ${metodo.toUpperCase()}</p>
            <p style="text-align: center; font-size: 0.7rem; margin-top: 15px;">Volte Sempre!</p>
        </div>
    `;

    document.body.childNodes.forEach(node => { if (node.style) node.style.display = 'none'; });
    area.style.display = 'block';
    
    window.print();

    area.style.display = 'none';
    document.body.childNodes.forEach(node => { if (node.style) node.style.display = ''; });
    
    document.getElementById('modal-nova-ou-voltar').style.display = 'flex';
}

// Atalho F2 para Pagar
document.addEventListener('keydown', function(e) {
    if (e.key === 'F2' && document.getElementById('tela-pdv').classList.contains('ativo')) {
        e.preventDefault();
        abrirPagamento();
    }
});