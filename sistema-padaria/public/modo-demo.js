// =========================================================
// 🧪 INTERCEPTADOR GLOBAL - MODO DEMO
// =========================================================

// Funções globais para ligar e desligar o Modo Demo
window.ativarModoDemo = function() {
    sessionStorage.setItem('modoDemo', 'true');
    localStorage.setItem('modoDemo', 'true');
    location.reload();
};

window.desativarModoDemo = function() {
    sessionStorage.setItem('modoDemo', 'false');
    localStorage.setItem('modoDemo', 'false');
    location.reload();
};

(function() {
    const nativeFetch = window.fetch;

    // Verifica se o modo demo está ativo
    function isModoDemoAtivo() {
        return sessionStorage.getItem('modoDemo') === 'true' || 
               localStorage.getItem('modoDemo') === 'true';
    }

    // Intercepta requisições para o servidor
    window.fetch = async function (...args) {
        let [resource, config] = args;
        config = config || {};
        config.headers = config.headers || {};

        const modoDemo = isModoDemoAtivo();

        if (config.headers instanceof Headers) {
            config.headers.append('x-modo-demo', modoDemo ? 'true' : 'false');
        } else {
            config.headers['x-modo-demo'] = modoDemo ? 'true' : 'false';
        }

        if (modoDemo && typeof resource === 'string' && !resource.includes('demo=true')) {
            const separador = resource.includes('?') ? '&' : '?';
            resource = resource + separador + 'demo=true';
        }

        return nativeFetch(resource, config);
    };

    // Controla o aviso no topo
    function atualizarBannerDemo() {
        const modoDemo = isModoDemoAtivo();
        const bannerExistente = document.getElementById('banner-demo-aviso');

        if (modoDemo) {
            if (!bannerExistente) {
                const banner = document.createElement('div');
                banner.id = 'banner-demo-aviso';
                banner.innerHTML = `
                    🧪 <strong>MODO DEMO ATIVO</strong> — Você está visualizando dados de teste.
                    <button onclick="desativarModoDemo()" style="margin-left: 15px; background: #c0392b; color: white; border: none; padding: 3px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: bold;">
                        ❌ Sair do Modo Demo
                    </button>
                `;
                banner.style.cssText = 'background: #e67e22; color: white; text-align: center; padding: 8px; font-weight: bold; position: fixed; top: 0; left: 0; width: 100%; z-index: 99999; font-size: 0.9rem; box-shadow: 0 2px 5px rgba(0,0,0,0.2); height: 38px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;';
                document.body.prepend(banner);
            }
            document.body.style.paddingTop = '38px';
        } else {
            if (bannerExistente) {
                bannerExistente.remove();
            }
            document.body.style.paddingTop = '0px';
        }
    }

    window.addEventListener('DOMContentLoaded', atualizarBannerDemo);
    window.addEventListener('load', atualizarBannerDemo);
})();