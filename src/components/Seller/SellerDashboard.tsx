import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiService } from '../../services/api';
import { Seller, UserOrder } from '../../types/user';
import { getUserFromToken } from '../../utils/auth';

const navigationItems = [
  { label: 'Главная', to: '/seller' },
  { label: 'Товары и цены', to: '/seller/products' },
  { label: 'Финансы' },
  { label: 'Аналитика' },
  { label: 'Продвижение' },
  { label: 'Отзывы' },
];

const DASHBOARD_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const deliveredOrderStatuses = new Set(['delivered', 'completed']);

const toPercent = (value: number): string => `${value.toFixed(1)}%`;
const toDayStart = (date: Date): Date => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const SellerDashboard: React.FC = () => {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [sellerOrders, setSellerOrders] = useState<UserOrder[] | null>(null);
  const [sellerOrdersCount, setSellerOrdersCount] = useState<number | null>(null);
  const location = useLocation();

  useEffect(() => {
    const loadSeller = async () => {
      try {
        const data = await apiService.getCurrentSeller();
        setSeller(data);
        setSellerOrdersCount(typeof data.orders_count === 'number' ? data.orders_count : null);
        const orders = await apiService.getSellerOrders(data.id);
        if (orders !== null) {
          setSellerOrders(orders);
          setSellerOrdersCount(orders.length);
        } else {
          setSellerOrders(null);
          const actualOrdersCount = await apiService.getSellerOrdersCount(data.id, data.orders_count ?? null);
          if (typeof actualOrdersCount === 'number') {
            setSellerOrdersCount(actualOrdersCount);
          }
        }
      } catch {
        setSeller(null);
        setSellerOrders(null);
        setSellerOrdersCount(null);
      }
    };

    void loadSeller();
  }, []);

  const fallbackName = getUserFromToken()?.name ?? 'Продавец';
  const sellerName = seller?.name || fallbackName;

  const sellerOrdersStats = useMemo(() => {
    const trendValues = Array.from({ length: DASHBOARD_DAYS }, () => 0);
    if (!sellerOrders) {
      return {
        trendValues,
        ordersInWindow: null,
        deliveredInWindow: null,
      };
    }

    const todayStart = toDayStart(new Date());
    const windowStart = new Date(todayStart);
    windowStart.setDate(windowStart.getDate() - (DASHBOARD_DAYS - 1));

    let deliveredInWindow = 0;

    sellerOrders.forEach((order) => {
      const dateSource = order.created_at ?? order.updated_at;
      if (!dateSource) {
        return;
      }

      const orderDate = new Date(dateSource);
      if (Number.isNaN(orderDate.getTime())) {
        return;
      }

      const orderDay = toDayStart(orderDate);
      const dayIndex = Math.floor((orderDay.getTime() - windowStart.getTime()) / DAY_MS);
      if (dayIndex < 0 || dayIndex >= DASHBOARD_DAYS) {
        return;
      }

      trendValues[dayIndex] += 1;
      if (deliveredOrderStatuses.has(String(order.status || '').toLowerCase())) {
        deliveredInWindow += 1;
      }
    });

    return {
      trendValues,
      ordersInWindow: trendValues.reduce((sum, value) => sum + value, 0),
      deliveredInWindow,
    };
  }, [sellerOrders]);

  const trendPoints = useMemo(() => {
    const trendValues = sellerOrdersStats.trendValues;
    const max = Math.max(...trendValues);
    const min = Math.min(...trendValues);
    return trendValues
      .map((value, index) => {
        const x = (index / (trendValues.length - 1)) * 100;
        if (max === 0) {
          return `${x},90`;
        }

        const normalized = max === min ? 80 : ((value - min) / (max - min)) * 80;
        const y = 90 - normalized;
        return `${x},${y}`;
      })
      .join(' ');
  }, [sellerOrdersStats]);

  const sellerRating = seller?.rating ?? 98.8;
  const formattedSellerOrdersCount = sellerOrdersCount !== null ? sellerOrdersCount.toLocaleString('ru-RU') : '—';
  const formattedOrdersInWindow = sellerOrdersStats.ordersInWindow !== null
    ? sellerOrdersStats.ordersInWindow.toLocaleString('ru-RU')
    : formattedSellerOrdersCount;
  const formattedDeliveredInWindow = sellerOrdersStats.deliveredInWindow !== null
    ? sellerOrdersStats.deliveredInWindow.toLocaleString('ru-RU')
    : '—';
  const ordersAnalyticsTitle = sellerOrdersStats.ordersInWindow !== null ? 'Заказы за 14 дней' : 'Заказы';

  return (
    <section className="seller-page">
      <header className="seller-topbar">
        <div className="seller-brand">
          <span className="seller-brand-accent">Marketplace</span>
          <span className="seller-brand-muted">Seller</span>
        </div>
        <div className="seller-topbar-user">
          <span>{sellerName}</span>
          <Link to="/seller/profile" className="seller-link-button">
            Личный кабинет
          </Link>
        </div>
      </header>

      <nav className="seller-nav">
        {navigationItems.map((item) => {
          if (item.to) {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.label}
                to={item.to}
                className={`seller-nav-item ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            );
          }

          return (
            <span key={item.label} className="seller-nav-item seller-nav-item-disabled">
              {item.label}
            </span>
          );
        })}
      </nav>

      <div className="seller-layout">
        <div className="seller-main-column">
          <article className="seller-card seller-analytics-card">
            <div className="seller-card-head">
              <h1>{ordersAnalyticsTitle}</h1>
              <span>Часовой пояс: UTC +3</span>
            </div>
            <div className="seller-chart-wrap" aria-label="График заказов">
              <svg viewBox="0 0 100 100" className="seller-chart" preserveAspectRatio="none">
                <polyline points={`0,100 ${trendPoints} 100,100`} className="seller-chart-area" />
                <polyline points={trendPoints} className="seller-chart-line" />
              </svg>
            </div>
            <div className="seller-two-stats">
              <div>
                <strong>{formattedOrdersInWindow}</strong>
                <span>Заказов</span>
              </div>
              <div>
                <strong>{formattedDeliveredInWindow}</strong>
                <span>Доставлено</span>
              </div>
            </div>
          </article>

          <div className="seller-double-grid">
            <article className="seller-card">
              <h2>Рейтинг продавца</h2>
              <ul className="seller-list">
                <li>
                  <span>Оценка работы</span>
                  <b>{toPercent(sellerRating)}</b>
                </li>
                <li>
                  <span>Поставки без опозданий</span>
                  <b>99.4%</b>
                </li>
                <li>
                  <span>Точность заявок</span>
                  <b>99.9%</b>
                </li>
              </ul>
            </article>

            <article className="seller-card">
              <h2>Коммуникации</h2>
              <ul className="seller-list seller-list-with-badges">
                <li>
                  <span>Заказы</span>
                  <b>{formattedSellerOrdersCount}</b>
                </li>
                <li>
                  <span>Сообщения</span>
                  <b>17</b>
                </li>
                <li>
                  <span>Вопросы</span>
                  <b>3</b>
                </li>
              </ul>
            </article>
          </div>

          <div className="seller-double-grid">
            <article className="seller-card seller-small-card">
              <h2>Бонусы на продвижение</h2>
              <strong>0 бонусов</strong>
              <p>Подключите рекламные инструменты, чтобы получить больше заказов.</p>
            </article>

            <article className="seller-card seller-small-card">
              <h2>Premium Plus</h2>
              <strong>Подписка активна</strong>
              <p>Текущий период: 01 сентября - 15 сентября</p>
            </article>
          </div>
        </div>

        <aside className="seller-side-column">
          <article className="seller-card seller-news-card">
            <h2>Что нового</h2>
            <p>Актуальные обновления и советы для роста продаж в вашем кабинете.</p>
          </article>
          <article className="seller-card seller-promo-card seller-promo-pink">
            <h2>Курсы для продавцов</h2>
            <p>Практика по ассортименту, карточкам и повышению конверсии.</p>
          </article>
          <article className="seller-card seller-promo-card seller-promo-blue">
            <h2>Закупитесь к сезону</h2>
            <p>Рассчитайтесь с поставщиками без записей в кредитной истории.</p>
          </article>
        </aside>
      </div>
    </section>
  );
};

export default SellerDashboard;
