import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { apiService } from '../../services/api';
import { Product } from '../../types/product';
import { Category } from '../../types/category';
import { getUserFromToken } from '../../utils/auth';

interface AdminModerationPageProps {
  onLogout: () => void;
}

const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(price);
};

const formatCreatedAt = (value?: string): string => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

const AdminModerationPage: React.FC<AdminModerationPageProps> = ({ onLogout }) => {
  const [pendingProducts, setPendingProducts] = useState<Product[]>([]);
  const [categoriesById, setCategoriesById] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [processingProductIds, setProcessingProductIds] = useState<number[]>([]);

  const adminName = getUserFromToken()?.name ?? 'Администратор';

  const loadPendingProducts = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    try {
      const [pendingProductsData, categoriesData] = await Promise.all([
        apiService.getPendingProductsForModeration(),
        apiService.getCategories(),
      ]);

      setPendingProducts(pendingProductsData);
      setCategoriesById(new Map(categoriesData.map((category: Category) => [category.id, category.name])));
    } catch {
      setLoadError('Не удалось загрузить список товаров на модерации');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPendingProducts();
  }, [loadPendingProducts]);

  const handleLogout = async () => {
    try {
      await apiService.logout();
    } catch {
      // local auth reset still should happen below
    } finally {
      onLogout();
    }
  };

  const handleModerationDecision = async (product: Product, decision: 'approve' | 'reject') => {
    const productId = product.id;
    setProcessingProductIds((previousIds) => (
      previousIds.includes(productId) ? previousIds : [...previousIds, productId]
    ));

    try {
      if (decision === 'approve') {
        await apiService.approveProduct(productId);
        toast.success(`Товар "${product.name}" одобрен`);
      } else {
        await apiService.rejectProduct(productId);
        toast.success(`Товар "${product.name}" отклонён`);
      }

      setPendingProducts((previousProducts) => previousProducts.filter((item) => item.id !== productId));
    } catch {
      toast.error('Не удалось выполнить действие модерации');
    } finally {
      setProcessingProductIds((previousIds) => previousIds.filter((id) => id !== productId));
    }
  };

  const pendingProductsCount = useMemo(() => pendingProducts.length, [pendingProducts]);

  return (
    <section className="seller-page admin-page">
      <header className="seller-topbar">
        <div className="seller-brand">
          <span className="seller-brand-accent">Marketplace</span>
          <span className="seller-brand-muted">Admin</span>
        </div>
        <div className="seller-topbar-user">
          <span>{adminName}</span>
          <button type="button" className="seller-danger-button" onClick={() => void handleLogout()}>
            Выйти
          </button>
        </div>
      </header>

      <article className="seller-card admin-moderation-card">
        <div className="seller-products-toolbar">
          <div className="seller-products-title-block">
            <h1>Модерация товаров</h1>
            <span>{pendingProductsCount} ожидают проверки</span>
          </div>
        </div>

        {loading && <div className="loading">Загрузка товаров на модерации...</div>}

        {!loading && loadError && (
          <div className="seller-products-load-error">
            {loadError}
          </div>
        )}

        {!loading && !loadError && pendingProducts.length === 0 && (
          <div className="empty-state seller-products-empty">
            <h3>Нет товаров на модерации</h3>
            <p>Новые товары появятся здесь автоматически.</p>
          </div>
        )}

        {!loading && !loadError && pendingProducts.length > 0 && (
          <div className="admin-products-table">
            <div className="admin-products-row admin-products-row-head">
              <span>Товар</span>
              <span>Категория</span>
              <span>Продавец</span>
              <span>Цена</span>
              <span>Остаток</span>
              <span>Создан</span>
              <span>Действия</span>
            </div>

            {pendingProducts.map((product) => {
              const isProcessing = processingProductIds.includes(product.id);
              const categoryTitle = typeof product.category_id === 'number'
                ? (categoriesById.get(product.category_id) || `Категория #${product.category_id}`)
                : 'Без категории';

              return (
                <div key={product.id} className="admin-products-row">
                  <span className="admin-product-name">
                    <b>{product.name}</b>
                    <small>ID: {product.id}</small>
                  </span>
                  <span>{categoryTitle}</span>
                  <span className="admin-product-seller">{product.seller_id || '—'}</span>
                  <span>{formatPrice(product.price)}</span>
                  <span>{product.quantity} шт.</span>
                  <span>{formatCreatedAt(product.created_at)}</span>
                  <div className="admin-product-actions">
                    <button
                      type="button"
                      className="seller-product-sale-btn success"
                      disabled={isProcessing}
                      onClick={() => void handleModerationDecision(product, 'approve')}
                    >
                      {isProcessing ? 'Сохраняем...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      className="seller-product-sale-btn danger"
                      disabled={isProcessing}
                      onClick={() => void handleModerationDecision(product, 'reject')}
                    >
                      {isProcessing ? 'Сохраняем...' : 'Reject'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
};

export default AdminModerationPage;
