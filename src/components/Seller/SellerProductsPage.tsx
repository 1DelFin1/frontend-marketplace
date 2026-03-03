import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiService } from '../../services/api';
import { Product, ProductCreate } from '../../types/product';
import { Category } from '../../types/category';
import { Seller } from '../../types/user';
import { getUserFromToken } from '../../utils/auth';

const sellerNavigation = [
  { label: 'Главная', to: '/seller' },
  { label: 'Товары и цены', to: '/seller/products' },
  { label: 'Финансы' },
  { label: 'Аналитика' },
  { label: 'Продвижение' },
  { label: 'Отзывы' },
];

const CUSTOM_CATEGORY_VALUE = '__custom__';

const createInitialFormState = (categoryId = '') => ({
  name: '',
  description: '',
  price: '',
  quantity: '0',
  categoryId,
  customCategoryName: '',
});

const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(price);
};

const SellerProductsPage: React.FC = () => {
  const location = useLocation();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState(createInitialFormState());

  const fallbackName = getUserFromToken()?.name ?? 'Продавец';
  const sellerName = seller?.name || fallbackName;
  const getCategoryName = (categoryId?: number): string => {
    if (!categoryId) {
      return 'Без категории';
    }

    const category = categories.find((item) => item.id === categoryId);
    return category?.name || `Категория #${categoryId}`;
  };

  const loadProductsBySeller = async (sellerId: string) => {
    const productsData = await apiService.getProducts();
    const sellerProducts = productsData
      .filter((product) => product.seller_id === sellerId)
      .sort((a, b) => b.id - a.id);

    setProducts(sellerProducts);
  };

  const loadCategories = async () => {
    const categoriesData = await apiService.getCategories();
    setCategories(categoriesData);
    return categoriesData;
  };

  useEffect(() => {
    const loadPageData = async () => {
      setLoading(true);
      setLoadError('');

      try {
        const sellerData = await apiService.getCurrentSeller();
        const categoriesData = await loadCategories();
        setSeller(sellerData);
        await loadProductsBySeller(sellerData.id);
        setFormData((prev) => {
          if (prev.categoryId) {
            return prev;
          }

          const defaultCategoryId = categoriesData[0]?.id ? String(categoriesData[0].id) : '';
          return {
            ...prev,
            categoryId: defaultCategoryId,
          };
        });
      } catch {
        setLoadError('Не удалось загрузить товары продавца');
        toast.error('Не удалось загрузить товары продавца');
      } finally {
        setLoading(false);
      }
    };

    void loadPageData();
  }, []);

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCreateProduct = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!seller) {
      toast.error('Не удалось определить продавца');
      return;
    }

    const name = formData.name.trim();
    const description = formData.description.trim();
    const price = Number(formData.price.replace(',', '.'));
    const quantity = Number(formData.quantity);
    const selectedCategory = formData.categoryId;

    if (!name || !description) {
      toast.error('Заполните название и описание товара');
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Цена должна быть больше 0');
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      toast.error('Количество должно быть целым и неотрицательным');
      return;
    }

    setCreating(true);
    try {
      let categoryId: number;

      if (!selectedCategory) {
        toast.error('Выберите категорию');
        return;
      }

      if (selectedCategory === CUSTOM_CATEGORY_VALUE) {
        const customCategoryName = formData.customCategoryName.trim();
        if (!customCategoryName) {
          toast.error('Введите название новой категории');
          return;
        }

        const newCategory = await apiService.createCategory({ name: customCategoryName });
        categoryId = newCategory.id;

        setCategories((prev) => {
          const exists = prev.some((category) => category.id === newCategory.id);
          if (exists) {
            return prev;
          }
          return [...prev, newCategory].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        });
      } else {
        categoryId = Number(selectedCategory);
        if (!Number.isInteger(categoryId) || categoryId <= 0) {
          toast.error('Выберите корректную категорию');
          return;
        }
      }

      const payload: ProductCreate = {
        name,
        description,
        price,
        quantity,
        seller_id: seller.id,
        category_id: categoryId,
      };

      await apiService.createProduct(payload);
      await loadProductsBySeller(seller.id);
      setFormData(createInitialFormState(String(categoryId)));
      toast.success('Новый товар создан');
    } catch {
      toast.error('Не удалось создать товар');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="seller-page seller-products-page">
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
        {sellerNavigation.map((item) => {
          if (item.to) {
            const isActive = location.pathname === item.to;
            return (
              <Link key={item.label} to={item.to} className={`seller-nav-item ${isActive ? 'active' : ''}`}>
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

      <div className="seller-products-grid">
        <article className="seller-card">
          <div className="seller-card-head">
            <h1>Товары и цены</h1>
            <span>{products.length} товаров</span>
          </div>

          {loading && <div className="loading">Загрузка товаров...</div>}

          {!loading && loadError && <p className="seller-products-load-error">{loadError}</p>}

          {!loading && !loadError && products.length === 0 && (
            <div className="empty-state seller-products-empty">
              <h3>Пока нет товаров</h3>
              <p>Создайте первый товар через форму справа.</p>
            </div>
          )}

          {!loading && !loadError && products.length > 0 && (
            <div className="seller-products-table">
              <div className="seller-products-row seller-products-row-head">
                <span>Товар</span>
                <span>Категория</span>
                <span>Цена</span>
                <span>Остаток</span>
                <span>Статус</span>
              </div>

              {products.map((product) => {
                const inStock = (product.quantity || 0) > 0;
                return (
                  <div key={product.id} className="seller-products-row">
                    <span className="seller-product-name">{product.name}</span>
                    <span>{getCategoryName(product.category_id)}</span>
                    <span className="seller-product-price">{formatPrice(product.price)}</span>
                    <span>{product.quantity} шт.</span>
                    <span className={`seller-stock-badge ${inStock ? 'in-stock' : 'out-of-stock'}`}>
                      {inStock ? 'В наличии' : 'Нет в наличии'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="seller-card">
          <h2>Создать новый товар</h2>
          <form className="seller-create-product-form" onSubmit={handleCreateProduct}>
            <div className="form-group">
              <label htmlFor="new-product-name">Название</label>
              <input
                id="new-product-name"
                name="name"
                type="text"
                maxLength={255}
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Например: Кофемолка ручная"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="new-product-description">Описание</label>
              <textarea
                id="new-product-description"
                name="description"
                maxLength={255}
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Кратко опишите товар"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="new-product-category">Категория</label>
              <select
                id="new-product-category"
                name="categoryId"
                value={formData.categoryId}
                onChange={handleInputChange}
                required
              >
                <option value="" disabled>
                  Выберите категорию
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={String(category.id)}>
                    {category.name}
                  </option>
                ))}
                <option value={CUSTOM_CATEGORY_VALUE}>Своя категория</option>
              </select>
            </div>

            {formData.categoryId === CUSTOM_CATEGORY_VALUE && (
              <div className="form-group">
                <label htmlFor="new-custom-category-name">Новая категория</label>
                <input
                  id="new-custom-category-name"
                  name="customCategoryName"
                  type="text"
                  maxLength={255}
                  value={formData.customCategoryName}
                  onChange={handleInputChange}
                  placeholder="Например: Товары для кемпинга"
                  required
                />
                <small className="seller-form-hint">
                  Сначала создадим категорию, затем добавим товар.
                </small>
              </div>
            )}

            <div className="seller-create-product-two-columns">
              <div className="form-group">
                <label htmlFor="new-product-price">Цена (RUB)</label>
                <input
                  id="new-product-price"
                  name="price"
                  type="number"
                  min="1"
                  step="0.01"
                  value={formData.price}
                  onChange={handleInputChange}
                  placeholder="1990"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="new-product-quantity">Количество</label>
                <input
                  id="new-product-quantity"
                  name="quantity"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            <button type="submit" className="auth-button" disabled={creating || loading || !seller}>
              {creating ? 'Создаём...' : 'Создать товар'}
            </button>
          </form>
        </article>
      </div>
    </section>
  );
};

export default SellerProductsPage;
