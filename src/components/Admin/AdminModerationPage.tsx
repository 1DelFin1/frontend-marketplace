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

const sortCategories = (categories: Category[]): Category[] => {
  return [...categories].sort((left, right) => left.name.localeCompare(right.name, 'ru'));
};

const AdminModerationPage: React.FC<AdminModerationPageProps> = ({ onLogout }) => {
  const [pendingProducts, setPendingProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryNameDrafts, setCategoryNameDrafts] = useState<Record<number, string>>({});
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [processingProductIds, setProcessingProductIds] = useState<number[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [updatingCategoryIds, setUpdatingCategoryIds] = useState<number[]>([]);
  const [deletingCategoryIds, setDeletingCategoryIds] = useState<number[]>([]);

  const adminName = getUserFromToken()?.name ?? 'Администратор';

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );

  const syncCategoryDrafts = (nextCategories: Category[]) => {
    setCategoryNameDrafts((previousDrafts) => {
      const nextDrafts: Record<number, string> = {};
      nextCategories.forEach((category) => {
        const previousValue = previousDrafts[category.id];
        nextDrafts[category.id] = typeof previousValue === 'string' ? previousValue : category.name;
      });
      return nextDrafts;
    });
  };

  const loadModerationData = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    try {
      const [pendingProductsData, categoriesData] = await Promise.all([
        apiService.getPendingProductsForModeration(),
        apiService.getCategories(),
      ]);

      const sortedCategories = sortCategories(categoriesData);
      setPendingProducts(pendingProductsData);
      setCategories(sortedCategories);
      syncCategoryDrafts(sortedCategories);
    } catch {
      setLoadError('Не удалось загрузить данные модерации');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadModerationData();
  }, [loadModerationData]);

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

  const handleCreateCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = newCategoryName.trim();
    if (!normalizedName) {
      toast.error('Введите название категории');
      return;
    }

    setCreatingCategory(true);
    try {
      const category = await apiService.createCategory({ name: normalizedName });
      setCategories((previous) => {
        const next = previous.filter((item) => item.id !== category.id);
        next.push(category);
        const sorted = sortCategories(next);
        syncCategoryDrafts(sorted);
        return sorted;
      });
      setCategoryNameDrafts((previous) => ({ ...previous, [category.id]: category.name }));
      setNewCategoryName('');
      toast.success('Категория сохранена');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('status: 403')) {
        toast.error('Добавлять категории может только администратор');
      } else {
        toast.error('Не удалось сохранить категорию');
      }
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleUpdateCategory = async (category: Category) => {
    const draftName = categoryNameDrafts[category.id] ?? category.name;
    const normalizedName = draftName.trim();
    if (!normalizedName) {
      toast.error('Название категории не может быть пустым');
      return;
    }

    if (normalizedName === category.name) {
      return;
    }

    setUpdatingCategoryIds((previous) => (
      previous.includes(category.id) ? previous : [...previous, category.id]
    ));

    try {
      const updatedCategory = await apiService.updateCategory(category.id, { name: normalizedName });
      setCategories((previous) => {
        const next = previous.map((item) => (item.id === updatedCategory.id ? updatedCategory : item));
        const sorted = sortCategories(next);
        syncCategoryDrafts(sorted);
        return sorted;
      });
      setCategoryNameDrafts((previous) => ({ ...previous, [updatedCategory.id]: updatedCategory.name }));
      toast.success('Категория обновлена');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('status: 409')) {
        toast.error('Категория с таким названием уже существует');
      } else if (errorMessage.includes('status: 404')) {
        toast.error('Категория не найдена');
      } else {
        toast.error('Не удалось обновить категорию');
      }
    } finally {
      setUpdatingCategoryIds((previous) => previous.filter((id) => id !== category.id));
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    setDeletingCategoryIds((previous) => (
      previous.includes(category.id) ? previous : [...previous, category.id]
    ));

    try {
      await apiService.deleteCategory(category.id);
      setCategories((previous) => previous.filter((item) => item.id !== category.id));
      setCategoryNameDrafts((previous) => {
        const next = { ...previous };
        delete next[category.id];
        return next;
      });
      toast.success('Категория удалена');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('status: 409')) {
        toast.error('Нельзя удалить категорию, если в ней есть товары');
      } else if (errorMessage.includes('status: 404')) {
        toast.error('Категория не найдена');
      } else {
        toast.error('Не удалось удалить категорию');
      }
    } finally {
      setDeletingCategoryIds((previous) => previous.filter((id) => id !== category.id));
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

      <article className="seller-card admin-categories-card">
        <div className="seller-products-toolbar">
          <div className="seller-products-title-block">
            <h2>Категории</h2>
            <span>{categories.length} всего</span>
          </div>
        </div>

        <form className="admin-category-create-form" onSubmit={handleCreateCategory}>
          <input
            type="text"
            maxLength={255}
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
            placeholder="Новая категория"
            disabled={creatingCategory}
          />
          <button type="submit" className="seller-product-save-btn" disabled={creatingCategory}>
            {creatingCategory ? 'Сохраняем...' : 'Добавить категорию'}
          </button>
        </form>

        {categories.length === 0 && (
          <div className="empty-state seller-products-empty">
            <h3>Категорий пока нет</h3>
            <p>Добавьте первую категорию для создания товаров.</p>
          </div>
        )}

        {categories.length > 0 && (
          <div className="admin-categories-table">
            {categories.map((category) => {
              const isUpdating = updatingCategoryIds.includes(category.id);
              const isDeleting = deletingCategoryIds.includes(category.id);
              const isBusy = isUpdating || isDeleting;

              return (
                <div key={category.id} className="admin-categories-row">
                  <input
                    type="text"
                    maxLength={255}
                    value={categoryNameDrafts[category.id] ?? category.name}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setCategoryNameDrafts((previous) => ({
                        ...previous,
                        [category.id]: nextValue,
                      }));
                    }}
                    disabled={isBusy}
                  />
                  <div className="admin-categories-actions">
                    <button
                      type="button"
                      className="seller-product-save-btn"
                      disabled={isBusy}
                      onClick={() => void handleUpdateCategory(category)}
                    >
                      {isUpdating ? 'Сохраняем...' : 'Сохранить'}
                    </button>
                    <button
                      type="button"
                      className="seller-product-sale-btn danger"
                      disabled={isBusy}
                      onClick={() => void handleDeleteCategory(category)}
                    >
                      {isDeleting ? 'Удаляем...' : 'Удалить'}
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
