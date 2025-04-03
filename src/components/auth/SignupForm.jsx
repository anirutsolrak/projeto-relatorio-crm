import React, { useState } from 'react';
import getSupabaseClient from '../../utils/supabaseClient';

function SignupForm({ onSwitchToLogin }) {
    const reportError = (error) => console.error("SignupForm Error:", error);

    try {
        const [email, setEmail] = useState('');
        const [password, setPassword] = useState('');
        const [confirmPassword, setConfirmPassword] = useState('');
        const [message, setMessage] = useState(null);
        const [loading, setLoading] = useState(false);
        const supabase = getSupabaseClient();

        const handleSubmit = async (e) => {
            e.preventDefault();
            setLoading(true);
            setMessage(null);

            if (password !== confirmPassword) {
                setMessage({ type: 'error', text: 'As senhas não coincidem.' });
                setLoading(false);
                return;
            }

            if (password.length < 6) {
                setMessage({ type: 'error', text: 'A senha deve ter pelo menos 6 caracteres.' });
                setLoading(false);
                return;
            }

            try {
                const redirectUrl = window.location.origin;
                const { data, error: signupError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: redirectUrl
                    }
                });

                if (signupError) {
                    throw signupError;
                }

                if (data.user && data.user.identities && data.user.identities.length === 0) {
                    setMessage({
                        type: 'success',
                        text: 'Cadastro quase completo! Verifique seu email para o link de confirmação.'
                    });
                } else if (data.user) {
                    setMessage({
                        type: 'success',
                        text: 'Cadastro realizado com sucesso! Você pode fazer login agora.'
                    });
                } else {
                    setMessage({ type: 'error', text: 'Ocorreu um problema inesperado no cadastro.' });
                }
            } catch (err) {
                console.error("Signup failed:", err);
                if (err.message.includes("User already registered")) {
                    setMessage({ type: 'error', text: 'Este email já está cadastrado. Tente fazer login.' });
                } else if (err.message.includes("valid email")) {
                    setMessage({ type: 'error', text: 'Por favor, insira um endereço de email válido.' });
                } else {
                    setMessage({ type: 'error', text: 'Falha no cadastro. Verifique os dados e tente novamente.' });
                }
                reportError(err);
            } finally {
                setLoading(false);
            }
        };

        return (
            <div className="auth-card" data-name="signup-form">
                <h2 className="auth-title">Cadastro</h2>

                {message && (
                    <div className={`message mb-4 px-4 py-3 rounded relative ${message.type === 'success' ? 'bg-green-100 border border-green-400 text-green-700' : 'bg-red-100 border border-red-400 text-red-700'}`} role="alert" data-name="signup-message">
                        <strong className="font-bold">
                            {message.type === 'success' ? <i className="fas fa-check-circle mr-2"></i> : <i className="fas fa-exclamation-circle mr-2"></i>}
                            {message.type === 'success' ? 'Sucesso!' : 'Erro:'}
                        </strong>
                        <span className="block sm:inline"> {message.text}</span>
                    </div>
                )}

                {!(message?.type === 'success') && (
                    <form onSubmit={handleSubmit}>
                        <div className="input-group">
                            <label className="input-label" htmlFor="signup-email">Email</label>
                            <input
                                type="email"
                                id="signup-email"
                                className="input-field"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                                data-name="email-input"
                            />
                        </div>

                        <div className="input-group">
                            <label className="input-label" htmlFor="signup-password">Senha (mín. 6 caracteres)</label>
                            <input
                                type="password"
                                id="signup-password"
                                className="input-field"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength="6"
                                autoComplete="new-password"
                                data-name="password-input"
                            />
                        </div>

                        <div className="input-group">
                            <label className="input-label" htmlFor="signup-confirm-password">Confirmar Senha</label>
                            <input
                                type="password"
                                id="signup-confirm-password"
                                className="input-field"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength="6"
                                autoComplete="new-password"
                                data-name="confirm-password-input"
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary w-full mt-6"
                            disabled={loading}
                            data-name="signup-button"
                        >
                            {loading ? (
                                <React.Fragment>
                                    <i className="fas fa-spinner fa-spin mr-2"></i>
                                    Cadastrando...
                                </React.Fragment>
                            ) : (
                                'Cadastrar'
                            )}
                        </button>
                    </form>
                )}

                <div className="auth-footer mt-6">
                    <p>
                        Já tem uma conta?{' '}
                        <span className="auth-link" onClick={onSwitchToLogin} data-name="login-link">
                            Faça login
                        </span>
                    </p>
                </div>
            </div>
        );
    } catch (error) {
        console.error('SignupForm component error:', error);
        reportError(error);
        return <div className="auth-card error">Erro ao carregar formulário de cadastro.</div>;
    }
}

export default SignupForm;