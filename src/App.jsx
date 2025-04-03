import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import getSupabaseClient from './utils/supabaseClient';
import AuthPage from './pages/AuthPage';
import Navigation from './components/Navigation';
import DashboardPage from './pages/DashboardPage';
import LoadingOverlay from './components/LoadingOverlay';



function App() {
  const reportError = (error, context = 'App') => console.error(`[${context} Error]:`, error);

  const EXPANDED_SIDEBAR_WIDTH = 250;
  const COLLAPSED_SIDEBAR_WIDTH = 80;

  try {
    const [session, setSession] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState('/');

    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
      try {
        const storedState = localStorage.getItem('sidebarCollapsed');
        return storedState ?ON.parse(storedState) : false;
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
          setUser(null);
          setSession(null);
        } else if (currentSession) {
          setSession(currentSession);
          setUser({ ...currentSession.user, role: currentSession.user.role || 'authenticated' });
        } else {
          setUser(null);
          setSession(null);
        }
        setLoading(false);
      }).catch(err => {
        if (!isMounted) return;
        reportError(err, 'getSessionCatch');
        setUser(null);
        setSession(null);
        setLoading(false);
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
          }

          if (['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION', 'USER_UPDATED'].includes(_event)) {
            setLoading(false);
          }
        }
      );

      return () => {
        isMounted = false;
        if (subscription) {
          subscription.unsubscribe();
        }
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
      setUser(null);
      setSession(null);
      setCurrentPage('/');
      setLoading(false);
    };

    const handleAuthSuccessOrGuest = (authUserOrGuest) => {

      if (authUserOrGuest && authUserOrGuest.role === 'guest') {
        console.log("Guest login handled in App:", authUserOrGuest);
        setUser(authUserOrGuest);
        setSession(null);
        setLoading(false);
        setCurrentPage('/');
      }

    };


    const toggleMobileMenu = () => {
      setMobileMenuOpen(!mobileMenuOpen);
    };

    const toggleSidebarCollapse = () => {
      setIsSidebarCollapsed(prevState => {
        const newState = !prevState;
        try {
          localStorage.setItem('sidebarCollapsed',ON.stringify(newState));
        } catch (e) {
          reportError(e, "localStorageWrite");
          console.error("Failed to save sidebar state to localStorage", e);
        }
        return newState;
      });
    };

    const handleNavigate = (path) => {
      setCurrentPage(path);
      setMobileMenuOpen(false);
    };


    const renderPage = () => {




      if (!user) {

        return <AuthPage onAuthSuccessOrGuest={handleAuthSuccessOrGuest} />;
      }


      const sidebarMarginPx = isSidebarCollapsed ? `${COLLAPSED_SIDEBAR_WIDTH}px` : `${EXPANDED_SIDEBAR_WIDTH}px`;

      let PageComponent;
      switch (currentPage) {
        case '/':
        default:

          PageComponent = <DashboardPage user={user} onLogout={handleLogout} />;
          break;






      }

      return (
        <React.Fragment>
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
          {/* Main content area needs dynamic margin based on sidebar state */}
          <main
            className="transition-all duration-300 ease-in-out absolute top-0 right-0 bottom-0 overflow-y-auto"
            style={{
              left: '0',
              '@media (min-width: 1024px)': {
                marginLeft: sidebarMarginPx
              },
              left: sidebarMarginPx /* Apply margin via style */
            }}
          >
            <div className="h-full p-4 md:p-6"> {/* Add padding inside main */}
              {PageComponent}
            </div>
          </main>
        </React.Fragment>
      );
    };


    return (
      <div className="relative min-h-screen bg-gray-100">
        {loading && <LoadingOverlay isLoading={true} message="Carregando aplicação..." />}
        {!loading && renderPage()}
      </div>
    );

  } catch (error) {
    reportError(error, 'AppCatch');
    return <div className="p-4 bg-red-100 text-red-700">Ocorreu um erro crítico na aplicação. Tente recarregar a página.</div>;
  }
}

export default App;