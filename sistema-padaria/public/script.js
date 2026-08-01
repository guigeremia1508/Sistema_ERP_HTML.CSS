let insumosNoBanco = [];
let produtosNoBanco = [];

window.onload = async () => {
    await carregarListaInsumosGlobal();
};

async function carregarListaInsumosGlobal() {
    try {
        const res = await fetch('/api/produtos'); // Puxa do estoque geral de produtos
        const todosProdutos = await res.json();
        
        // FILTRO MÁGICO: Guarda na lista de insumos apenas os produtos com preço de venda = 0
        insumosNoBanco = todosProdutos.filter(p => p.preco_venda === 0);
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
// ESTOQUE MATÉRIA-PRIMA (AGORA BUSCANDO DO ESTOQUE GERAL)
// -----------------------------------------------------------
async function carregarEstoqueInsumos() {
    const tbody = document.getElementById('tabela-insumos-body');
    tbody.innerHTML = '<tr><td colspan="3" class="texto-vazio">Carregando estoque...</td></tr>';
    
    try {
        // Agora busca da API de produtos, não da antiga api/insumos
        const res = await fetch('/api/produtos'); 
        
        if (!res.ok) {
            throw new Error(`Erro de HTTP: ${res.status}`);
        }

        const todosProdutos = await res.json();
        
        // Filtra apenas as matérias-primas (preço_venda = 0)
        const materiasPrimas = todosProdutos.filter(p => p.preco_venda === 0);

        if (materiasPrimas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="texto-vazio">Nenhuma matéria-prima (custo venda = 0) encontrada no estoque.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        materiasPrimas.forEach(item => {
            const tr = document.createElement('tr');
            // Como a tabela de produtos mudou as colunas, adaptamos a visualização
            // Assumimos que o custo_total está no preco_custo
            tr.innerHTML = `
                <td><strong>${item.nome}</strong></td>
                <td>${item.quantidade}</td>
                <td>R$ ${item.preco_custo.toFixed(2)}</td>
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

    // Usa a lista filtrada insumosNoBanco
    const ingredientesDisponiveis = insumosNoBanco.filter(insumo => !nomesJaSelecionados.includes(insumo.nome));
    if (ingredientesDisponiveis.length === 0) {
        alert("Você já adicionou todos os ingredientes disponíveis no seu estoque!");
        return;
    }

    let optionsHTML = '<option value="">Selecione o ingrediente...</option>';
    ingredientesDisponiveis.forEach(ins => {
        // Como o item vem de 'produtos', a unidade está junto com a quantidade. 
        // Para simplificar, vou deixar a unidade como um traço genérico no data-attribute 
        // ou você pode extrair da string quantidade se precisar.
        optionsHTML += `<option value="${ins.nome}" data-unidade="Unid.">${ins.nome}</option>`;
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

        // Gera um ID aleatório de 4 dígitos para o produto
        const idCurto = Math.floor(1000 + Math.random() * 9000).toString();
        // Gera código de barras padrão no formato 20000XXXX (Padrão balança)
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
            document.getElementById('lista-ingredientes-producao').innerHTML = '';
        }
    });
}

async function carregarEstoquePronto() {
    const tbody = document.getElementById('tabela-estoque-pronto-body');
    tbody.innerHTML = '<tr><td colspan="5" class="texto-vazio">Carregando estoque pronto...</td></tr>';
    
    try {
        const res = await fetch('/api/produtos');
        const todosProdutos = await res.json();
        
        // NOVO FILTRO: Só mostra no estoque pronto os produtos que têm preço de venda maior que zero
        // E que possuem o código de barras começando com '20000' (fabricação própria)
        const produtosProntos = todosProdutos.filter(p => 
            p.preco_venda > 0 && 
            p.codigo_barras && 
            p.codigo_barras.startsWith('20000')
        );

        if (produtosProntos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="texto-vazio">Nenhum produto de fabricação própria no estoque. Produza algo primeiro!</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        produtosProntos.forEach(item => {
            const validade = item.data_validade ? item.data_validade.split('-').reverse().join('/') : '--/--/----';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.nome}</strong></td>
                <td>${item.codigo_barras}</td>
                <td>${item.quantidade}</td>
                <td>${validade}</td>
                <td>R$ ${item.preco_venda.toFixed(2)}</td>
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
    select.innerHTML = '<option value="">Carregando produtos...</option>';
    
    try {
        const res = await fetch('/api/produtos');
        const todosProdutos = await res.json();
        
        // NOVO FILTRO: Só permite pesar produtos de fabricação própria (código começa com 20000)
        produtosNoBanco = todosProdutos.filter(p => 
            p.preco_venda > 0 && 
            p.codigo_barras && 
            p.codigo_barras.startsWith('20000')
        );
        
        if (produtosNoBanco.length === 0) {
            select.innerHTML = '<option value="">Nenhum produto de fabricação própria no Estoque Pronto</option>';
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

// Quando o usuário seleciona um produto, ajusta a unidade automaticamente (KG ou UN)
function atualizarUnidadePesagem() {
    const select = document.getElementById('pesagem-produto');
    const idProduto = select.value;
    const produto = produtosNoBanco.find(p => p.id == idProduto);

    if (produto) {
        // Se no nome da quantidade contiver "KG" ou "G", seleciona KG. Senão UN.
        const selectMedida = document.getElementById('pesagem-medida');
        if (produto.quantidade.includes('KG') || produto.quantidade.includes('G')) {
            selectMedida.value = 'KG';
        } else {
            selectMedida.value = 'UN';
        }
        atualizarCalculoPesagem();
    }
}

// Calcula o valor conforme você digita
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
        // Se digitou em gramas, divide por 1000 para achar em quilos
        totalCalculado = (qtdInput / 1000) * produto.preco_venda;
    } else {
        totalCalculado = qtdInput * produto.preco_venda;
    }

    document.getElementById('pesagem-valor').value = `R$ ${totalCalculado.toFixed(2)}`;
}

document.getElementById('pesagem-qtd')?.addEventListener('input', atualizarCalculoPesagem);

// Função que cria a etiqueta e desenha o Código de Barras Real!
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

    // -------------------------------------------------------------
    // LÓGICA DO CÓDIGO DE BARRAS DE BALANÇA (PADRÃO NACIONAL EAN-13)
    // Começa com '2', depois 4 dígitos do ID, depois 5 dígitos do valor total em centavos!
    // Exemplo: Produto ID 1021 que deu R$ 12,50 -> 2 1021 01250 (12 dígitos + 1 digito verificador = 13)
    // -------------------------------------------------------------
    const idFormatado = String(produto.id).padStart(4, '0');
    const valorCentavos = String(Math.round(totalVal * 100)).padStart(5, '0');
    
    // Código final com 12 dígitos (O JsBarcode vai calcular o 13º automaticamente)
    const codigoEAN13 = `2${idFormatado}${valorCentavos}`;

    // Preenche o texto da etiqueta na tela
    document.getElementById('etq-nome-prod').textContent = produto.nome.toUpperCase();
    document.getElementById('etq-qtd').textContent = `${qtdInput} ${unidade}`;
    document.getElementById('etq-unit').textContent = `R$ ${produto.preco_venda.toFixed(2)}`;
    document.getElementById('etq-total').textContent = totalVal.toFixed(2);
    document.getElementById('etq-val').textContent = produto.data_validade ? produto.data_validade.split('-').reverse().join('/') : '--/--/----';

    // DESENHA O CÓDIGO DE BARRAS REAL USANDO A BIBLIOTECA JsBarcode
    JsBarcode("#codigo-barras-svg", codigoEAN13, {
        format: "EAN13",
        lineColor: "#000",
        width: 1.8,
        height: 45,
        displayValue: true, // Mostra os números em baixo das barrinhas
        fontSize: 12
    });

    // Exibe o painel de pré-visualização
    document.getElementById('container-etiqueta').style.display = 'block';
}

// FUNÇÃO REUTILIZÁVEL DE IMPRESSÃO TÉRMICA 58MM
function imprimirEtiqueta58mm() {
    window.print(); // O CSS @media print faz a mágica de imprimir só os 58mm!
}