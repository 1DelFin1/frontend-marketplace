import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { User, UserUpdate, UserOrder } from '../../types/user';
import { apiService } from '../../services/api';
import { getUserFromToken } from '../../utils/auth';

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
  paid: 'processing',
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

const Profile: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeOrders, setActiveOrders] = useState<UserOrder[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<UserUpdate>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    void fetchProfileData();
  }, []);

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

      const nextActiveOrders = userOrders
        .filter((order) => ACTIVE_ORDER_STATUSES.has(String(order.status || '').toLowerCase()))
        .sort((a, b) => {
          const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
          const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
          return bTime - aTime;
        });

      setActiveOrders(nextActiveOrders);
    } catch (error) {
      toast.error('Ошибка загрузки данных пользователя');
    } finally {
      setLoading(false);
      setOrdersLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (user) {
        const updatedUser = await apiService.updateUser(user.id, formData);
        setUser(updatedUser);
        setEditMode(false);
        toast.success('Данные успешно обновлены');
      }
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

  if (loading || !user) {
    return <div className="loading">Загрузка профиля...</div>;
  }

  const birthdayValue = user.birthday
    ? new Date(user.birthday).toLocaleDateString('ru-RU')
    : 'Не указана';

  return (
    <section className="profile-page">
      <div className="profile-hero-card">
        <div className="profile-avatar-shell">
          <img
            src={MOCK_AVATAR}
            alt={`Моковое фото пользователя ${user.name}`}
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

        {!editMode && (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className="edit-btn profile-edit-trigger"
          >
            Редактировать
          </button>
        )}
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
                  onClick={() => setEditMode(false)}
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

                return (
                  <article key={order.id} className="profile-order-card">
                    <header className="profile-order-head">
                      <h3>Заказ #{order.id.slice(0, 8).toUpperCase()}</h3>
                      <span className={`profile-order-status ${statusTone}`}>{statusLabel}</span>
                    </header>
                    <p className="profile-order-date">{formatDate(order.updated_at || order.created_at)}</p>
                    <footer className="profile-order-footer">
                      <span>{order.order_items.length} поз.</span>
                      <strong>{total !== null ? formatPrice(total) : 'Итог уточняется'}</strong>
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
