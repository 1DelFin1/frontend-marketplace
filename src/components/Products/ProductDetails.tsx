import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiService } from '../../services/api';
import { Product } from '../../types/product';
import { CartItem } from '../../types/user';

const BASE_PRODUCT_DATA_KEYS = [
  'name',
  'description',
  'price',
  'quantity',
  'category',
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);

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
        const productData = await apiService.getProductById(numericProductId);
        setProduct(productData);
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

  const addToCart = () => {
    if (!product) {
      return;
    }

    if (product.quantity === 0) {
      toast.info('Товар временно недоступен');
      return;
    }

    const savedCart = localStorage.getItem('cart');
    const cart: { items: CartItem[]; total: number } = savedCart
      ? JSON.parse(savedCart)
      : { items: [], total: 0 };

    const existingItem = cart.items.find((item) => item.product_id === product.id);

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.items.push({
        product_id: product.id,
        quantity: 1,
        product,
      });
    }

    cart.total = cart.items.reduce((total, item) => {
      return total + (item.product?.price || 0) * item.quantity;
    }, 0);

    localStorage.setItem('cart', JSON.stringify(cart));
    window.dispatchEvent(new Event('cart-updated'));
    toast.success('Товар добавлен в корзину!');
  };

  const toggleFavorite = () => {
    setIsFavorite((prev) => !prev);
  };

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
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} />
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
                onClick={toggleFavorite}
                aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                aria-pressed={isFavorite}
              >
                <svg viewBox="0 0 24 24" className="product-favorite-icon" aria-hidden="true">
                  <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A5.96 5.96 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" />
                </svg>
              </button>
            </div>
          </aside>

          <aside className="seller-panel">
            <h3>Продавец</h3>
            <div className="seller-name">ТЕСТОВЫЙ ПРОДАВЕЦ</div>
            <div className="seller-meta">
              <span>Рейтинг: 4.8</span>
              <span>Заказов: 120К</span>
            </div>
            <button type="button" className="seller-store-button">
              о магазине
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
};

export default ProductDetails;
