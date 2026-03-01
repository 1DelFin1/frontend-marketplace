import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import ProductList from './components/Products/ProductList';
import ProductDetails from './components/Products/ProductDetails';
import Profile from './components/Profile/Profile';
import CartFunc from './components/Cart/cartFunc';
import Orders from './components/Orders/Orders';
import { apiService } from './services/api';
import { isTokenValid, getUserFromToken } from './utils/auth';

const AccountIcon = () => (
  <svg viewBox="0 0 24 24" className="action-icon" aria-hidden="true">
    <circle cx="12" cy="8" r="3.25" />
    <path d="M5 19c0-3.25 3.15-5.5 7-5.5s7 2.25 7 5.5" />
  </svg>
);

const OrdersIcon = () => (
  <svg viewBox="0 0 24 24" className="action-icon" aria-hidden="true">
    <rect x="6" y="4" width="12" height="16" rx="2" />
    <path d="M9 9h6M9 13h6M9 17h4" />
  </svg>
);

const FavoritesIcon = () => (
  <svg viewBox="0 0 24 24" className="action-icon" aria-hidden="true">
    <path d="M12 20.5s-7-4.8-7-10a4.2 4.2 0 0 1 7-2.95A4.2 4.2 0 0 1 19 10.5c0 5.2-7 10-7 10Z" />
  </svg>
);

const CartIcon = () => (
  <svg viewBox="0 0 24 24" className="action-icon" aria-hidden="true">
    <circle cx="10" cy="19" r="1.5" />
    <circle cx="17" cy="19" r="1.5" />
    <path d="M3 5h2l2.4 9h10.5L20 8H7.1" />
  </svg>
);

const PlaceholderPage: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <section className="section-placeholder">
    <h2>{title}</h2>
    <p>{description}</p>
  </section>
);

const ACTIVE_ORDER_STATUSES = new Set([
  'pending',
  'reserved',
  'paid',
  'preparing',
  'shipping',
  'delivered',
]);

const getCartItemsCount = (): number => {
  try {
    const savedCart = localStorage.getItem('cart');
    if (!savedCart) {
      return 0;
    }

    const parsed = JSON.parse(savedCart) as { items?: Array<{ quantity?: number }> };
    if (!Array.isArray(parsed.items)) {
      return 0;
    }

    return parsed.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  } catch {
    return 0;
  }
};

const formatBadgeCount = (count: number): string => (count > 99 ? '99+' : String(count));

interface AppContentProps {
  isAuthenticated: boolean;
  handleLoginSuccess: () => void;
}

function AppContent({ isAuthenticated, handleLoginSuccess }: AppContentProps) {
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);
  const [cartItemsCount, setCartItemsCount] = useState(0);

  const refreshCartItemsCount = useCallback(() => {
    setCartItemsCount(getCartItemsCount());
  }, []);

  const refreshActiveOrdersCount = useCallback(async () => {
    try {
      const tokenUser = getUserFromToken();
      const userId = tokenUser?.id;

      if (!userId) {
        setActiveOrdersCount(0);
        return;
      }

      const userOrders = await apiService.getOrdersByUserId(userId);
      const activeCount = userOrders.filter((order) => {
        return ACTIVE_ORDER_STATUSES.has(String(order.status || '').toLowerCase());
      }).length;

      setActiveOrdersCount(activeCount);
    } catch {
      setActiveOrdersCount(0);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setCartItemsCount(0);
      setActiveOrdersCount(0);
      return;
    }

    refreshCartItemsCount();
    void refreshActiveOrdersCount();
  }, [isAuthenticated, location.pathname, refreshCartItemsCount, refreshActiveOrdersCount]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'cart') {
        refreshCartItemsCount();
      }
    };
    const handleCartUpdated = () => {
      refreshCartItemsCount();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('cart-updated', handleCartUpdated as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('cart-updated', handleCartUpdated as EventListener);
    };
  }, [isAuthenticated, refreshCartItemsCount]);

  return (
    <div className="App">
      <div className="layout-shell">
        {!isAuthPage && (
          <header className="app-header">
            <nav className="main-nav">
              <Link to="/products" className="nav-brand">маркетплейс</Link>
              <div className="header-search" role="search" aria-label="Поиск по товарам">
                <input
                  type="text"
                  className="header-search-input"
                  placeholder="Искать товары"
                  aria-label="Строка поиска"
                />
                <button type="button" className="header-search-button" aria-label="Найти">
                  <svg viewBox="0 0 24 24" className="search-icon" aria-hidden="true">
                    <circle cx="11" cy="11" r="6" />
                    <path d="m16 16 5 5" />
                  </svg>
                </button>
              </div>
              <div className="header-actions">
                {isAuthenticated && (
                  <>
                    <Link to="/profile" className="header-action">
                      <span className="header-action-icon-wrap">
                        <AccountIcon />
                      </span>
                      <span>Аккаунт</span>
                    </Link>
                    <Link to="/orders" className="header-action">
                      <span className="header-action-icon-wrap">
                        <OrdersIcon />
                        {activeOrdersCount > 0 && (
                          <span className="header-action-badge">
                            {formatBadgeCount(activeOrdersCount)}
                          </span>
                        )}
                      </span>
                      <span>Заказы</span>
                    </Link>
                    <Link to="/favorites" className="header-action">
                      <span className="header-action-icon-wrap">
                        <FavoritesIcon />
                      </span>
                      <span>Избранное</span>
                    </Link>
                    <Link to="/cart" className="header-action">
                      <span className="header-action-icon-wrap">
                        <CartIcon />
                        {cartItemsCount > 0 && (
                          <span className="header-action-badge">
                            {formatBadgeCount(cartItemsCount)}
                          </span>
                        )}
                      </span>
                      <span>Корзина</span>
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </header>
        )}

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
              path="/products/:productId"
              element={
                isAuthenticated ?
                <ProductDetails /> :
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
              path="/orders"
              element={
                isAuthenticated ?
                <Orders /> :
                <Navigate to="/login" replace />
              }
            />
            <Route
              path="/favorites"
              element={
                isAuthenticated ?
                <PlaceholderPage
                  title="Избранное"
                  description="Выбранные товары будут отображаться здесь."
                /> :
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
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(isTokenValid());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    if (isTokenValid()) {
      const userData = getUserFromToken();
      if (userData) {
        setIsAuthenticated(true);
      }
    }
    setLoading(false);
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    checkAuth();
  };

  if (loading) {
    return <div>Загрузка...</div>;
  }

  return (
    <Router>
      <AppContent
        isAuthenticated={isAuthenticated}
        handleLoginSuccess={handleLoginSuccess}
      />
    </Router>
  );
}

export default App;
