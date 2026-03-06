import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiService } from '../../services/api';
import { Product, ProductCreate, ProductUpdate } from '../../types/product';
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createInitialFormState = (categoryId = '') => ({
  name: '',
  description: '',
  price: '',
  quantity: '0',
  categoryId,
  customCategoryName: '',
});

const createInitialEditFormState = (product?: Product) => ({
  name: product?.name || '',
  description: product?.description || '',
  price: typeof product?.price === 'number' ? String(product.price) : '',
  quantity: typeof product?.quantity === 'number' ? String(product.quantity) : '0',
  categoryId: product?.category_id ? String(product.category_id) : '',
});

const createProductUuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
};

const extractProductFolderUuid = (product?: Product): string | null => {
  if (!product?.photo_urls) {
    return null;
  }

  const orderedKeys = Object.keys(product.photo_urls).sort((a, b) => Number(a) - Number(b));
  for (const key of orderedKeys) {
    const url = product.photo_urls[key];
    if (typeof url !== 'string' || !url.trim()) {
      continue;
    }

    let pathname = '';
    try {
      pathname = new URL(url).pathname;
    } catch {
      pathname = url;
    }

    const parts = pathname.split('/').filter(Boolean);
    const productsIndex = parts.findIndex((part) => part === 'products');
    if (productsIndex === -1 || productsIndex + 1 >= parts.length) {
      continue;
    }

    const folderUuid = parts[productsIndex + 1];
    if (UUID_PATTERN.test(folderUuid)) {
      return folderUuid.toLowerCase();
    }
  }

  return null;
};

const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(price);
};

const isProductOnSale = (product: Product): boolean => product.is_active !== false;
const isProductActive = (product: Product): boolean => isProductOnSale(product);

type ProductFilterTab = 'all' | 'active' | 'inactive';

const SellerProductsPage: React.FC = () => {
  const location = useLocation();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [sellerOrdersCount, setSellerOrdersCount] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [formData, setFormData] = useState(createInitialFormState());
  const [editFormData, setEditFormData] = useState(createInitialEditFormState());
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [selectedEditPhotos, setSelectedEditPhotos] = useState<File[]>([]);
  const [productUploadUuid, setProductUploadUuid] = useState<string>(createProductUuid());
  const [editProductUploadUuid, setEditProductUploadUuid] = useState<string>(createProductUuid());
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [productFilter, setProductFilter] = useState<ProductFilterTab>('all');
  const [productSearch, setProductSearch] = useState('');
  const [deactivatingProductIds, setDeactivatingProductIds] = useState<number[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const createProductNameInputRef = useRef<HTMLInputElement | null>(null);

  const fallbackName = getUserFromToken()?.name ?? 'Продавец';
  const sellerName = seller?.name || fallbackName;
  const formattedSellerOrdersCount = sellerOrdersCount !== null ? sellerOrdersCount.toLocaleString('ru-RU') : '—';
  const normalizedSearch = productSearch.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesFilter =
        productFilter === 'all'
        || (productFilter === 'active' && isProductActive(product))
        || (productFilter === 'inactive' && !isProductOnSale(product));

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchable = `${product.id} ${product.name} ${product.description}`.toLowerCase();
      return searchable.includes(normalizedSearch);
    });
  }, [products, productFilter, normalizedSearch]);
  const selectedProductIdsSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);
  const selectedOnSaleProducts = useMemo(
    () => products.filter((product) => selectedProductIdsSet.has(product.id) && isProductOnSale(product)),
    [products, selectedProductIdsSet]
  );
  const filteredProductIds = useMemo(() => filteredProducts.map((product) => product.id), [filteredProducts]);
  const allFilteredSelected = filteredProductIds.length > 0
    && filteredProductIds.every((id) => selectedProductIdsSet.has(id));
  const canDeactivateSelectedProduct = selectedOnSaleProducts.length > 0;
  const activeFilterCounts = {
    all: products.length,
    active: products.filter((product) => isProductActive(product)).length,
    inactive: products.filter((product) => !isProductOnSale(product)).length,
  };

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
    setSelectedProductIds((previousSelectedProductIds) =>
      previousSelectedProductIds.filter((id) => sellerProducts.some((product) => product.id === id))
    );
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
        setSellerOrdersCount(typeof sellerData.orders_count === 'number' ? sellerData.orders_count : null);
        const actualOrdersCount = await apiService.getSellerOrdersCount(
          sellerData.id,
          sellerData.orders_count ?? null
        );
        if (typeof actualOrdersCount === 'number') {
          setSellerOrdersCount(actualOrdersCount);
        }
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
        setSellerOrdersCount(null);
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

  const handlePhotosChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    setSelectedPhotos(files);
  };

  const handleEditInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setEditFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleEditPhotosChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    setSelectedEditPhotos(files);
  };

  const startEditProduct = (product: Product) => {
    setShowCreateForm(false);
    setEditingProductId(product.id);
    setEditFormData(createInitialEditFormState(product));
    setSelectedEditPhotos([]);
    setEditProductUploadUuid(extractProductFolderUuid(product) || createProductUuid());
  };

  const cancelEditProduct = () => {
    setEditingProductId(null);
    setEditFormData(createInitialEditFormState());
    setSelectedEditPhotos([]);
    setEditProductUploadUuid(createProductUuid());
  };

  const handleOpenCreateProductForm = () => {
    if (editingProductId !== null) {
      cancelEditProduct();
    }
    setShowCreateForm(true);
    window.requestAnimationFrame(() => {
      createProductNameInputRef.current?.focus();
      createProductNameInputRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  };

  const toggleProductSelection = (productId: number) => {
    setSelectedProductIds((previousSelectedProductIds) => {
      if (previousSelectedProductIds.includes(productId)) {
        return previousSelectedProductIds.filter((id) => id !== productId);
      }
      return [...previousSelectedProductIds, productId];
    });
  };

  const handleToggleSelectAll = () => {
    if (filteredProductIds.length === 0) {
      return;
    }

    setSelectedProductIds((previousSelectedProductIds) => {
      const previousSet = new Set(previousSelectedProductIds);

      if (allFilteredSelected) {
        return previousSelectedProductIds.filter((id) => !filteredProductIds.includes(id));
      }

      filteredProductIds.forEach((id) => previousSet.add(id));
      return Array.from(previousSet);
    });
  };

  const handleProductSaleStatusChange = async (product: Product, nextIsActive: boolean) => {
    if (!seller) {
      toast.error('Не удалось определить продавца');
      return;
    }

    setDeactivatingProductIds((prev) => (prev.includes(product.id) ? prev : [...prev, product.id]));
    try {
      await apiService.updateProduct(product.id, { is_active: nextIsActive });
      await loadProductsBySeller(seller.id);
      toast.success(nextIsActive ? 'Товар возвращён в продажу' : 'Товар снят с продажи');
    } catch {
      toast.error(nextIsActive ? 'Не удалось вернуть товар в продажу' : 'Не удалось снять товар с продажи');
    } finally {
      setDeactivatingProductIds((prev) => prev.filter((id) => id !== product.id));
    }
  };

  const handleDeactivateSelectedProduct = async () => {
    if (!seller || selectedOnSaleProducts.length === 0) {
      return;
    }

    const targetIds = selectedOnSaleProducts.map((product) => product.id);
    setDeactivatingProductIds((prev) => Array.from(new Set([...prev, ...targetIds])));
    try {
      await Promise.all(
        targetIds.map((productId) => apiService.updateProduct(productId, { is_active: false }))
      );
      await loadProductsBySeller(seller.id);
      toast.success(
        targetIds.length > 1
          ? `${targetIds.length} товаров сняты с продажи`
          : 'Товар снят с продажи'
      );
      setSelectedProductIds((prev) => prev.filter((id) => !targetIds.includes(id)));
    } catch {
      toast.error('Не удалось снять выбранные товары с продажи');
    } finally {
      setDeactivatingProductIds((prev) => prev.filter((id) => !targetIds.includes(id)));
    }
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

      if (selectedPhotos.length > 0) {
        const uploadedPhotoUrls = await apiService.uploadProductPhotos(selectedPhotos, productUploadUuid);
        if (Object.keys(uploadedPhotoUrls).length > 0) {
          payload.photo_urls = uploadedPhotoUrls;
        }
      }

      await apiService.createProduct(payload);
      await loadProductsBySeller(seller.id);
      setFormData(createInitialFormState(String(categoryId)));
      setSelectedPhotos([]);
      setProductUploadUuid(createProductUuid());
      toast.success('Новый товар создан');
    } catch {
      toast.error('Не удалось создать товар');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateProduct = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!seller || editingProductId === null) {
      toast.error('Не удалось определить товар для редактирования');
      return;
    }

    const name = editFormData.name.trim();
    const description = editFormData.description.trim();
    const price = Number(editFormData.price.replace(',', '.'));
    const quantity = Number(editFormData.quantity);
    const categoryId = Number(editFormData.categoryId);

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

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      toast.error('Выберите корректную категорию');
      return;
    }

    const payload: ProductUpdate = {
      name,
      description,
      price,
      quantity,
      category_id: categoryId,
    };

    if (selectedEditPhotos.length > 0) {
      const uploadedPhotoUrls = await apiService.uploadProductPhotos(
        selectedEditPhotos,
        editProductUploadUuid
      );
      if (Object.keys(uploadedPhotoUrls).length > 0) {
        payload.photo_urls = uploadedPhotoUrls;
      }
    }

    setUpdating(true);
    try {
      await apiService.updateProduct(editingProductId, payload);
      await loadProductsBySeller(seller.id);
      cancelEditProduct();
      toast.success('Товар обновлён');
    } catch {
      toast.error('Не удалось обновить товар');
    } finally {
      setUpdating(false);
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

      <div className={`seller-products-grid ${showCreateForm || editingProductId !== null ? '' : 'seller-products-grid-full'}`}>
        <article className="seller-card">
          <div className="seller-products-toolbar">
            <div className="seller-products-title-block">
              <h1>Список товаров</h1>
              <span>
                {products.length} товаров · {formattedSellerOrdersCount} заказов
              </span>
            </div>

            <div className="seller-products-top-actions">
              <button
                type="button"
                className="seller-link-button seller-products-add-btn"
                onClick={handleOpenCreateProductForm}
                disabled={loading || !seller}
              >
                Добавить товар
              </button>
              <button
                type="button"
                className="seller-secondary-button seller-products-select-btn"
                onClick={handleToggleSelectAll}
                disabled={filteredProducts.length === 0 || loading}
              >
                {allFilteredSelected ? 'Снять выделение' : 'Выбрать все'}
              </button>
              <button
                type="button"
                className="seller-danger-button seller-products-remove-btn"
                onClick={handleDeactivateSelectedProduct}
                disabled={!canDeactivateSelectedProduct || deactivatingProductIds.length > 0 || loading}
              >
                {deactivatingProductIds.length > 0
                  ? 'Снимаем...'
                  : `Снять с продажи${selectedOnSaleProducts.length > 1 ? ` (${selectedOnSaleProducts.length})` : ''}`}
              </button>
            </div>
          </div>

          {loading && <div className="loading">Загрузка товаров...</div>}

          {!loading && loadError && <p className="seller-products-load-error">{loadError}</p>}

          {!loading && !loadError && products.length === 0 && (
            <div className="empty-state seller-products-empty">
              <h3>Пока нет товаров</h3>
              <p>Нажмите «Добавить товар», чтобы опубликовать первую позицию.</p>
            </div>
          )}

          {!loading && !loadError && products.length > 0 && (
            <>
              <div className="seller-products-tabs" role="tablist" aria-label="Фильтр товаров">
                <button
                  type="button"
                  className={`seller-products-tab ${productFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setProductFilter('all')}
                >
                  Все <span>{activeFilterCounts.all}</span>
                </button>
                <button
                  type="button"
                  className={`seller-products-tab ${productFilter === 'active' ? 'active' : ''}`}
                  onClick={() => setProductFilter('active')}
                >
                  Активные <span>{activeFilterCounts.active}</span>
                </button>
                <button
                  type="button"
                  className={`seller-products-tab ${productFilter === 'inactive' ? 'active' : ''}`}
                  onClick={() => setProductFilter('inactive')}
                >
                  Сняты с продажи <span>{activeFilterCounts.inactive}</span>
                </button>
              </div>

              <div className="seller-products-filter-row">
                <input
                  type="search"
                  className="seller-products-search"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Поиск по названию, описанию или ID"
                  aria-label="Поиск товара"
                />
              </div>

              {filteredProducts.length > 0 ? (
                <div className="seller-products-table">
                  <div className="seller-products-row seller-products-row-head">
                    <span>Выбор</span>
                    <span>Товар</span>
                    <span>Категория</span>
                    <span>Цена</span>
                    <span>Остаток</span>
                    <span>Статус</span>
                    <span>Действия</span>
                  </div>

                  {filteredProducts.map((product) => {
                    const onSale = isProductOnSale(product);
                    const isSelected = selectedProductIdsSet.has(product.id);
                    const saleActionInProgress = deactivatingProductIds.includes(product.id);

                    return (
                      <div key={product.id} className={`seller-products-row ${isSelected ? 'selected' : ''}`}>
                        <span className="seller-product-select-cell">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleProductSelection(product.id)}
                            aria-label={`Выбрать товар ${product.name}`}
                          />
                        </span>
                        <span className="seller-product-name">{product.name}</span>
                        <span>{getCategoryName(product.category_id)}</span>
                        <span className="seller-product-price">{formatPrice(product.price)}</span>
                        <span>{product.quantity} шт.</span>
                        <span className={`seller-stock-badge ${onSale ? 'in-stock' : 'off-sale'}`}>
                          {onSale ? 'Активен' : 'Неактивен'}
                        </span>
                        <div className="seller-product-actions">
                          <button
                            type="button"
                            className="seller-product-edit-btn"
                            onClick={() => startEditProduct(product)}
                            disabled={updating || saleActionInProgress}
                          >
                            {editingProductId === product.id ? 'Редактируется' : 'Редактировать'}
                          </button>
                          <button
                            type="button"
                            className={`seller-product-sale-btn ${onSale ? 'danger' : 'success'}`}
                            onClick={() => handleProductSaleStatusChange(product, !onSale)}
                            disabled={updating || saleActionInProgress}
                          >
                            {saleActionInProgress ? 'Сохраняем...' : onSale ? 'Снять' : 'Вернуть'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state seller-products-empty">
                  <h3>Товары не найдены</h3>
                  <p>Измените фильтр или строку поиска.</p>
                </div>
              )}
            </>
          )}
        </article>

        {(showCreateForm || editingProductId !== null) && (
          <article className="seller-card seller-products-side-card">
            <div className="seller-products-side-head">
              <h2>{editingProductId !== null ? 'Редактирование товара' : 'Создание товара'}</h2>
              {showCreateForm && (
                <button
                  type="button"
                  className="seller-secondary-button"
                  onClick={() => setShowCreateForm(false)}
                  disabled={creating}
                >
                  Скрыть форму
                </button>
              )}
            </div>

            {showCreateForm && (
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
                    ref={createProductNameInputRef}
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

                <div className="form-group">
                  <label htmlFor="new-product-photos">Фото товара</label>
                  <input
                    id="new-product-photos"
                    name="photos"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotosChange}
                  />
                  {selectedPhotos.length > 0 && (
                    <ol className="seller-photo-order-list">
                      {selectedPhotos.map((file, index) => (
                        <li key={`${file.name}-${file.size}-${index}`}>
                          {index + 1}. {file.name}
                        </li>
                      ))}
                    </ol>
                  )}
                  <small className="seller-form-hint">
                    Порядок файлов сохранится в `photo_urls` как "1", "2", "3"...
                  </small>
                </div>

                <button type="submit" className="auth-button" disabled={creating || loading || !seller}>
                  {creating ? 'Создаём...' : 'Создать товар'}
                </button>
              </form>
            )}

            {editingProductId !== null && (
              <div className="seller-edit-product-block seller-edit-product-block-standalone">
                <form className="seller-create-product-form" onSubmit={handleUpdateProduct}>
                  <div className="form-group">
                    <label htmlFor="edit-product-name">Название</label>
                    <input
                      id="edit-product-name"
                      name="name"
                      type="text"
                      maxLength={255}
                      value={editFormData.name}
                      onChange={handleEditInputChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="edit-product-description">Описание</label>
                    <textarea
                      id="edit-product-description"
                      name="description"
                      maxLength={255}
                      value={editFormData.description}
                      onChange={handleEditInputChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="edit-product-category">Категория</label>
                    <select
                      id="edit-product-category"
                      name="categoryId"
                      value={editFormData.categoryId}
                      onChange={handleEditInputChange}
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
                    </select>
                  </div>

                  <div className="seller-create-product-two-columns">
                    <div className="form-group">
                      <label htmlFor="edit-product-price">Цена (RUB)</label>
                      <input
                        id="edit-product-price"
                        name="price"
                        type="number"
                        min="1"
                        step="0.01"
                        value={editFormData.price}
                        onChange={handleEditInputChange}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="edit-product-quantity">Количество</label>
                      <input
                        id="edit-product-quantity"
                        name="quantity"
                        type="number"
                        min="0"
                        step="1"
                        value={editFormData.quantity}
                        onChange={handleEditInputChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="edit-product-photos">Фото товара</label>
                    <input
                      id="edit-product-photos"
                      name="photos"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleEditPhotosChange}
                    />
                    {selectedEditPhotos.length > 0 && (
                      <ol className="seller-photo-order-list">
                        {selectedEditPhotos.map((file, index) => (
                          <li key={`${file.name}-${file.size}-${index}`}>
                            {index + 1}. {file.name}
                          </li>
                        ))}
                      </ol>
                    )}
                    <small className="seller-form-hint">
                      Если выберете новые фото, они заменят текущие в том же порядке.
                    </small>
                  </div>

                  <div className="seller-edit-actions">
                    <button type="submit" className="auth-button" disabled={updating || loading || !seller}>
                      {updating ? 'Сохраняем...' : 'Сохранить изменения'}
                    </button>
                    <button
                      type="button"
                      className="seller-secondary-button"
                      onClick={cancelEditProduct}
                      disabled={updating}
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              </div>
            )}
          </article>
        )}
      </div>
    </section>
  );
};

export default SellerProductsPage;
