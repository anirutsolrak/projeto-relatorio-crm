App.js
import React, { useState, useEffect, Suspense, lazy, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import getSupabaseClient from './utils/supabaseClient';
import AuthPage from './pages/AuthPage';
import Navigation from './components/Navigation';
import DashboardPage from './pages/DashboardPage';
import LoadingOverlay from './components/LoadingOverlay';
import Logistica from './pages/Logistica';
import Estoque from './pages/Estoque';
import { FilterProvider } from './contexto/FilterContext';
import { reportError } from './utils/helpers';


const DESKTOP_BREAKPOINT = 1024;




class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error: error }; }
  componentDidCatch(error, errorInfo) { console.error("Uncaught error in boundary:", error, errorInfo); reportError(error, { componentStack: errorInfo.componentStack }); }
  render() { if (this.state.hasError) { return ( <div className="p-4 text-center text-red-600 bg-red-100 border border-red-300 rounded-md m-4"> <h1 className="text-lg font-semibold">Algo deu errado.</h1> <p>Por favor, tente atualizar a página ou contate o suporte.</p> {import.meta.env.DEV && this.state.error && ( <pre className="mt-2 text-xs text-left whitespace-pre-wrap"> {this.state.error.toString()} </pre> )} </div> ); } return this.props.children; }
}


function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(() => {
       const hash = window.location.hash.replace('#/', '');
       const validPages = ['logistica', 'estoque', 'dashboard', 'auth'];
       const initialPage = validPages.includes(hash) ? hash : 'dashboard';
       console.log(`[Initial State] Hash: '${window.location.hash}', Initial Page: '/${initialPage}'`);
       return `/${initialPage}`;
   });

  const [isDesktopView, setIsDesktopView] = useState(window.innerWidth >= DESKTOP_BREAKPOINT);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
      try { const storedState = localStorage.getItem('sidebarCollapsed'); return storedState ? JSON.parse(storedState) : false; }
      catch (e) { reportError(e, 'localStorageRead'); return false; }
    });


   useEffect(() => {
       const handleResize = () => {
           const desktop = window.innerWidth >= DESKTOP_BREAKPOINT;
           setIsDesktopView(desktop);
           if (desktop && mobileMenuOpen) { setMobileMenuOpen(false); }
       };
       window.addEventListener('resize', handleResize);
       handleResize();
       return () => window.removeEventListener('resize', handleResize);
   }, [mobileMenuOpen]);


   useEffect(() => {
       console.log("[Auth Effect] Running effect.");
       setLoading(true);
       const supabase = getSupabaseClient();
       let isMounted = true;

       supabase.auth.getSession().then(({ data: { session: currentSession }, error: sessionError }) => {
           if (!isMounted) return;
           console.log("[Auth Effect] getSession result:", { hasSession: !!currentSession, sessionError });
           if (sessionError) { reportError(sessionError, 'getSession'); setUser(null); setSession(null); }
           else if (currentSession) { setSession(currentSession); setUser({ ...currentSession.user, role: currentSession.user.role || 'authenticated' }); }
           else { setUser(null); setSession(null); }
           setLoading(false);
       }).catch(err => {
           if (!isMounted) return; reportError(err, 'getSessionCatch');
           setUser(null); setSession(null); setLoading(false);
       });

       const { data: { subscription } } = supabase.auth.onAuthStateChange(
           (_event, newSession) => {
               if (!isMounted) return;
                console.log(`[Auth Effect] onAuthStateChange event: ${_event}`, { hasNewSession: !!newSession });
                const newUser = newSession ? { ...newSession.user, role: newSession.user.role || 'authenticated' } : null;
                setUser(newUser);
                setSession(newSession);

                const currentHashPath = window.location.hash.replace('#/', '');
                const currentPath = `/${currentHashPath || 'dashboard'}`;

                if (!newUser && currentPath !== '/auth') {
                    console.log(`[Auth Change] No user, current path is '${currentPath}', redirecting to #/auth`);
                    window.location.hash = '#/auth';
                } else if (newUser && currentPath === '/auth') {
                     console.log(`[Auth Change] User logged in, current path is '/auth', redirecting to #/dashboard`);
                     window.location.hash = '#/dashboard';
                 }
           }
       );

       return () => {
            console.log("[Auth Effect] Cleaning up effect.");
            isMounted = false;
            if (subscription) { subscription.unsubscribe(); }
       };
   }, []);


   useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash.replace('#/', '');
            const validPages = ['logistica', 'estoque', 'dashboard', 'auth'];
            const cleanHash = validPages.includes(hash) ? hash : 'dashboard';
            const newPath = `/${cleanHash}`;
            console.log(`[Hash Change] Hash: '${window.location.hash}', New Path: '${newPath}'`);
            // Update state only if the derived path is different from the current state
             setCurrentPage(prevPage => {
                 if (newPath !== prevPage) {
                     console.log(`[Hash Change] State updated from ${prevPage} to ${newPath}`);
                     return newPath;
                 }
                 console.log(`[Hash Change] State already ${prevPage}, no update.`);
                 return prevPage; // Important: return previous state if no change needed
             });
        };
        console.log("[Hash Effect] Adding hashchange listener.");
        window.addEventListener('hashchange', handleHashChange);

        handleHashChange();
        return () => {
            console.log("[Hash Effect] Removing hashchange listener.");
            window.removeEventListener('hashchange', handleHashChange);
        }
    }, []);


  const handleLogout = async () => { setLoading(true); const supabase = getSupabaseClient(); await supabase.auth.signOut(); window.location.hash = '#/auth'; setLoading(false); };
  const handleAuthSuccessOrGuest = (authUserOrGuest) => { if (authUserOrGuest) { window.location.hash = '#/dashboard'; } else { window.location.hash = '#/auth'; } setLoading(false); };
  const toggleMobileMenu = () => setMobileMenuOpen(prev => !prev);
  const toggleSidebarCollapse = () => { setIsSidebarCollapsed(prevState => { const newState = !prevState; try { localStorage.setItem('sidebarCollapsed', JSON.stringify(newState)); } catch (e) { reportError(e, "localStorageWrite"); } return newState; }); };

  const handleNavigate = (path) => {
      console.log(`[handleNavigate] Request to navigate to: ${path}`);
      const targetHash = `#${path.startsWith('/') ? path : '/' + path}`;
      if (window.location.hash !== targetHash) {
           console.log(`[handleNavigate] Setting hash to: ${targetHash}`);
           window.location.hash = targetHash;
      } else {
          console.log(`[handleNavigate] Hash already set to ${targetHash}. No change.`);
      }
      if (!isDesktopView) {
          setMobileMenuOpen(false);
      }
  };


  if (loading) { return <LoadingOverlay isLoading={true} message="Carregando aplicação..." />; }

  if (!user && !window.location.hash.includes('/auth')) {
       console.log("[Render Check] No user and not on auth page, redirecting to #/auth");
       window.location.hash = '#/auth';
       return <LoadingOverlay isLoading={true} message="Redirecionando..." />; // Show loading while redirecting
   }

  let mainStyle = {}; const sidebarWidthPx = isSidebarCollapsed ? 80 : 250;
  if (isDesktopView && user) { mainStyle = { marginLeft: `${sidebarWidthPx}px`, width: `calc(100% - ${sidebarWidthPx}px)` }; }
  else if (user) { mainStyle = { marginLeft: '0px', width: '100%' }; }


  const renderPage = () => {
    console.log(`[renderPage] Rendering page for state: ${currentPage}`);
    const commonProps = { user: user };
    switch (currentPage) {
      case '/logistica': return <Logistica {...commonProps} />;
      case '/estoque': return <Estoque {...commonProps} />;
      case '/dashboard': return <DashboardPage user={user} onLogout={handleLogout} />;
      case '/auth': return <AuthPage onAuthSuccessOrGuest={handleAuthSuccessOrGuest} />;
      default:
         console.warn(`[renderPage] Unknown currentPage: ${currentPage}, redirecting to dashboard.`);
         if (window.location.hash !== '#/dashboard') { // Prevent loop if already dashboard
             window.location.hash = '#/dashboard';
         }
         return <LoadingOverlay isLoading={true} message="Redirecionando..." />; // Show loading during redirect
    }
  };

  return (
    <ErrorBoundary>
      <FilterProvider>
        <div className="relative min-h-screen bg-gray-100">
          {user && (
             <React.Fragment>
                {!isDesktopView && !mobileMenuOpen && (
                    <button className="fixed top-4 left-4 z-50 p-2 rounded-md text-gray-700 bg-white shadow-md" onClick={toggleMobileMenu} data-name="mobile-menu-button" aria-label="Abrir menu" aria-expanded={mobileMenuOpen} >
                        <i className="fas fa-bars text-xl"></i>
                    </button>
                )}
                 <Navigation activePage={currentPage} onNavigate={handleNavigate} mobileMenuOpen={mobileMenuOpen} toggleMobileMenu={toggleMobileMenu} isCollapsed={isSidebarCollapsed} toggleCollapse={toggleSidebarCollapse} expandedWidth={250} collapsedWidth={80} isDesktopView={isDesktopView} />
             </React.Fragment>
          )}
          <main className={`overflow-y-auto transition-all duration-300 ease-in-out ${user ? 'absolute top-0 right-0 bottom-0' : ''}`} style={mainStyle}>
            <div className={`p-4 md:p-6 ${user ? 'h-full' : ''}`}>
              <Suspense fallback={<LoadingOverlay isLoading={true} />}>
                {renderPage()}
              </Suspense>
            </div>
          </main>
          <div id="popover-root"></div>
        </div>
      </FilterProvider>
    </ErrorBoundary>
  );
}

export default App;