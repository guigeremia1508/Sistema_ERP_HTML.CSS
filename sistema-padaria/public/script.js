let insumosNoBanco = [];

window.onload = async () => {
    await carregarListaInsumosGlobal();
};

async function carregarListaInsumosGlobal() {
    try {
        const res = await fetch('/api/insumos');
        insumosNoBanco = await res.json();
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

    // Gatilhos de atualização das abas
    if (idAba === 'aba-estoque-insumos') carregarEstoqueInsumos();
    if (idAba === 'aba-receitas') carregarListaInsumosGlobal();
    if (idAba === 'aba-producao') {
        carregarListaInsumosGlobal();
        carregarReceitasNoSelect(); // Puxa as receitas na hora de abrir a produção!
    }
    if (idAba === 'aba-estoque') carregarEstoquePronto(); // Puxa o estoque pronto!
}

// -----------------------------------------------------------
// INSUMOS
// -----------------------------------------------------------
const formInsumo = document.getElementById('form-insumo');
if (formInsumo) {
    formInsumo.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dados = {
            nome: document.getElementById('insumo-nome').value,
            quantidade: parseFloat(document.getElementById('insumo-qtd').value),
            unidade: document.getElementById('insumo-unidade').value,
            custo_total: parseFloat(document.getElementById('insumo-custo').value)
        };

        const res = await fetch('/api/insumos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        const resposta = await res.json();
        alert(resposta.mensagem || resposta.erro);
        if (res.ok) {
            formInsumo.reset();
            carregarListaInsumosGlobal();
        }
    });
}

async function carregarEstoqueInsumos() {
    const tbody = document.getElementById('tabela-insumos-body');
    tbody.innerHTML = '<tr><td colspan="3" class="texto-vazio">Carregando estoque...</td></tr>';
    try {
        const res = await fetch('/api/insumos');
        const insumos = await res.json();
        if (insumos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="texto-vazio">O estoque está vazio.</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        insumos.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${item.nome}</strong></td><td>${item.quantidade} ${item.unidade}</td><td>R$ ${item.custo_total.toFixed(2)}</td>`;
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="3" class="texto-vazio" style="color:red;">Erro ao buscar estoque.</td></tr>';
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
        optionsHTML += `<option value="${ins.nome}" data-unidade="${ins.unidade}">${ins.nome}</option>`;
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
    // Remove required da caixinha de receita se for manual
    document.getElementById('select-receita-pronta').required = (modo === 'receita');
}

// Nova função: Busca receitas no banco e coloca na caixinha
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

// Novo: Salvar Produto Pronto
const formProducao = document.getElementById('form-producao');
if (formProducao) {
    formProducao.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Gera um código de barras de 8 dígitos aleatório
        const codigoGerado = Math.floor(10000000 + Math.random() * 90000000).toString();

        const dados = {
            codigo_barras: codigoGerado,
            nome: document.getElementById('prod-nome').value,
            quantidade: parseFloat(document.getElementById('prod-qtd').value),
            preco_custo: 0, // Zero por enquanto, no futuro pode ser a soma dos ingredientes
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
            document.getElementById('lista-ingredientes-producao').innerHTML = ''; // Limpa se foi manual
        }
    });
}

// Nova função: Carregar o Estoque de Produtos Prontos na Aba 5
async function carregarEstoquePronto() {
    const tbody = document.getElementById('tabela-estoque-pronto-body');
    tbody.innerHTML = '<tr><td colspan="5" class="texto-vazio">Carregando estoque pronto...</td></tr>';
    
    try {
        const res = await fetch('/api/produtos');
        const produtos = await res.json();
        
        if (produtos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="texto-vazio">Nenhum produto no estoque. Produza algo primeiro!</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        produtos.forEach(item => {
            // Formatar data (YYYY-MM-DD para DD/MM/YYYY)
            const validade = item.data_validade.split('-').reverse().join('/');
            
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