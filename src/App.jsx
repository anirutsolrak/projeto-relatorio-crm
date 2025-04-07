import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import getSupabaseClient from './utils/supabaseClient';
import AuthPage from './pages/AuthPage';
import Navigation from './components/Navigation';
import DashboardPage from './pages/DashboardPage';
import LoadingOverlay from './components/LoadingOverlay';
import Logistica from './pages/Logistica';
import Estoque from './pages/Estoque'; // Importar a nova página

const DESKTOP_BREAKPOINT = 1024;

function App() {
  const reportError = (error, context = 'App') => console.error(`[${context} Error]:`, error);

  const EXPANDED_SIDEBAR_WIDTH = 250;
  const COLLAPSED_SIDEBAR_WIDTH = 80;

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('/');
  const [isDesktopView, setIsDesktopView] = useState(window.innerWidth >= DESKTOP_BREAKPOINT);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
      try {
        const storedState = localStorage.getItem('sidebarCollapsed');
        return storedState ? JSON.parse(storedState) : false;
      } catch (e) {
        reportError(e, 'localStorageRead');
        return false;
      }
    });

  useEffect(() => {
    const handleResize = () => {
      setIsDesktopView(window.innerWidth >= DESKTOP_BREAKPOINT);
       if (window.innerWidth >= DESKTOP_BREAKPOINT && mobileMenuOpen) {
           setMobileMenuOpen(false);
       }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [mobileMenuOpen]);

  useEffect(() => {
      setLoading(true);
      const supabase = getSupabaseClient();
      let isMounted = true;

      supabase.auth.getSession().then(({ data: { session: currentSession }, error: sessionError }) => {
        if (!isMounted) return;
        if (sessionError) {
          reportError(sessionError, 'getSession');
          setUser(null); setSession(null);
        } else if (currentSession) {
          setSession(currentSession);
          setUser({ ...currentSession.user, role: currentSession.user.role || 'authenticated' });
        } else {
          setUser(null); setSession(null);
        }
        setLoading(false);
      }).catch(err => {
        if (!isMounted) return;
        reportError(err, 'getSessionCatch');
        setUser(null); setSession(null); setLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, newSession) => {
          if (!isMounted) return;
          console.log("Auth State Change:", _event, newSession);
          setSession(newSession);
          if (newSession) {
            setUser({ ...newSession.user, role: newSession.user.role || 'authenticated' });
          } else {
            setUser(null);
             if (currentPage !== '/') setCurrentPage('/');
          }
          if (['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION', 'USER_UPDATED', 'TOKEN_REFRESHED'].includes(_event)) {
            setLoading(false);
          }
        }
      );

      return () => {
        isMounted = false;
        if (subscription) { subscription.unsubscribe(); }
      };
    }, [currentPage]); // Adicionado currentPage como dependência

  const handleLogout = async () => {
      setLoading(true);
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        reportError(error, 'signOut');
        alert('Erro ao fazer logout.');
      }
      // O listener onAuthStateChange cuidará de atualizar user/session e loading
  };

  const handleAuthSuccessOrGuest = (authUserOrGuest) => {
      if (authUserOrGuest?.role === 'guest') {
        console.log("Guest login handled in App:", authUserOrGuest);
        setUser(authUserOrGuest);
        setSession(null); // Garante que não há sessão para convidado
        setCurrentPage('/'); // Redireciona para a página inicial após login de convidado
        setLoading(false);
      } else if (authUserOrGuest) {
         // Login normal, o listener onAuthStateChange já atualizou user/session
         setCurrentPage('/'); // Redireciona para a página inicial após login normal
         setLoading(false); // Garante que o loading pare
      }
      // Não precisamos de else, pois o listener cuida do resto
  };

  const toggleMobileMenu = () => setMobileMenuOpen(prev => !prev);

  const toggleSidebarCollapse = () => {
      setIsSidebarCollapsed(prevState => {
        const newState = !prevState;
        try {
          localStorage.setItem('sidebarCollapsed', JSON.stringify(newState));
        } catch (e) {
          reportError(e, "localStorageWrite");
        }
        return newState;
      });
    };

  const handleNavigate = (path) => {
      console.log("Navigating to:", path);
      setCurrentPage(path);
      if (!isDesktopView) { // Fecha o menu mobile ao navegar, apenas se não for desktop
          setMobileMenuOpen(false);
      }
  };

  if (loading) {
    return <LoadingOverlay isLoading={true} message="Carregando aplicação..." />;
  }

  if (!user) {
    return <AuthPage onAuthSuccessOrGuest={handleAuthSuccessOrGuest} />;
  }

  let mainStyle = {};
  const sidebarWidthPx = isSidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : EXPANDED_SIDEBAR_WIDTH;

  if (isDesktopView) {
    mainStyle = {
      marginLeft: `${sidebarWidthPx}px`,
      width: `calc(100% - ${sidebarWidthPx}px)`
    };
  } else {
    mainStyle = { marginLeft: '0px', width: '100%' };
  }

  let PageComponent;
  try {
      switch (currentPage) {
        case '/logistica':
          PageComponent = <Logistica user={user} onNavigate={handleNavigate} />;
          break;
        case '/estoque': // Nova Rota
          PageComponent = <Estoque user={user} onNavigate={handleNavigate} />;
          break;
        case '/':
        default:
          PageComponent = <DashboardPage user={user} onLogout={handleLogout} />; // Passa onLogout aqui
          break;
      }
  } catch(e) {
       reportError(e, `Page Component Instantiation (${currentPage})`);
       PageComponent = <div className="p-4 bg-red-100 text-red-700">Erro ao carregar a página {currentPage}.</div>;
  }

  return (
    <div className="relative min-h-screen bg-gray-100">
       {!isDesktopView && !mobileMenuOpen && (
            <button
                className="fixed top-4 left-4 z-50 p-2 rounded-md text-gray-700 bg-white shadow-md"
                onClick={toggleMobileMenu}
                data-name="mobile-menu-button"
                aria-label="Abrir menu"
                aria-expanded={mobileMenuOpen}
            >
                <i className="fas fa-bars text-xl"></i>
            </button>
        )}

      <Navigation
        activePage={currentPage}
        onNavigate={handleNavigate}
        mobileMenuOpen={mobileMenuOpen}
        toggleMobileMenu={toggleMobileMenu}
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={toggleSidebarCollapse}
        expandedWidth={EXPANDED_SIDEBAR_WIDTH}
        collapsedWidth={COLLAPSED_SIDEBAR_WIDTH}
        isDesktopView={isDesktopView}
        // Passa onLogout para o Navigation poder ter um botão de logout se necessário no futuro
        // onLogout={handleLogout}
      />
      <main
        className="overflow-y-auto transition-all duration-300 ease-in-out absolute top-0 right-0 bottom-0"
        style={mainStyle}
      >
         <div className="p-4 md:p-6 h-full">
             {PageComponent}
         </div>
      </main>
       {/* Adiciona um div raiz para o popover se ainda não existir */}
       <div id="popover-root"></div>
    </div>
  );
}

export default App;