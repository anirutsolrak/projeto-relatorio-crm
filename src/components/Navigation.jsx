import React from 'react';

function Navigation({
    activePage,
    onNavigate,
    mobileMenuOpen,
    toggleMobileMenu,
    isCollapsed,
    toggleCollapse,
    expandedWidth,
    collapsedWidth,
    isDesktopView
}) {
    const reportError = (error) => console.error("Navigation Component Error:", error?.message || error);

    try {
        const menuItems = [
            { name: 'Digitação', icon: 'fa-gauge', path: '/' },
            { name: 'Logística', icon: 'fa-truck-fast', path: '/logistica' },
            { name: 'Estoque', icon: 'fa-boxes-stacked', path: '/estoque' } // Novo Item
        ];

        const currentWidth = isCollapsed ? collapsedWidth : expandedWidth;

        const navClasses = `
            ${isDesktopView ? 'fixed' : 'fixed'}
            top-0 left-0 h-full bg-slate-50 shadow-2xl z-40 transition-transform duration-300 ease-in-out border-r border-slate-200 flex flex-col
            ${isDesktopView ? 'translate-x-0' : (mobileMenuOpen ? 'translate-x-0' : '-translate-x-full')}
        `;

        return (
            <React.Fragment>
                {!isDesktopView && mobileMenuOpen && (
                    <div
                        className="fixed inset-0 bg-black bg-opacity-50 z-30"
                        onClick={toggleMobileMenu}
                        data-name="mobile-menu-overlay"
                    ></div>
                )}

                <nav
                    className={navClasses}
                    style={{ width: `${isDesktopView ? currentWidth : expandedWidth}px` }}
                    data-name="navigation-sidebar"
                    aria-hidden={!isDesktopView && !mobileMenuOpen}
                >
                    <div
                        className="h-16 flex items-center border-b border-slate-200 transition-all duration-300 ease-in-out flex-shrink-0"
                        style={{
                            paddingLeft: (isDesktopView && isCollapsed) ? '0px' : '1rem',
                            justifyContent: (isDesktopView && isCollapsed) ? 'center' : 'space-between'
                        }}
                    >
                        <h1 className={`text-xl font-semibold text-slate-800 whitespace-nowrap overflow-hidden transition-opacity duration-200 ease-in-out ${isDesktopView && isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
                            Sistema
                        </h1>
                         {!isDesktopView && mobileMenuOpen && (
                             <button
                                className="text-slate-600 hover:text-slate-900 px-4"
                                onClick={toggleMobileMenu}
                                data-name="mobile-menu-close-button"
                                aria-label="Fechar menu"
                             >
                                <i className="fas fa-times text-xl"></i>
                             </button>
                          )}
                    </div>

                    <ul className="flex-grow py-4 overflow-y-auto overflow-x-hidden">
                        {menuItems.map((item) => {
                            const displayCollapsed = isDesktopView && isCollapsed;
                            return (
                                <li key={item.path} className="mb-1 relative px-2">
                                    <button
                                        onClick={() => {
                                            if (onNavigate) { onNavigate(item.path); }
                                        }}
                                        className={`w-full text-left py-3 rounded-md flex items-center transition-colors duration-150 relative group whitespace-nowrap ${activePage === item.path ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'}`}
                                        style={{ paddingLeft: '1rem', justifyContent: displayCollapsed ? 'center' : 'flex-start' }}
                                        data-name={`nav-item-${item.name.toLowerCase()}`}
                                        title={displayCollapsed ? item.name : ''}
                                        aria-current={activePage === item.path ? 'page' : undefined}
                                    >
                                        {activePage === item.path && isDesktopView && !isCollapsed && (
                                            <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r-md"></span>
                                        )}
                                        <i className={`fas ${item.icon} w-5 text-center text-lg transition-all duration-300 ease-in-out ${displayCollapsed ? 'mr-0' : 'mr-3'} ${activePage === item.path ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} aria-hidden="true"></i>
                                        <span className={`transition-opacity duration-200 ease-in-out ${displayCollapsed ? 'opacity-0 max-w-0 overflow-hidden' : 'opacity-100 max-w-full'}`}>
                                            {item.name}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    {isDesktopView && (
                        <div className="border-t border-slate-200 p-2 flex justify-end flex-shrink-0">
                            <button
                                onClick={toggleCollapse}
                                className="p-2 rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors duration-150"
                                title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
                                aria-label={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
                                aria-expanded={!isCollapsed}
                            >
                                <i className={`fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'} text-sm`} aria-hidden="true"></i>
                            </button>
                        </div>
                    )}
                </nav>
            </React.Fragment>
        );
     } catch (error) {
         if (typeof reportError === 'function') {
             reportError(error);
         }
         return <nav>Erro na navegação.</nav>;
     }
}

export default Navigation;