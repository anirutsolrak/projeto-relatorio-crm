import React from 'react';

function Navigation({
    activePage,
    onNavigate,
    mobileMenuOpen, // Prop para controlar visibilidade interna (overlay, botão X)
    toggleMobileMenu, // Prop para AÇÃO de fechar (usada no overlay e botão X)
    isCollapsed,
    toggleCollapse,
    expandedWidth,
    collapsedWidth,
    isDesktopView // Prop para diferenciar layout/comportamento
}) {
    // Função local para reportar erro (opcional, mas boa prática)
    const reportError = (error) => console.error("Navigation Component Error:", error?.message || error);

    try {
        const menuItems = [
            { name: 'Dashboard', icon: 'fa-gauge', path: '/' },
            { name: 'Logística', icon: 'fa-truck-fast', path: '/logistica' }
            // Adicione outros itens de menu aqui se necessário
        ];

        // Largura atual baseada no estado colapsado (relevante principalmente para desktop)
        const currentWidth = isCollapsed ? collapsedWidth : expandedWidth;

        // Classes CSS dinâmicas para posicionamento e transição da sidebar
        const navClasses = `
            ${isDesktopView ? 'fixed' : 'fixed'} {/* Mantém fixed, visibilidade controlada por translate */}
            top-0 left-0 h-full bg-slate-50 shadow-2xl z-40 transition-transform duration-300 ease-in-out border-r border-slate-200 flex flex-col
            ${isDesktopView ? 'translate-x-0' : (mobileMenuOpen ? 'translate-x-0' : '-translate-x-full')} {/* Lógica de translate para mobile */}
        `;

        return (
            <React.Fragment>
                {/* Overlay para fechar menu mobile (renderizado apenas em mobile quando menu está aberto) */}
                {!isDesktopView && mobileMenuOpen && (
                    <div
                        className="fixed inset-0 bg-black bg-opacity-50 z-30" // lg:hidden não é mais necessário aqui
                        onClick={toggleMobileMenu} // Chama a função passada por App.js para fechar
                        data-name="mobile-menu-overlay"
                    ></div>
                )}

                {/* O botão Hambúrguer (fa-bars) NÃO está mais aqui, está em App.js */}

                <nav
                    className={navClasses}
                    // Largura: Usa a calculada em desktop, usa a expandida fixa em mobile
                    style={{ width: `${isDesktopView ? currentWidth : expandedWidth}px` }}
                    data-name="navigation-sidebar"
                    // Aria-hidden para acessibilidade
                    aria-hidden={!isDesktopView && !mobileMenuOpen}
                >
                    {/* Header da Navegação */}
                    <div
                        className="h-16 flex items-center border-b border-slate-200 transition-all duration-300 ease-in-out flex-shrink-0"
                        // Estilo do header muda se desktop e colapsado
                        style={{
                            paddingLeft: (isDesktopView && isCollapsed) ? '0px' : '1rem',
                            justifyContent: (isDesktopView && isCollapsed) ? 'center' : 'space-between'
                        }}
                    >
                        {/* Título visível se desktop e expandido OU se mobile (independente de open/closed) */}
                        <h1 className={`text-xl font-semibold text-slate-800 whitespace-nowrap overflow-hidden transition-opacity duration-200 ease-in-out ${isDesktopView && isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
                            Sistema
                        </h1>
                        {/* Botão 'X' para fechar (renderizado apenas em mobile quando menu está aberto) */}
                         {!isDesktopView && mobileMenuOpen && (
                             <button
                                className="text-slate-600 hover:text-slate-900 px-4"
                                onClick={toggleMobileMenu} // Chama a função passada por App.js para fechar
                                data-name="mobile-menu-close-button"
                                aria-label="Fechar menu"
                             >
                                <i className="fas fa-times text-xl"></i>
                             </button>
                          )}
                    </div>

                    {/* Lista de Itens de Menu */}
                    <ul className="flex-grow py-4 overflow-y-auto overflow-x-hidden">
                        {menuItems.map((item) => {
                            // Determina se visualmente deve parecer colapsado (apenas desktop e colapsado)
                            const displayCollapsed = isDesktopView && isCollapsed;
                            return (
                                <li key={item.path} className="mb-1 relative px-2">
                                    <button
                                        onClick={() => {
                                            // Chama a navegação passada por App.js
                                            if (onNavigate) { onNavigate(item.path); }
                                            // O handleNavigate em App.js já fecha o menu mobile
                                        }}
                                        className={`w-full text-left py-3 rounded-md flex items-center transition-colors duration-150 relative group whitespace-nowrap ${activePage === item.path ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'}`}
                                        // Estilo condicional para padding/justify (sempre 1rem padding, muda justify)
                                        style={{ paddingLeft: '1rem', justifyContent: displayCollapsed ? 'center' : 'flex-start' }}
                                        data-name={`nav-item-${item.name.toLowerCase()}`}
                                        title={displayCollapsed ? item.name : ''} // Title só quando colapsado
                                        aria-current={activePage === item.path ? 'page' : undefined}
                                    >
                                        {/* Indicador de página ativa (somente desktop e expandido) */}
                                        {activePage === item.path && isDesktopView && !isCollapsed && (
                                            <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r-md"></span>
                                        )}
                                        {/* Ícone */}
                                        <i className={`fas ${item.icon} w-5 text-center text-lg transition-all duration-300 ease-in-out ${displayCollapsed ? 'mr-0' : 'mr-3'} ${activePage === item.path ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} aria-hidden="true"></i>
                                        {/* Texto do Item (oculto se colapsado) */}
                                        <span className={`transition-opacity duration-200 ease-in-out ${displayCollapsed ? 'opacity-0 max-w-0 overflow-hidden' : 'opacity-100 max-w-full'}`}>
                                            {item.name}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    {/* Botão de Colapsar/Expandir (renderizado apenas em desktop) */}
                    {isDesktopView && (
                        <div className="border-t border-slate-200 p-2 flex justify-end flex-shrink-0">
                            <button
                                onClick={toggleCollapse} // Chama a função passada por App.js
                                className="p-2 rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors duration-150"
                                title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
                                aria-label={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
                                aria-expanded={!isCollapsed} // Estado de acessibilidade
                            >
                                <i className={`fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'} text-sm`} aria-hidden="true"></i>
                            </button>
                        </div>
                    )}
                </nav>
            </React.Fragment>
        );
     } catch (error) {
         // Se um erro ocorrer aqui DENTRO, loga e mostra mensagem de erro
         console.error('Navigation component error:', error);
         // Tenta chamar reportError se existir, caso contrário usa console.error diretamente
         if (typeof reportError === 'function') {
             reportError(error);
         }
         return <nav>Erro na navegação.</nav>; // Fallback UI
     }
}

export default Navigation;