import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import ProductCard from '../Products/ProductCard';
import { apiService } from '../../services/api';
import { Product } from '../../types/product';
import { CartApiItem, FavoriteApiItem } from '../../types/user';
import { getUserFromToken } from '../../utils/auth';

const FavoritesPage: React.FC = () => {
  const [favoriteItems, setFavoriteItems] = useState<FavoriteApiItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingProductIds, setUpdatingProductIds] = useState<number[]>([]);
  const [cartUpdatingProductIds, setCartUpdatingProductIds] = useState<number[]>([]);

  const loadFavorites = useCallback(async (forceRefresh = false) => {
    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      setFavoriteItems([]);
      setProducts([]);
      setError('Требуется авторизация');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const favorites = await apiService.getFavoritesByUserId(tokenUser.id, forceRefresh);
      setFavoriteItems(favorites);

      const uniqueProductIds = Array.from(
        new Set(favorites.map((item) => item.product_id)),
      );

      if (uniqueProductIds.length === 0) {
        setProducts([]);
        return;
      }

      const allProducts = await apiService.getProducts();
      const productById = new Map<number, Product>(
        allProducts.map((product) => [product.id, product]),
      );

      const resolvedProducts = uniqueProductIds
        .map((productId) => productById.get(productId) ?? null)
        .filter((product): product is Product => product !== null)
        .filter((product) => product.is_active !== false);

      setProducts(resolvedProducts);
    } catch {
      setError('Не удалось загрузить избранные товары');
      toast.error('Не удалось загрузить избранное');
      setFavoriteItems([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
    void loadFavorites();
    void loadCart();
  }, [loadFavorites, loadCart]);

  useEffect(() => {
    const handleFavoritesUpdated = () => {
      void loadFavorites();
    };

    window.addEventListener('favorites-updated', handleFavoritesUpdated as EventListener);
    return () => {
      window.removeEventListener('favorites-updated', handleFavoritesUpdated as EventListener);
    };
  }, [loadFavorites]);

  useEffect(() => {
    const handleCartUpdated = () => {
      void loadCart();
    };

    window.addEventListener('cart-updated', handleCartUpdated as EventListener);
    return () => {
      window.removeEventListener('cart-updated', handleCartUpdated as EventListener);
    };
  }, [loadCart]);

  const removeFromFavorites = useCallback(async (productId: number) => {
    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      toast.error('Требуется авторизация');
      return;
    }

    setUpdatingProductIds((prev) => (
      prev.includes(productId) ? prev : [...prev, productId]
    ));

    try {
      const nextFavorites = favoriteItems.filter((item) => item.product_id !== productId);
      await apiService.setFavoritesByUserId(tokenUser.id, nextFavorites);
      setFavoriteItems(nextFavorites);
      setProducts((prev) => prev.filter((product) => product.id !== productId));
      window.dispatchEvent(new Event('favorites-updated'));
      toast.success('Товар удален из избранного');
    } catch {
      toast.error('Не удалось обновить избранное');
    } finally {
      setUpdatingProductIds((prev) => prev.filter((id) => id !== productId));
    }
  }, [favoriteItems]);

  const favoriteProductIds = useMemo(() => new Set(favoriteItems.map((item) => item.product_id)), [favoriteItems]);
  const displayedProducts = useMemo(
    () => products.filter((product) => favoriteProductIds.has(product.id)),
    [products, favoriteProductIds],
  );

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

    setCartUpdatingProductIds((prev) => (
      prev.includes(product.id) ? prev : [...prev, product.id]
    ));

    try {
      const nextCartItems = cartItems.filter((item) => item.product_id !== product.id);

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
      setCartUpdatingProductIds((prev) => prev.filter((id) => id !== product.id));
    }
  }, [cartItems]);

  if (loading) {
    return <div className="loading">Загрузка избранного...</div>;
  }

  if (error) {
    return <div className="error">Ошибка: {error}</div>;
  }

  if (displayedProducts.length === 0) {
    return (
      <section className="favorites-page">
        <div className="favorites-empty-state">
          <h2>Избранное пока пусто</h2>
          <p>Добавляйте товары в избранное на странице товара.</p>
          <Link to="/products" className="favorites-empty-link">
            Перейти в каталог
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="favorites-page">
      <div className="favorites-head">
        <h2>Избранные товары</h2>
        <span>{displayedProducts.length} шт.</span>
      </div>

      <div className="products-grid">
        {displayedProducts.map((product) => (
          <div key={product.id} className="favorite-product-wrap">
            <ProductCard
              product={product}
              cartQuantity={cartQuantityByProductId[product.id] ?? 0}
              cartUpdating={cartUpdatingProductIds.includes(product.id)}
              onChangeCartQuantity={changeProductCartQuantity}
            />
            <button
              type="button"
              className="favorite-remove-btn"
              onClick={() => {
                void removeFromFavorites(product.id);
              }}
              disabled={updatingProductIds.includes(product.id)}
            >
              {updatingProductIds.includes(product.id) ? 'Удаляем...' : 'Убрать из избранного'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

export default FavoritesPage;
