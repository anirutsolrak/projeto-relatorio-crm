import React from 'react';

function Navigation({
    activePage,
    onNavigate,
    mobileMenuOpen,
    toggleMobileMenu,
    isCollapsed,
    toggleCollapse,
    expandedWidth,
    collapsedWidth
}) {
    const reportError = (error) => console.error("Navigation Error:", error);
    try {
        const menuItems = [
            { name: 'Dashboard', icon: 'fa-gauge', path: '/' },
            { name: 'Logística', icon: 'fa-truck-fast', path: '/logistica' }
        ];

        const currentWidth = isCollapsed ? collapsedWidth : expandedWidth;

        return (
            <React.Fragment>
                {mobileMenuOpen && (
                    <div
                        className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
                        onClick={toggleMobileMenu}
                        data-name="mobile-menu-overlay"
                    ></div>
                )}

                <button
                    className="fixed top-4 left-4 z-50 p-2 rounded-md text-gray-700 bg-white shadow-md lg:hidden"
                    onClick={toggleMobileMenu}
                    data-name="mobile-menu-button"
                    aria-label="Abrir menu"
                >
                    <i className="fas fa-bars text-xl"></i>
                </button>

                <nav
                    className={`
                        fixed top-0 left-0 h-full bg-slate-50 shadow-2xl z-40 transition-all duration-300 ease-in-out border-r border-slate-200 flex flex-col
                        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                    `}
                    style={{ width: `${currentWidth}px` }}
                    data-name="navigation-sidebar"
                    aria-hidden={!mobileMenuOpen}
                >
                    <div
                        className="h-16 flex items-center border-b border-slate-200 transition-all duration-300 ease-in-out flex-shrink-0"
                        style={{ paddingLeft: isCollapsed ? '0px' : '1rem', justifyContent: isCollapsed ? 'center' : 'space-between' }}
                    >
                        <h1 className={`text-xl font-semibold text-slate-800 whitespace-nowrap overflow-hidden transition-opacity duration-200 ease-in-out ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
                            Sistema
                        </h1>
                        <button
                            className="lg:hidden text-slate-600 hover:text-slate-900 px-4"
                            onClick={toggleMobileMenu}
                            data-name="mobile-menu-close-button"
                            aria-label="Fechar menu"
                        >
                            <i className="fas fa-times text-xl"></i>
                        </button>
                    </div>

                    <ul className="flex-grow py-4 overflow-y-auto overflow-x-hidden">
                        {menuItems.map((item) => (
                            <li key={item.path} className="mb-1 relative px-2">
                                <button
                                    onClick={() => {
                                        if (activePage !== item.path && onNavigate) {
                                            onNavigate(item.path);
                                        }
                                    }}
                                    className={`w-full text-left py-3 rounded-md flex items-center transition-colors duration-150 relative group whitespace-nowrap ${activePage === item.path ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'}`}
                                    style={{ paddingLeft: isCollapsed ? '1rem' : '1rem', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
                                    data-name={`nav-item-${item.name.toLowerCase()}`}
                                    title={isCollapsed ? item.name : ''}
                                    aria-current={activePage === item.path ? 'page' : undefined}
                                >
                                    {activePage === item.path && !isCollapsed && (
                                        <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r-md"></span>
                                    )}
                                    <i className={`fas ${item.icon} w-5 text-center text-lg transition-all duration-300 ease-in-out ${isCollapsed ? 'mr-0' : 'mr-3'} ${activePage === item.path ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} aria-hidden="true"></i>
                                    <span className={`transition-opacity duration-200 ease-in-out ${isCollapsed ? 'opacity-0 max-w-0 overflow-hidden' : 'opacity-100 max-w-full'}`}>
                                        {item.name}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>

                    <div className="hidden lg:flex border-t border-slate-200 p-2 justify-end flex-shrink-0">
                        <button
                            onClick={toggleCollapse}
                            className="p-2 rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors duration-150"
                            title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
                            aria-label={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
                        >
                            <i className={`fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'} text-sm`} aria-hidden="true"></i>
                        </button>
                    </div>
                </nav>
            </React.Fragment>
        );
     } catch (error) {
         console.error('Navigation component error:', error);
         reportError(error);
         return <nav>Erro na navegação.</nav>;
     }
}

export default Navigation;