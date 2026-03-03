import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiService } from '../../services/api';
import { Seller, SellerUpdate } from '../../types/user';
import { clearAuth } from '../../utils/auth';

interface SellerProfileProps {
  onLogout: () => void;
}

const toDateInputValue = (value?: string): string => {
  if (!value) {
    return '';
  }

  const directMatch = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) {
    return directMatch[1];
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
};

const SellerProfile: React.FC<SellerProfileProps> = ({ onLogout }) => {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [formData, setFormData] = useState<SellerUpdate>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const loadSeller = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const data = await apiService.getCurrentSeller();
        setSeller(data);
        setFormData({
          name: data.name,
          email: data.email,
          birthday: toDateInputValue(data.birthday),
        });
      } catch {
        setLoadError('Не удалось загрузить кабинет продавца');
        toast.error('Не удалось загрузить кабинет продавца');
      } finally {
        setLoading(false);
      }
    };

    void loadSeller();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seller) {
      return;
    }

    setSaving(true);
    try {
      await apiService.updateSeller(seller.id, formData);
      const freshData = await apiService.getCurrentSeller();
      setSeller(freshData);
      setFormData({
        name: freshData.name,
        email: freshData.email,
        birthday: toDateInputValue(freshData.birthday),
      });
      toast.success('Данные продавца обновлены');
    } catch {
      toast.error('Ошибка при сохранении профиля продавца');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    try {
      await apiService.logout();
    } catch {
      // Игнорируем сетевую ошибку logout и очищаем локально ниже.
    }

    clearAuth();
    onLogout();
    toast.success('Вы вышли из кабинета продавца');
    navigate('/login', { replace: true });
  };

  if (loading) {
    return <div className="loading">Загрузка кабинета продавца...</div>;
  }

  if (!seller) {
    return (
      <section className="seller-page seller-profile-page">
        <article className="seller-card">
          <h1>Личный кабинет продавца</h1>
          <p>{loadError || 'Данные продавца недоступны'}</p>
          <Link to="/seller" className="seller-link-button">
            На главную продавца
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="seller-page seller-profile-page">
      <header className="seller-topbar">
        <div className="seller-brand">
          <span className="seller-brand-accent">Marketplace</span>
          <span className="seller-brand-muted">Seller</span>
        </div>
        <div className="seller-profile-top-actions">
          <Link to="/seller" className="seller-link-button">
            На главную продавца
          </Link>
          <button
            type="button"
            className="seller-danger-button"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Выходим...' : 'Выйти'}
          </button>
        </div>
      </header>

      <div className="seller-profile-grid">
        <article className="seller-card seller-profile-summary">
          <h1>Личный кабинет продавца</h1>
          <p>{seller.name}</p>
          <small>{seller.email}</small>

          <div className="seller-profile-stats">
            <div>
              <span>Рейтинг</span>
              <strong>{(seller.rating ?? 0).toFixed(1)}%</strong>
            </div>
            <div>
              <span>Заказов</span>
              <strong>{seller.orders_count ?? 0}</strong>
            </div>
          </div>
        </article>

        <article className="seller-card">
          <h2>Данные продавца</h2>
          <form onSubmit={handleSubmit} className="seller-profile-form">
            <div className="form-group">
              <label htmlFor="seller-name">Имя / магазин</label>
              <input
                id="seller-name"
                name="name"
                type="text"
                value={formData.name || ''}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="seller-email">Email</label>
              <input
                id="seller-email"
                name="email"
                type="email"
                value={formData.email || ''}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="seller-birthday">Дата рождения</label>
              <input
                id="seller-birthday"
                name="birthday"
                type="date"
                value={formData.birthday || ''}
                onChange={handleChange}
              />
            </div>

            <button type="submit" className="auth-button" disabled={saving}>
              {saving ? 'Сохраняем...' : 'Сохранить изменения'}
            </button>
          </form>
        </article>
      </div>
    </section>
  );
};

export default SellerProfile;
