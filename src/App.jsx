import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import getSupabaseClient from './utils/supabaseClient';
import AuthPage from './pages/AuthPage';
import Navigation from './components/Navigation';
import DashboardPage from './pages/DashboardPage';
import LoadingOverlay from './components/LoadingOverlay';
import Logistica from './pages/Logistica';

function App() {
  const reportError = (error, context = 'App') => console.error(`[${context} Error]:`, error);

  const EXPANDED_SIDEBAR_WIDTH = 250;
  const COLLAPSED_SIDEBAR_WIDTH = 80;

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('/');

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
  }, []);

  const handleLogout = async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      reportError(error, 'signOut');
      alert('Erro ao fazer logout.');
    }
    setLoading(false);
  };

  const handleAuthSuccessOrGuest = (authUserOrGuest) => {
    if (authUserOrGuest?.role === 'guest') {
      console.log("Guest login handled in App:", authUserOrGuest);
      setUser(authUserOrGuest);
      setSession(null);
      setCurrentPage('/');
      setLoading(false);
    } else if (authUserOrGuest) {
      setCurrentPage('/');
      setLoading(false);
    }
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
    setMobileMenuOpen(false);
  };

  if (loading) {
    return <LoadingOverlay isLoading={true} message="Carregando aplicação..." />;
  }

  if (!user) {
    return <AuthPage onAuthSuccessOrGuest={handleAuthSuccessOrGuest} />;
  }

  let PageComponent;

  try {
    switch (currentPage) {
      case '/logistica':
        PageComponent = <Logistica user={user} onNavigate={handleNavigate} />;
        break;
      case '/':
      default:
        PageComponent = <DashboardPage user={user} onLogout={handleLogout} />;
        break;
    }
  } catch(e) {
    reportError(e, `Page Component Instantiation (${currentPage})`);
    PageComponent = <div className="p-4 bg-red-100 text-red-700">Erro ao carregar a página {currentPage}.</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Navigation
        activePage={currentPage}
        onNavigate={handleNavigate}
        mobileMenuOpen={mobileMenuOpen}
        toggleMobileMenu={toggleMobileMenu}
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={toggleSidebarCollapse}
        expandedWidth={EXPANDED_SIDEBAR_WIDTH}
        collapsedWidth={COLLAPSED_SIDEBAR_WIDTH}
      />
      <main 
        className="flex-1 overflow-y-auto transition-all duration-300 ease-in-out"
        style={{
          marginLeft: isSidebarCollapsed ? `${COLLAPSED_SIDEBAR_WIDTH}px` : `${EXPANDED_SIDEBAR_WIDTH}px`,
          width: `calc(${isSidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : EXPANDED_SIDEBAR_WIDTH}px)`
        }}
      >
        {PageComponent}
      </main>
    </div>
  );
}

export default App;