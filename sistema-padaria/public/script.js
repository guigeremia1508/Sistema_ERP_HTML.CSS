// =========================================================
// 🪄 INTERCEPTADOR GLOBAL DO MODO DEMO vs MODO REAL
// =========================================================
const nativeFetch = window.fetch;
window.fetch = async function (...args) {
    let [resource, config] = args;
    config = config || {};
    config.headers = config.headers || {};

    // Se não houver definição, ativa o Modo Demo por padrão para testes
    if (sessionStorage.getItem('modoDemo') === null) {
        sessionStorage.setItem('modoDemo', 'true');
    }

    const modoDemo = sessionStorage.getItem('modoDemo') === 'true' || 
                     localStorage.getItem('modoDemo') === 'true';

    // Injeta o cabeçalho x-modo-demo em TODAS as chamadas para o servidor
    if (config.headers instanceof Headers) {
        config.headers.append('x-modo-demo', modoDemo ? 'true' : 'false');
    } else {
        config.headers['x-modo-demo'] = modoDemo ? 'true' : 'false';
    }

    // Adiciona o parâmetro ?demo=true na URL como garantia extra
    if (modoDemo && typeof resource === 'string' && !resource.includes('demo=true')) {
        const separador = resource.includes('?') ? '&' : '?';
        resource = resource + separador + 'demo=true';
    }

    return nativeFetch(resource, config);
};

// Função para exibir uma barra amarela avisando quando estiver no Modo Demo
function exibirAvisoModoDemo() {
    const modoDemo = sessionStorage.getItem('modoDemo') === 'true';
    if (modoDemo && !document.getElementById('banner-demo-aviso')) {
        const banner = document.createElement('div');
        banner.id = 'banner-demo-aviso';
        banner.innerHTML = '🧪 <strong>MODO DEMO ATIVO</strong> — Você está visualizando dados de teste (sem afetar o banco real).';
        banner.style.cssText = 'background: #e67e22; color: white; text-align: center; padding: 8px; font-weight: bold; position: sticky; top: 0; z-index: 9999; font-size: 0.9rem; box-shadow: 0 2px 5px rgba(0,0,0,0.2);';
        document.body.prepend(banner);
    }
}

// =========================================================
// INICIALIZAÇÃO
// =========================================================
let insumosNoBanco = [];
let produtosNoBanco = [];

window.onload = async () => {
    exibirAvisoModoDemo();
    await carregarListaInsumosGlobal();
};

async function carregarListaInsumosGlobal() {
    try {
        const resInsumos = await fetch('/api/insumos');
        let insumos = await resInsumos.json();

        // Se a rota de insumos não tiver nada, tenta puxar de produtos com preco_venda = 0
        if (!insumos || insumos.length === 0) {
            const resProd = await fetch('/api/produtos');
            const todosProdutos = await resProd.json();
            insumos = todosProdutos.filter(p => p.preco_venda === 0);
        }

        insumosNoBanco = insumos;
    } catch (error) {
        console.error("Erro ao carregar insumos:", error);
    }
}

// -----------------------------------------------------------
// NAVEGAÇÃO DE ABAS
// -----------------------------------------------------------
function abrirAba(evento, idAba) {
    const todasAbas = document.querySelectorAll('.aba');
    todasAbas.forEach(aba => aba.classList.remove('ativa'));
    
    const todosBotoes = document.querySelectorAll('.btn-aba');
    todosBotoes.forEach(btn => btn.classList.remove('ativo'));

    document.getElementById(idAba).classList.add('ativa');
    evento.currentTarget.classList.add('ativo');

    if (idAba === 'aba-estoque-insumos') carregarEstoqueInsumos();
    if (idAba === 'aba-receitas') carregarListaInsumosGlobal();
    if (idAba === 'aba-producao') {
        carregarListaInsumosGlobal();
        carregarReceitasNoSelect();
    }
    if (idAba === 'aba-estoque') carregarEstoquePronto();
    if (idAba === 'aba-pesagem') carregarProdutosPesagem();
}

// -----------------------------------------------------------
// ESTOQUE MATÉRIA-PRIMA
// -----------------------------------------------------------
async function carregarEstoqueInsumos() {
    const tbody = document.getElementById('tabela-insumos-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" class="texto-vazio">Carregando estoque...</td></tr>';
    
    try {
        const resInsumos = await fetch('/api/insumos');
        let materiasPrimas = await resInsumos.json();

        if (!materiasPrimas || materiasPrimas.length === 0) {
            const resProd = await fetch('/api/produtos');
            const todosProdutos = await resProd.json();
            materiasPrimas = todosProdutos.filter(p => p.preco_venda === 0);
        }

        if (!materiasPrimas || materiasPrimas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="texto-vazio">Nenhuma matéria-prima encontrada no estoque.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        materiasPrimas.forEach(item => {
            const tr = document.createElement('tr');
            const custo = item.custo_total !== undefined ? item.custo_total : item.preco_custo;
            tr.innerHTML = `
                <td><strong>${item.nome}</strong></td>
                <td>${item.quantidade} ${item.unidade || ''}</td>
                <td>R$ ${parseFloat(custo || 0).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Erro capturado:", error);
        tbody.innerHTML = '<tr><td colspan="3" class="texto-vazio" style="color:red;">Erro ao buscar estoque de matéria-prima.</td></tr>';
    }
}

// -----------------------------------------------------------
// RECEITAS
// -----------------------------------------------------------
function adicionarLinhaIngrediente(idContainer) {
    const container = document.getElementById(idContainer);
    const selectsAntigos = container.querySelectorAll('.select-ingrediente');
    const nomesJaSelecionados = Array.from(selectsAntigos).map(select => select.value);

    const ingredientesDisponiveis = insumosNoBanco.filter(insumo => !nomesJaSelecionados.includes(insumo.nome));
    if (ingredientesDisponiveis.length === 0) {
        alert("Você já adicionou todos os ingredientes disponíveis no seu estoque!");
        return;
    }

    let optionsHTML = '<option value="">Selecione o ingrediente...</option>';
    ingredientesDisponiveis.forEach(ins => {
        optionsHTML += `<option value="${ins.nome}" data-unidade="${ins.unidade || 'Unid.'}">${ins.nome}</option>`;
    });

    const div = document.createElement('div');
    div.className = 'grupo-duplo';
    div.style.marginBottom = '10px';
    div.style.alignItems = 'center';
    
    div.innerHTML = `
        <div class="grupo-input" style="margin-bottom: 0;">
            <select class="select-ingrediente" required onchange="atualizarUnidade(this)">
                ${optionsHTML}
            </select>
        </div>
        <div class="grupo-input" style="display: flex; gap: 5px; flex-direction: row; margin-bottom: 0; align-items: center;">
            <input type="number" step="0.001" class="input-qtd-ingrediente" placeholder="Qtd" style="width: 50%;" required>
            <span class="unidade-display" style="width: 25%; text-align: center;">---</span>
            <button type="button" onclick="this.parentElement.parentElement.remove()" style="background: #e74c3c; color: white; border: none; border-radius: 4px; padding: 10px; cursor: pointer; width: 25%; font-weight: bold;">X</button>
        </div>
    `;
    container.appendChild(div);
}

function atualizarUnidade(selectElement) {
    const spanUnidade = selectElement.parentElement.parentElement.querySelector('.unidade-display');
    const optionSelecionada = selectElement.options[selectElement.selectedIndex];
    if (optionSelecionada.value !== "") spanUnidade.textContent = optionSelecionada.getAttribute('data-unidade');
    else spanUnidade.textContent = "---";
}

const formReceita = document.getElementById('form-receita');
if (formReceita) {
    formReceita.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nomeReceita = document.getElementById('receita-nome').value;
        const container = document.getElementById('lista-ingredientes-receita');
        const linhas = container.querySelectorAll('.grupo-duplo');
        
        let ingredientesEscolhidos = [];
        linhas.forEach(linha => {
            const nome = linha.querySelector('.select-ingrediente').value;
            const qtd = linha.querySelector('.input-qtd-ingrediente').value;
            const unidade = linha.querySelector('.unidade-display').textContent;
            if (nome) ingredientesEscolhidos.push({ nome, quantidade: parseFloat(qtd), unidade });
        });

        if (ingredientesEscolhidos.length === 0) {
            alert("Adicione ingredientes para salvar a receita!");
            return;
        }

        const res = await fetch('/api/receitas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: nomeReceita, ingredientes: ingredientesEscolhidos })
        });

        const resposta = await res.json();
        alert(resposta.mensagem || resposta.erro);
        if (res.ok) {
            formReceita.reset();
            container.innerHTML = '';
        }
    });
}

// -----------------------------------------------------------
// PRODUÇÃO E ESTOQUE PRONTO
// -----------------------------------------------------------
function trocarModoProducao() {
    const modo = document.querySelector('input[name="tipo_producao"]:checked').value;
    document.getElementById('bloco-receita').style.display = (modo === 'receita') ? 'flex' : 'none';
    document.getElementById('bloco-manual').style.display = (modo === 'manual') ? 'block' : 'none';
    document.getElementById('select-receita-pronta').required = (modo === 'receita');
}

async function carregarReceitasNoSelect() {
    const select = document.getElementById('select-receita-pronta');
    if (!select) return;
    select.innerHTML = '<option value="">Carregando receitas...</option>';
    try {
        const res = await fetch('/api/receitas');
        const receitas = await res.json();
        if (receitas.length === 0) {
            select.innerHTML = '<option value="">Nenhuma receita cadastrada ainda.</option>';
            return;
        }
        select.innerHTML = '<option value="">Escolha qual Receita vai fazer...</option>';
        receitas.forEach(r => {
            select.innerHTML += `<option value="${r.id}">${r.nome}</option>`;
        });
    } catch (err) {
        select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

const formProducao = document.getElementById('form-producao');
if (formProducao) {
    formProducao.addEventListener('submit', async (e) => {
        e.preventDefault();

        const idCurto = Math.floor(1000 + Math.random() * 9000).toString();
        const codigoGerado = `20000${idCurto}`;
        
        const qtdNumero = document.getElementById('prod-qtd').value;
        const qtdUnidade = document.getElementById('prod-unidade').value;
        const quantidadeFinal = `${qtdNumero} ${qtdUnidade}`;

        const dados = {
            codigo_barras: codigoGerado,
            nome: document.getElementById('prod-nome').value,
            quantidade: quantidadeFinal, 
            preco_custo: 0, 
            preco_venda: parseFloat(document.getElementById('prod-venda').value),
            data_fabricacao: document.getElementById('prod-fab').value,
            data_validade: document.getElementById('prod-val').value
        };

        const res = await fetch('/api/produtos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        const resposta = await res.json();
        alert(resposta.mensagem || resposta.erro);

        if (res.ok) {
            formProducao.reset();
            const containerIng = document.getElementById('lista-ingredientes-producao');
            if (containerIng) containerIng.innerHTML = '';
        }
    });
}

async function carregarEstoquePronto() {
    const tbody = document.getElementById('tabela-estoque-pronto-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="texto-vazio">Carregando estoque pronto...</td></tr>';
    
    try {
        const res = await fetch('/api/produtos');
        const todosProdutos = await res.json();
        
        // Exibe todos os produtos destinados à venda (preco_venda > 0)
        const produtosProntos = todosProdutos.filter(p => p.preco_venda > 0);

        if (produtosProntos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="texto-vazio">Nenhum produto no estoque pronto.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        produtosProntos.forEach(item => {
            const validade = item.data_validade ? item.data_validade.split('-').reverse().join('/') : '--/--/----';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.nome}</strong></td>
                <td>${item.codigo_barras || 'N/A'}</td>
                <td>${item.quantidade}</td>
                <td>${validade}</td>
                <td>R$ ${parseFloat(item.preco_venda).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" class="texto-vazio" style="color:red;">Erro ao buscar estoque pronto.</td></tr>';
    }
}

// -----------------------------------------------------------
// PESAGEM, GERADOR DE CÓDIGO DE BARRAS & IMPRESSÃO 58MM
// -----------------------------------------------------------

async function carregarProdutosPesagem() {
    const select = document.getElementById('pesagem-produto');
    if (!select) return;
    select.innerHTML = '<option value="">Carregando produtos...</option>';
    
    try {
        const res = await fetch('/api/produtos');
        const todosProdutos = await res.json();
        
        produtosNoBanco = todosProdutos.filter(p => p.preco_venda > 0);
        
        if (produtosNoBanco.length === 0) {
            select.innerHTML = '<option value="">Nenhum produto no Estoque Pronto</option>';
            return;
        }

        select.innerHTML = '<option value="">Selecione o produto...</option>';
        produtosNoBanco.forEach(p => {
            select.innerHTML += `<option value="${p.id}">${p.nome} (Estoque: ${p.quantidade})</option>`;
        });
    } catch (err) {
        select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

function atualizarUnidadePesagem() {
    const select = document.getElementById('pesagem-produto');
    const idProduto = select.value;
    const produto = produtosNoBanco.find(p => p.id == idProduto);

    if (produto) {
        const selectMedida = document.getElementById('pesagem-medida');
        if (produto.quantidade.includes('KG') || produto.quantidade.includes('G')) {
            selectMedida.value = 'KG';
        } else {
            selectMedida.value = 'UN';
        }
        atualizarCalculoPesagem();
    }
}

function atualizarCalculoPesagem() {
    const select = document.getElementById('pesagem-produto');
    const idProduto = select.value;
    const produto = produtosNoBanco.find(p => p.id == idProduto);
    const qtdInput = parseFloat(document.getElementById('pesagem-qtd').value);

    if (!produto || isNaN(qtdInput)) {
        document.getElementById('pesagem-valor').value = "R$ 0.00";
        return;
    }

    const unidadeEscolhida = document.getElementById('pesagem-medida').value;
    let totalCalculado = 0;

    if (unidadeEscolhida === 'G') {
        totalCalculado = (qtdInput / 1000) * produto.preco_venda;
    } else {
        totalCalculado = qtdInput * produto.preco_venda;
    }

    document.getElementById('pesagem-valor').value = `R$ ${totalCalculado.toFixed(2)}`;
}

document.getElementById('pesagem-qtd')?.addEventListener('input', atualizarCalculoPesagem);

function gerarEtiqueta() {
    const select = document.getElementById('pesagem-produto');
    const idProduto = select.value;
    const produto = produtosNoBanco.find(p => p.id == idProduto);
    const qtdInput = parseFloat(document.getElementById('pesagem-qtd').value);
    const unidade = document.getElementById('pesagem-medida').value;

    if (!produto || isNaN(qtdInput)) {
        alert("Por favor, selecione um produto e digite o peso/quantidade válida!");
        return;
    }

    let totalVal = 0;
    if (unidade === 'G') totalVal = (qtdInput / 1000) * produto.preco_venda;
    else totalVal = qtdInput * produto.preco_venda;

    const idFormatado = String(produto.id).padStart(4, '0');
    const valorCentavos = String(Math.round(totalVal * 100)).padStart(5, '0');
    const codigoEAN13 = `2${idFormatado}${valorCentavos}`;

    document.getElementById('etq-nome-prod').textContent = produto.nome.toUpperCase();
    document.getElementById('etq-qtd').textContent = `${qtdInput} ${unidade}`;
    document.getElementById('etq-unit').textContent = `R$ ${produto.preco_venda.toFixed(2)}`;
    document.getElementById('etq-total').textContent = totalVal.toFixed(2);
    document.getElementById('etq-val').textContent = produto.data_validade ? produto.data_validade.split('-').reverse().join('/') : '--/--/----';

    JsBarcode("#codigo-barras-svg", codigoEAN13, {
        format: "EAN13",
        lineColor: "#000",
        width: 1.8,
        height: 45,
        displayValue: true,
        fontSize: 12
    });

    document.getElementById('container-etiqueta').style.display = 'block';
}

function imprimirEtiqueta58mm() {
    window.print();
}