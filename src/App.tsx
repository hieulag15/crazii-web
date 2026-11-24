import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import AcademyPage from './pages/AcademyPage';
import KeyLevelPage from './pages/KeyLevelPage';
import './App.css';

export default function App() {
  const { isLoggedIn, loading: authLoading, logout } = useAuth();
  const [page, setPage] = useState<'main' | 'settings' | 'academy'>('main');

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#060d1a', color: '#fbbf24' }}>
        ⏳ Đang tải...
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginPage />;
  }

  if (page === 'settings') {
    return <SettingsPage onBack={() => setPage('main')} />;
  }

  if (page === 'academy') {
    return <AcademyPage onBack={() => setPage('main')} />;
  }

  // Main page = Key Level System
  return <KeyLevelPage onOpenAcademy={() => setPage('academy')} onOpenSettings={() => setPage('settings')} onLogout={logout} />;
}
