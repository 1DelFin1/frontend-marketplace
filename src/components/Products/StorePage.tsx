import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiService } from '../../services/api';
import { Product } from '../../types/product';
import { CartApiItem, Seller } from '../../types/user';
import { Category } from '../../types/category';
import ProductCard from './ProductCard';
import mockStorePhoto from '../../assets/mock-store-photo.svg';
import { getUserFromToken } from '../../utils/auth';

const StorePage: React.FC = () => {
  const { sellerId } = useParams();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [sellerOrdersCount, setSellerOrdersCount] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartApiItem[]>([]);
  const [updatingProductIds, setUpdatingProductIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCart = useCallback(async (forceRefresh = false) => {
    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      setCartItems([]);
      return;
    }

    try {
      const items = await apiService.getCartByUserId(tokenUser.id, forceRefresh);
      setCartItems(items);
    } catch {
      setCartItems([]);
    }
  }, []);

  useEffect(() => {
    const loadStore = async () => {
      if (!sellerId) {
        setError('Магазин не найден');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        setSellerOrdersCount(null);

        const [sellerData, allProducts, categories] = await Promise.all([
          apiService.getSellerById(sellerId),
          apiService.getProducts(),
          apiService.getCategories(),
        ]);

        const categoryNameById = new Map<number, string>(
          categories.map((category: Category) => [category.id, category.name])
        );

        const sellerProducts = allProducts
          .filter((product) => product.seller_id === sellerData.id && product.is_active !== false)
          .map((product) => ({
            ...product,
            category: product.category || (product.category_id ? categoryNameById.get(product.category_id) : undefined),
          }))
          .sort((a, b) => {
            const aInStock = (a.quantity || 0) > 0;
            const bInStock = (b.quantity || 0) > 0;
            return Number(bInStock) - Number(aInStock);
          });

        setSeller(sellerData);
        setSellerOrdersCount(typeof sellerData.orders_count === 'number' ? sellerData.orders_count : null);
        const actualOrdersCount = await apiService.getSellerOrdersCount(
          sellerData.id,
          sellerData.orders_count ?? null
        );
        if (typeof actualOrdersCount === 'number') {
          setSellerOrdersCount(actualOrdersCount);
        }
        setProducts(sellerProducts);
      } catch {
        setSellerOrdersCount(null);
        setError('Не удалось загрузить страницу магазина');
      } finally {
        setLoading(false);
      }
    };

    void loadStore();
    void loadCart();
  }, [sellerId, loadCart]);

  useEffect(() => {
    const handleCartUpdated = () => {
      void loadCart();
    };

    window.addEventListener('cart-updated', handleCartUpdated as EventListener);
    return () => {
      window.removeEventListener('cart-updated', handleCartUpdated as EventListener);
    };
  }, [loadCart]);

  const cartQuantityByProductId = useMemo(() => {
    const quantities: Record<number, number> = {};
    cartItems.forEach((item) => {
      quantities[item.product_id] = item.quantity;
    });
    return quantities;
  }, [cartItems]);

  const changeProductCartQuantity = useCallback(async (product: Product, nextQuantity: number) => {
    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      toast.error('Требуется авторизация');
      return;
    }

    const normalizedNextQuantity = Math.max(
      0,
      Math.min(Math.trunc(nextQuantity), Math.max(product.quantity, 0))
    );
    const currentQuantity = cartItems.find((item) => item.product_id === product.id)?.quantity ?? 0;

    if (normalizedNextQuantity === currentQuantity) {
      return;
    }

    setUpdatingProductIds((prev) => (
      prev.includes(product.id) ? prev : [...prev, product.id]
    ));

    try {
      const nextCartItems = cartItems
        .filter((item) => item.product_id !== product.id);

      if (normalizedNextQuantity > 0) {
        nextCartItems.push({
          product_id: product.id,
          quantity: normalizedNextQuantity,
        });
      }

      await apiService.setCartByUserId(tokenUser.id, nextCartItems);
      setCartItems(nextCartItems);
      window.dispatchEvent(new Event('cart-updated'));
    } catch {
      toast.error('Не удалось обновить корзину');
    } finally {
      setUpdatingProductIds((prev) => prev.filter((id) => id !== product.id));
    }
  }, [cartItems]);

  if (loading) {
    return <div className="loading">Загрузка магазина...</div>;
  }

  if (error || !seller) {
    return <div className="error">Ошибка: {error || 'Магазин не найден'}</div>;
  }

  const formattedSellerOrdersCount = sellerOrdersCount !== null ? sellerOrdersCount.toLocaleString('ru-RU') : '—';
  const sellerPhotoUrl = typeof seller.photo_url === 'string' && seller.photo_url.trim().length > 0
    ? seller.photo_url.trim()
    : mockStorePhoto;

  return (
    <section className="store-page">
      <Link to="/products" className="store-back-link">← Вернуться в каталог</Link>

      <article className="store-hero">
        <div className="store-hero-media">
          <img src={mockStorePhoto} alt={`Магазин ${seller.name}`} className="store-hero-image" />
        </div>
        <div className="store-hero-overlay" />
        <div className="store-hero-content">
          <div className="store-hero-seller">
            <div className="store-hero-seller-photo-wrap">
              <img
                src={sellerPhotoUrl}
                alt={`Фото продавца ${seller.name}`}
                className="store-hero-seller-photo"
                onError={(event) => {
                  const image = event.currentTarget;
                  if (image.src !== mockStorePhoto) {
                    image.src = mockStorePhoto;
                  }
                }}
              />
            </div>
            <div className="store-hero-seller-meta">
              <small className="store-hero-label">Магазин продавца</small>
              <h1>{seller.name}</h1>
            </div>
          </div>
          <div className="store-hero-stats">
            <div>
              <span>Рейтинг</span>
              <strong>{typeof seller.rating === 'number' ? seller.rating.toFixed(1) : '—'}</strong>
            </div>
            <div>
              <span>Заказов</span>
              <strong>{formattedSellerOrdersCount}</strong>
            </div>
            <div>
              <span>Товаров</span>
              <strong>{products.length}</strong>
            </div>
          </div>
        </div>
      </article>

      <section className="store-products-section">
        <div className="store-products-head">
          <h2>Товары магазина</h2>
          <span>{products.length} шт.</span>
        </div>

        {products.length > 0 ? (
          <div className="products-grid">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                cartQuantity={cartQuantityByProductId[product.id] ?? 0}
                cartUpdating={updatingProductIds.includes(product.id)}
                onChangeCartQuantity={changeProductCartQuantity}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>У этого магазина пока нет товаров</h3>
            <p>Загляните позже</p>
          </div>
        )}
      </section>
    </section>
  );
};

export default StorePage;
