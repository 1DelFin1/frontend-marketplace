import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiService } from '../../services/api';
import { getProductImageUrls, Product } from '../../types/product';
import { Seller } from '../../types/user';
import { getUserFromToken } from '../../utils/auth';
import mockStorePhoto from '../../assets/mock-store-photo.svg';

const BASE_PRODUCT_DATA_KEYS = [
  'name',
  'description',
  'price',
  'quantity',
  'category',
  'photo_urls',
  'image_url',
];

const extractPropertiesKeys = (properties: Product['properties']): string[] => {
  if (!properties) {
    return [];
  }

  if (typeof properties === 'string') {
    try {
      const parsed = JSON.parse(properties);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.keys(parsed as Record<string, unknown>);
      }
    } catch {
      return [];
    }

    return [];
  }

  if (typeof properties === 'object' && !Array.isArray(properties)) {
    return Object.keys(properties);
  }

  return [];
};

const ProductDetails: React.FC = () => {
  const { productId } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [sellerOrdersCount, setSellerOrdersCount] = useState<number | null>(null);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerError, setSellerError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteUpdating, setFavoriteUpdating] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  useEffect(() => {
    const loadProduct = async () => {
      if (!productId) {
        setError('Товар не найден');
        setLoading(false);
        return;
      }

      const numericProductId = Number(productId);
      if (Number.isNaN(numericProductId)) {
        setError('Некорректный идентификатор товара');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setSeller(null);
        setSellerOrdersCount(null);
        setSellerError('');
        const productData = await apiService.getProductById(numericProductId);
        setProduct(productData);

        if (!productData.seller_id) {
          setSellerError('Для товара не указан продавец');
          return;
        }

        setSellerLoading(true);
        try {
          const sellerData = await apiService.getSellerById(productData.seller_id);
          setSeller(sellerData);
          setSellerOrdersCount(typeof sellerData.orders_count === 'number' ? sellerData.orders_count : null);
          const actualOrdersCount = await apiService.getSellerOrdersCount(
            sellerData.id,
            sellerData.orders_count ?? null
          );
          if (typeof actualOrdersCount === 'number') {
            setSellerOrdersCount(actualOrdersCount);
          }
        } catch {
          setSellerOrdersCount(null);
          setSellerError('Не удалось загрузить данные продавца');
        } finally {
          setSellerLoading(false);
        }
      } catch (err) {
        console.error('Error fetching product:', err);
        setError('Не удалось загрузить товар');
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  }, [productId]);

  const productDataKeys = useMemo(() => {
    if (!product) {
      return [];
    }

    const propertyKeys = extractPropertiesKeys(product.properties);
    return Array.from(new Set([...BASE_PRODUCT_DATA_KEYS, ...propertyKeys]));
  }, [product]);

  const addToCart = async () => {
    if (!product) {
      return;
    }

    if (product.quantity === 0) {
      toast.info('Товар временно недоступен');
      return;
    }

    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      toast.error('Требуется авторизация');
      return;
    }

    try {
      const cartItems = await apiService.getCartByUserId(tokenUser.id);
      const existingItem = cartItems.find((item) => item.product_id === product.id);
      const updatedItems = existingItem
        ? cartItems.map((item) => (
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ))
        : [...cartItems, { product_id: product.id, quantity: 1 }];

      await apiService.setCartByUserId(tokenUser.id, updatedItems);
      window.dispatchEvent(new Event('cart-updated'));
      toast.success('Товар добавлен в корзину!');
    } catch {
      toast.error('Не удалось добавить товар в корзину');
    }
  };

  useEffect(() => {
    const loadFavoriteStatus = async () => {
      if (!product?.id) {
        setIsFavorite(false);
        return;
      }

      const tokenUser = getUserFromToken();
      if (!tokenUser?.id) {
        setIsFavorite(false);
        return;
      }

      try {
        const favorites = await apiService.getFavoritesByUserId(tokenUser.id);
        setIsFavorite(favorites.some((item) => item.product_id === product.id));
      } catch {
        setIsFavorite(false);
      }
    };

    void loadFavoriteStatus();
  }, [product?.id]);

  const toggleFavorite = async () => {
    if (!product?.id || favoriteUpdating) {
      return;
    }

    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      toast.error('Требуется авторизация');
      return;
    }

    setFavoriteUpdating(true);
    try {
      const favorites = await apiService.getFavoritesByUserId(tokenUser.id, true);
      const isAlreadyFavorite = favorites.some((item) => item.product_id === product.id);
      const nextFavorites = isAlreadyFavorite
        ? favorites.filter((item) => item.product_id !== product.id)
        : [...favorites, { product_id: product.id, quantity: 1 }];

      await apiService.setFavoritesByUserId(tokenUser.id, nextFavorites);
      setIsFavorite(!isAlreadyFavorite);
      window.dispatchEvent(new Event('favorites-updated'));
      toast.success(isAlreadyFavorite ? 'Товар удален из избранного' : 'Товар добавлен в избранное');
    } catch {
      toast.error('Не удалось обновить избранное');
    } finally {
      setFavoriteUpdating(false);
    }
  };

  const formattedSellerRating = useMemo(() => {
    if (!seller || typeof seller.rating !== 'number') {
      return '—';
    }

    return seller.rating.toFixed(1);
  }, [seller]);

  const formattedSellerOrdersCount = useMemo(() => {
    if (sellerOrdersCount === null) {
      return '—';
    }

    return sellerOrdersCount.toLocaleString('ru-RU');
  }, [sellerOrdersCount]);

  const sellerPhotoUrl = useMemo(() => {
    if (!seller || typeof seller.photo_url !== 'string') {
      return mockStorePhoto;
    }

    const trimmedPhotoUrl = seller.photo_url.trim();
    return trimmedPhotoUrl.length > 0 ? trimmedPhotoUrl : mockStorePhoto;
  }, [seller]);

  const productImageUrls = useMemo(() => getProductImageUrls(product ?? undefined), [product]);
  const selectedProductImageUrl = productImageUrls[selectedImageIndex] || productImageUrls[0];

  useEffect(() => {
    setSelectedImageIndex(0);
  }, [product?.id, productImageUrls.length]);

  if (loading) {
    return <div className="loading">Загрузка товара...</div>;
  }

  if (error || !product) {
    return <div className="error">Ошибка: {error || 'Товар не найден'}</div>;
  }

  return (
    <div className="product-detail-page">
      <div className="product-detail-breadcrumbs">
        <Link to="/products">Каталог</Link>
        <span>/</span>
        <span>{product.name}</span>
      </div>

      <section className="product-detail-main">
        <div className="product-detail-gallery">
          {selectedProductImageUrl ? (
            <>
              <img src={selectedProductImageUrl} alt={product.name} className="product-gallery-main-image" />
              {productImageUrls.length > 1 && (
                <div className="product-gallery-thumbnails" aria-label="Все фото товара">
                  {productImageUrls.map((imageUrl, index) => (
                    <button
                      key={`${imageUrl}-${index}`}
                      type="button"
                      className={`product-gallery-thumbnail-button ${index === selectedImageIndex ? 'active' : ''}`}
                      onClick={() => setSelectedImageIndex(index)}
                      aria-label={`Фото ${index + 1}`}
                      aria-pressed={index === selectedImageIndex}
                    >
                      <img
                        src={imageUrl}
                        alt={`${product.name} — фото ${index + 1}`}
                        className="product-gallery-thumbnail-image"
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="product-image-placeholder">Нет изображения</div>
          )}
        </div>

        <div className="product-detail-content">
          <h1>{product.name}</h1>

          <div className={`product-quantity ${product.quantity > 0 ? 'in-stock' : 'out-of-stock'}`}>
            {product.quantity > 0 ? `В наличии: ${product.quantity}` : 'Нет в наличии'}
          </div>

          {product.category && (
            <div className="product-detail-category">Категория: {product.category}</div>
          )}

          <p className="product-detail-description">
            {product.description || 'Описание товара пока не добавлено.'}
          </p>

          <div className="product-detail-properties">
            <h2>Поля product_data</h2>
            <div className="product-detail-property-list">
              {productDataKeys.map((key) => (
                <code key={key} className="product-detail-property-item">
                  {`product_data["${key}"]`}
                </code>
              ))}
            </div>
          </div>
        </div>

        <div className="product-side-column">
          <aside className="product-buy-panel">
            <div className="product-buy-price">{product.price} ₽</div>
            <div className="product-buy-actions">
              <button
                className="product-buy-button"
                onClick={addToCart}
                disabled={product.quantity === 0}
              >
                {product.quantity > 0 ? 'Добавить в корзину' : 'Нет в наличии'}
              </button>
              <button
                type="button"
                className={`product-favorite-button ${isFavorite ? 'active' : ''}`}
                onClick={() => {
                  void toggleFavorite();
                }}
                aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                aria-pressed={isFavorite}
                disabled={favoriteUpdating}
              >
                <svg viewBox="0 0 24 24" className="product-favorite-icon" aria-hidden="true">
                  <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A5.96 5.96 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" />
                </svg>
              </button>
            </div>
          </aside>

          <aside className="seller-panel">
            <h3>Продавец</h3>
            {sellerLoading && (
              <div className="seller-panel-state">Загрузка данных продавца...</div>
            )}

            {!sellerLoading && seller && (
              <>
                <div className="seller-head">
                  <div className="seller-store-photo-wrap">
                    <img
                      src={sellerPhotoUrl}
                      alt={`Фото магазина ${seller.name}`}
                      className="seller-store-photo"
                      onError={(event) => {
                        const image = event.currentTarget;
                        if (image.src !== mockStorePhoto) {
                          image.src = mockStorePhoto;
                        }
                      }}
                    />
                  </div>
                  <div className="seller-name">{seller.name}</div>
                </div>
                <div className="seller-meta">
                  <div className="seller-meta-item">
                    <strong>{formattedSellerRating}</strong>
                    <span>Рейтинг</span>
                  </div>
                  <div className="seller-meta-item">
                    <strong>{formattedSellerOrdersCount}</strong>
                    <span>Заказов</span>
                  </div>
                </div>
                <Link to={`/store/${seller.id}`} className="seller-store-button">
                  Перейти в магазин
                </Link>
              </>
            )}

            {!sellerLoading && !seller && sellerError && (
              <div className="seller-panel-state seller-panel-state-error">
                {sellerError}
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
};

export default ProductDetails;
