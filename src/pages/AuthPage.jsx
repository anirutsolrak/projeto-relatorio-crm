import React, { useState } from 'react';
import LoginForm from '../components/auth/LoginForm';
import SignupForm from '../components/auth/SignupForm';
import GuestLogin from '../components/auth/GuestLogin';

function AuthPage({ onAuthSuccessOrGuest }) {
    const reportError = (error) => console.error("AuthPage Error:", error);

    try {
        const [authMode, setAuthMode] = useState('login'); // 'login', 'signup', 'guest'

        const renderAuthComponent = () => {
            switch (authMode) {
                case 'login':
                    return (
                        <LoginForm
                            onSwitchToSignup={() => setAuthMode('signup')}
                            onSwitchToGuest={() => setAuthMode('guest')}
                            // onLoginSuccess is handled by the global auth listener in App
                        />
                    );
                case 'signup':
                    return (
                        <SignupForm
                            onSwitchToLogin={() => setAuthMode('login')}
                        />
                    );
                case 'guest':
                    return (
                        <GuestLogin
                            onGuestLogin={(guestUser, showLogin) => {
                                if (showLogin) {
                                    setAuthMode('login');
                                } else if (guestUser) {
                                     // Pass guest user up to App
                                    onAuthSuccessOrGuest(guestUser);
                                }
                            }}
                        />
                    );
                default:
                     console.error("Invalid authMode:", authMode);
                     // Fallback to login if state is invalid
                     setAuthMode('login');
                    return null;
            }
        };

        return (
            <div className="auth-container flex items-center justify-center min-h-screen bg-gray-100" data-name="auth-page">
                {renderAuthComponent()}
            </div>
        );
    } catch (error) {
        console.error('AuthPage component error:', error);
        reportError(error);
        return <div className="auth-container error">Erro ao carregar página de autenticação.</div>;
    }
}

export default AuthPage;