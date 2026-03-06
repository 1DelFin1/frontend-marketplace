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

const MOCK_SELLER_AVATAR = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff5e6"/><stop offset="1" stop-color="#ffe7cc"/></linearGradient></defs><rect width="240" height="240" rx="36" fill="url(#g)"/><circle cx="120" cy="92" r="42" fill="#fdba74"/><path d="M56 196c5-33 30-56 64-56s59 23 64 56" fill="#fb923c"/></svg>',
)}`;

const SellerProfile: React.FC<SellerProfileProps> = ({ onLogout }) => {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [sellerOrdersCount, setSellerOrdersCount] = useState<number | null>(null);
  const [formData, setFormData] = useState<SellerUpdate>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadSeller = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const data = await apiService.getCurrentSeller();
        setSeller(data);
        setSellerOrdersCount(typeof data.orders_count === 'number' ? data.orders_count : null);
        const actualOrdersCount = await apiService.getSellerOrdersCount(data.id, data.orders_count ?? null);
        if (typeof actualOrdersCount === 'number') {
          setSellerOrdersCount(actualOrdersCount);
        }
        setFormData({
          name: data.name,
          email: data.email,
          birthday: toDateInputValue(data.birthday),
        });
      } catch {
        setSellerOrdersCount(null);
        setLoadError('Не удалось загрузить кабинет продавца');
        toast.error('Не удалось загрузить кабинет продавца');
      } finally {
        setLoading(false);
      }
    };

    void loadSeller();
  }, []);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const clearSelectedAvatar = () => {
    setSelectedAvatarFile(null);
    setAvatarPreviewUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      return null;
    });
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Можно загружать только изображения');
      return;
    }

    const maxFileSize = 5 * 1024 * 1024;
    if (file.size > maxFileSize) {
      toast.error('Размер фото не должен превышать 5 МБ');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setSelectedAvatarFile(file);
    setAvatarPreviewUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      return previewUrl;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seller) {
      return;
    }

    setSaving(true);
    try {
      await apiService.updateSeller(seller.id, formData);
      if (selectedAvatarFile) {
        await apiService.uploadCurrentSellerPhoto(selectedAvatarFile);
      }

      const freshData = await apiService.getCurrentSeller(true);
      setSeller(freshData);
      setSellerOrdersCount(typeof freshData.orders_count === 'number' ? freshData.orders_count : null);
      const actualOrdersCount = await apiService.getSellerOrdersCount(
        freshData.id,
        freshData.orders_count ?? null,
        true
      );
      if (typeof actualOrdersCount === 'number') {
        setSellerOrdersCount(actualOrdersCount);
      }
      setFormData({
        name: freshData.name,
        email: freshData.email,
        birthday: toDateInputValue(freshData.birthday),
      });
      clearSelectedAvatar();
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

  const formattedSellerOrdersCount = sellerOrdersCount !== null ? sellerOrdersCount.toLocaleString('ru-RU') : '—';
  const sellerAvatarUrl = typeof seller.photo_url === 'string' && seller.photo_url.trim().length > 0
    ? seller.photo_url.trim()
    : null;
  const avatarUrl = avatarPreviewUrl || sellerAvatarUrl || MOCK_SELLER_AVATAR;

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
          <div className="seller-profile-avatar-shell">
            <img src={avatarUrl} alt={`Фото продавца ${seller.name}`} className="seller-profile-avatar-image" />
          </div>
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
              <strong>{formattedSellerOrdersCount}</strong>
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

            <div className="form-group seller-photo-upload-group">
              <label htmlFor="seller-photo">Фото профиля</label>
              <input
                id="seller-photo"
                type="file"
                accept="image/*"
                onChange={handleAvatarFileChange}
              />
              <small className="seller-photo-upload-hint">
                PNG, JPG, WEBP, GIF или BMP. Максимум 5 МБ.
              </small>
              {selectedAvatarFile && (
                <div className="seller-photo-upload-meta">
                  <span>{selectedAvatarFile.name}</span>
                  <button
                    type="button"
                    className="seller-photo-clear-btn"
                    onClick={clearSelectedAvatar}
                  >
                    Убрать
                  </button>
                </div>
              )}
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
