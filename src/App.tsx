import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import ProductList from './components/Products/ProductList';
import Profile from './components/Profile/Profile';
import CartFunc from './components/Cart/cartFunc';
import { isTokenValid, getUserFromToken } from './utils/auth';
import { apiService } from './services/api';
import { User } from './types/user';
import {toast} from "react-toastify";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(isTokenValid());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    if (isTokenValid()) {
      const userData = getUserFromToken();
      if (userData) {
        setCurrentUser({
          id: userData.id,
          email: userData.email,
          name: userData.name,
          birthday: userData.birthday,
          is_active: true,
          is_superuser: false,
        });
        setIsAuthenticated(true);
      }
    }
    setLoading(false);
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    checkAuth();
  };

  const handleLogout = async () => {
    try {
      await apiService.logout();
      toast.info('Вы вышли из системы');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Ошибка при выходе из системы');
    } finally {
      setIsAuthenticated(false);
      setCurrentUser(null);
      localStorage.removeItem('cart'); // Очищаем корзину при выходе
    }
  };

  if (loading) {
    return <div>Загрузка...</div>;
  }

return (
    <Router>
      <div className="App">
        <header className="app-header">
          <nav className="main-nav">
            <div className="nav-brand">
              <h2>Маркетплейс</h2>
            </div>
            <div className="nav-links">
              {isAuthenticated && (
                <>
                  <a href="/products">Товары</a>
                  <a href="/cart">Корзина</a>
                  <a href="/profile">Профиль</a>
                  <button onClick={handleLogout} className="logout-btn">
                    Выйти
                  </button>
                </>
              )}
            </div>
          </nav>
        </header>

        <main className="main-content">
          <Routes>
            <Route
              path="/login"
              element={
                isAuthenticated ?
                <Navigate to="/products" replace /> :
                <Login onLoginSuccess={handleLoginSuccess} />
              }
            />
            <Route
              path="/register"
              element={
                isAuthenticated ?
                <Navigate to="/products" replace /> :
                <Register />
              }
            />
            <Route
              path="/products"
              element={
                isAuthenticated ?
                <ProductList /> :
                <Navigate to="/login" replace />
              }
            />
            <Route
              path="/profile"
              element={
                isAuthenticated ?
                <Profile /> :
                <Navigate to="/login" replace />
              }
            />
            <Route
              path="/cart"
              element={
                isAuthenticated ?
                <CartFunc /> :
                <Navigate to="/login" replace />
              }
            />
            <Route
              path="/"
              element={
                <Navigate to={isAuthenticated ? "/products" : "/login"} replace />
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;