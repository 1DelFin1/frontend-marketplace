import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { User, UserUpdate, UserOrder } from '../../types/user';
import { apiService } from '../../services/api';
import { clearAuth, getUserFromToken } from '../../utils/auth';

const ACTIVE_ORDER_STATUSES = new Set([
  'pending',
  'reserved',
  'paid',
  'preparing',
  'shipping',
  'delivered',
]);

const statusLabels: Record<string, string> = {
  pending: 'Ожидает обработки',
  reserved: 'Ожидает оплаты',
  paid: 'Оплачен',
  preparing: 'Собирается',
  shipping: 'В пути',
  delivered: 'Доставлен',
  unknown: 'Статус не указан',
};

const statusTones: Record<string, string> = {
  pending: 'pending',
  reserved: 'processing',
  paid: 'success',
  preparing: 'processing',
  shipping: 'processing',
  delivered: 'success',
  unknown: 'neutral',
};

const priceFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const MOCK_AVATAR = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dbeafe"/><stop offset="1" stop-color="#bfdbfe"/></linearGradient></defs><rect width="240" height="240" rx="36" fill="url(#g)"/><circle cx="120" cy="92" r="42" fill="#93c5fd"/><path d="M56 196c5-33 30-56 64-56s59 23 64 56" fill="#60a5fa"/></svg>',
)}`;

const formatDate = (value?: string): string => {
  if (!value) {
    return 'Дата не указана';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Дата не указана';
  }

  return date.toLocaleString('ru-RU');
};

const formatPrice = (value: number): string => `${priceFormatter.format(value)} ₽`;

const calculateOrderTotal = (order: UserOrder): number | null => {
  if (typeof order.total_amount === 'number' && Number.isFinite(order.total_amount)) {
    return order.total_amount;
  }

  if (order.order_items.length === 0) {
    return 0;
  }

  const allItemsHavePrice = order.order_items.every((item) => typeof item.price === 'number' && Number.isFinite(item.price));
  if (!allItemsHavePrice) {
    return null;
  }

  return order.order_items.reduce((acc, item) => acc + (item.price || 0) * item.quantity, 0);
};

const getSortedActiveOrders = (orders: UserOrder[]): UserOrder[] => {
  return orders
    .filter((order) => ACTIVE_ORDER_STATUSES.has(String(order.status || '').toLowerCase()))
    .sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'П';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

interface ProfileProps {
  onLogout: () => void;
}

const Profile: React.FC<ProfileProps> = ({ onLogout }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeOrders, setActiveOrders] = useState<UserOrder[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<UserUpdate>({});
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [payingOrderIds, setPayingOrderIds] = useState<Set<string>>(new Set());
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void fetchProfileData();
  }, []);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const fetchProfileData = async () => {
    setLoading(true);
    setOrdersLoading(true);

    try {
      const tokenUser = getUserFromToken();
      if (!tokenUser?.id) {
        toast.error('Ошибка авторизации');
        return;
      }

      const [userData, userOrders] = await Promise.all([
        apiService.getUserById(tokenUser.id),
        apiService.getOrdersByUserId(tokenUser.id, true),
      ]);

      setUser(userData);
      setFormData({
        name: userData.name,
        email: userData.email,
        birthday: userData.birthday,
      });

      setActiveOrders(getSortedActiveOrders(userOrders));
    } catch (error) {
      toast.error('Ошибка загрузки данных пользователя');
    } finally {
      setLoading(false);
      setOrdersLoading(false);
    }
  };

  const refreshActiveOrders = async (userId: string) => {
    setOrdersLoading(true);
    try {
      const userOrders = await apiService.getOrdersByUserId(userId, true);
      setActiveOrders(getSortedActiveOrders(userOrders));
    } catch {
      toast.error('Не удалось обновить список заказов');
    } finally {
      setOrdersLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      return;
    }

    setSaving(true);

    try {
      await apiService.updateUser(user.id, formData);
      let updatedUser = await apiService.getUserById(user.id);

      if (selectedAvatarFile) {
        updatedUser = await apiService.uploadCurrentUserPhoto(selectedAvatarFile);
      }

      setUser(updatedUser);
      setFormData({
        name: updatedUser.name,
        email: updatedUser.email,
        birthday: updatedUser.birthday,
      });
      setSelectedAvatarFile(null);
      setAvatarPreviewUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }
        return null;
      });
      setEditMode(false);
      toast.success('Данные успешно обновлены');
    } catch (error) {
      toast.error('Ошибка обновления данных');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
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

  const handleStartEdit = () => {
    if (!user) {
      return;
    }

    setFormData({
      name: user.name,
      email: user.email,
      birthday: user.birthday,
    });
    clearSelectedAvatar();
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    if (!user) {
      return;
    }

    setFormData({
      name: user.name,
      email: user.email,
      birthday: user.birthday,
    });
    clearSelectedAvatar();
    setEditMode(false);
  };

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      await apiService.logout();
    } catch {
      // Игнорируем ошибку запроса и очищаем локальную авторизацию ниже.
    }

    clearAuth();
    localStorage.removeItem('cart');
    window.dispatchEvent(new Event('cart-updated'));
    onLogout();
    toast.success('Вы вышли из аккаунта');
    navigate('/login', { replace: true });
  };

  const handlePayOrder = async (orderId: string) => {
    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      toast.error('Ошибка авторизации');
      return;
    }

    if (payingOrderIds.has(orderId)) {
      return;
    }

    setPayingOrderIds((prev) => {
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });

    try {
      await apiService.confirmOrder(orderId);
      toast.success('Заказ успешно оплачен');
      await refreshActiveOrders(tokenUser.id);
    } catch {
      toast.error('Не удалось оплатить заказ');
    } finally {
      setPayingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  if (loading || !user) {
    return <div className="loading">Загрузка профиля...</div>;
  }

  const birthdayValue = user.birthday
    ? new Date(user.birthday).toLocaleDateString('ru-RU')
    : 'Не указана';
  const userAvatarUrl = typeof user.photo_url === 'string' && user.photo_url.trim().length > 0
    ? user.photo_url.trim()
    : null;
  const avatarUrl = avatarPreviewUrl || userAvatarUrl || MOCK_AVATAR;

  return (
    <section className="profile-page">
      <div className="profile-hero-card">
        <div className="profile-avatar-shell">
          <img
            src={avatarUrl}
            alt={`Фото пользователя ${user.name}`}
            className="profile-avatar-image"
          />
          <span className="profile-avatar-badge">{getInitials(user.name)}</span>
        </div>

        <div className="profile-hero-meta">
          <h1>Личный кабинет</h1>
          <p>{user.name}</p>
          <small>{user.email}</small>

          <div className="profile-hero-stats">
            <div className="profile-hero-stat">
              <strong>{activeOrders.length}</strong>
              <span>актуальных заказов</span>
            </div>
            <div className="profile-hero-stat">
              <strong>{user.is_seller ? 'Продавец' : 'Покупатель'}</strong>
              <span>тип аккаунта</span>
            </div>
          </div>
        </div>

        <div className="profile-hero-actions">
          {!editMode && (
            <button
              type="button"
              onClick={handleStartEdit}
              className="edit-btn profile-edit-trigger"
            >
              Редактировать
            </button>
          )}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="logout-btn profile-logout-trigger"
          >
            {loggingOut ? 'Выходим...' : 'Выйти из аккаунта'}
          </button>
        </div>
      </div>

      <div className="profile-grid">
        <section className="profile-panel">
          <div className="profile-panel-head">
            <h2>Информация о пользователе</h2>
          </div>

          {editMode ? (
            <form onSubmit={handleSubmit} className="profile-form">
              <div className="profile-form-grid">
                <div className="form-group profile-form-group">
                  <label htmlFor="name">Имя</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name || ''}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group profile-form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email || ''}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group profile-form-group">
                  <label htmlFor="birthday">Дата рождения</label>
                  <input
                    type="date"
                    id="birthday"
                    name="birthday"
                    value={formData.birthday || ''}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group profile-form-group profile-photo-upload-group">
                  <label htmlFor="profile-photo">Фото профиля</label>
                  <input
                    type="file"
                    id="profile-photo"
                    accept="image/*"
                    onChange={handleAvatarFileChange}
                  />
                  <small className="profile-photo-upload-hint">
                    PNG, JPG, WEBP, GIF или BMP. Максимум 5 МБ.
                  </small>
                  {selectedAvatarFile && (
                    <div className="profile-photo-upload-meta">
                      <span>{selectedAvatarFile.name}</span>
                      <button
                        type="button"
                        onClick={clearSelectedAvatar}
                        className="profile-photo-clear-btn"
                      >
                        Убрать
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="profile-actions">
                <button
                  type="submit"
                  disabled={saving}
                  className="save-btn"
                >
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="cancel-btn"
                >
                  Отмена
                </button>
              </div>
            </form>
          ) : (
            <div className="profile-info-grid">
              <div className="profile-info-item">
                <span>Имя</span>
                <strong>{user.name}</strong>
              </div>
              <div className="profile-info-item">
                <span>Email</span>
                <strong>{user.email}</strong>
              </div>
              <div className="profile-info-item">
                <span>Дата рождения</span>
                <strong>{birthdayValue}</strong>
              </div>
              <div className="profile-info-item">
                <span>ID профиля</span>
                <strong>{user.id}</strong>
              </div>
            </div>
          )}
        </section>

        <section className="profile-panel">
          <div className="profile-panel-head">
            <h2>Актуальные заказы</h2>
            <Link to="/orders" className="profile-all-orders-link">
              Все заказы
            </Link>
          </div>

          {ordersLoading && (
            <p className="profile-orders-empty">Загружаем актуальные заказы...</p>
          )}

          {!ordersLoading && activeOrders.length === 0 && (
            <p className="profile-orders-empty">Сейчас нет активных заказов.</p>
          )}

          {!ordersLoading && activeOrders.length > 0 && (
            <div className="profile-orders-list">
              {activeOrders.slice(0, 4).map((order) => {
                const statusKey = String(order.status || '').toLowerCase();
                const statusLabel = statusLabels[statusKey] || statusLabels.unknown;
                const statusTone = statusTones[statusKey] || statusTones.unknown;
                const total = calculateOrderTotal(order);
                const canPay = statusKey === 'reserved';
                const isPaying = payingOrderIds.has(order.id);

                return (
                  <article key={order.id} className="profile-order-card">
                    <header className="profile-order-head">
                      <h3>Заказ #{order.id.slice(0, 8).toUpperCase()}</h3>
                      <span className={`profile-order-status ${statusTone}`}>{statusLabel}</span>
                    </header>
                    <p className="profile-order-date">{formatDate(order.updated_at || order.created_at)}</p>
                    <footer className="profile-order-footer">
                      <span>{order.order_items.length} поз.</span>
                      <div className="profile-order-footer-actions">
                        {canPay && (
                          <button
                            type="button"
                            className="profile-pay-order-button"
                            disabled={isPaying}
                            onClick={() => void handlePayOrder(order.id)}
                          >
                            {isPaying ? 'Оплата...' : 'Оплатить'}
                          </button>
                        )}
                        <strong>{total !== null ? formatPrice(total) : 'Итог уточняется'}</strong>
                      </div>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
};

export default Profile;
