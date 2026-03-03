import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../../services/api';
import { Seller } from '../../types/user';
import { getUserFromToken } from '../../utils/auth';

const navigationItems = [
  'Главная',
  'Товары и цены',
  'Финансы',
  'Аналитика',
  'Продвижение',
  'Отзывы',
];

const trend = [74, 70, 72, 69, 71, 74, 76, 73, 68, 67, 62, 63, 75, 73, 45];

const toPercent = (value: number): string => `${value.toFixed(1)}%`;

const SellerDashboard: React.FC = () => {
  const [seller, setSeller] = useState<Seller | null>(null);

  useEffect(() => {
    const loadSeller = async () => {
      try {
        const data = await apiService.getCurrentSeller();
        setSeller(data);
      } catch {
        setSeller(null);
      }
    };

    void loadSeller();
  }, []);

  const fallbackName = getUserFromToken()?.name ?? 'Продавец';
  const sellerName = seller?.name || fallbackName;

  const trendPoints = useMemo(() => {
    const max = Math.max(...trend);
    const min = Math.min(...trend);
    return trend
      .map((value, index) => {
        const x = (index / (trend.length - 1)) * 100;
        const normalized = max === min ? 50 : ((value - min) / (max - min)) * 80;
        const y = 90 - normalized;
        return `${x},${y}`;
      })
      .join(' ');
  }, []);

  const sellerRating = seller?.rating ?? 98.8;
  const sellerOrdersCount = seller?.orders_count ?? 219;

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
        {navigationItems.map((item, index) => (
          <button
            type="button"
            key={item}
            className={`seller-nav-item ${index === 0 ? 'active' : ''}`}
          >
            {item}
          </button>
        ))}
      </nav>

      <div className="seller-layout">
        <div className="seller-main-column">
          <article className="seller-card seller-analytics-card">
            <div className="seller-card-head">
              <h1>Заказано товаров за 14 дней</h1>
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
                <strong>61 169</strong>
                <span>Заказано</span>
              </div>
              <div>
                <strong>47 757</strong>
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
                  <span>Отзывы</span>
                  <b>{sellerOrdersCount}</b>
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
