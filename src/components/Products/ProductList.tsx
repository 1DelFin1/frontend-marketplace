// src/components/Products/ProductList.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import ProductCard from './ProductCard';
import { Product } from '../../types/product';
import { apiService } from '../../services/api';
import { CartApiItem, FavoriteApiItem } from '../../types/user';
import { getUserFromToken } from '../../utils/auth';

const ProductList: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartApiItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<FavoriteApiItem[]>([]);
  const [updatingProductIds, setUpdatingProductIds] = useState<number[]>([]);
  const [updatingFavoriteProductIds, setUpdatingFavoriteProductIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const productsData = await apiService.getProducts();
      const sortedProducts = productsData
        .filter((product) => product.is_active !== false)
        .sort((a, b) => {
          const aInStock = (a.quantity || 0) > 0;
          const bInStock = (b.quantity || 0) > 0;
          return Number(bInStock) - Number(aInStock);
        });

      setProducts(sortedProducts);
    } catch (err: any) {
      setError('Ошибка при загрузке товаров');
      toast.error('Не удалось загрузить товары');
      console.error('Error fetching products:', err);
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

  const loadFavorites = useCallback(async (forceRefresh = false) => {
    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      setFavoriteItems([]);
      return;
    }

    try {
      const items = await apiService.getFavoritesByUserId(tokenUser.id, forceRefresh);
      setFavoriteItems(items);
    } catch {
      setFavoriteItems([]);
    }
  }, []);

  useEffect(() => {
    void fetchProducts();
    void loadCart();
    void loadFavorites();
  }, [fetchProducts, loadCart, loadFavorites]);

  useEffect(() => {
    const handleCartUpdated = () => {
      void loadCart();
    };
    const handleFavoritesUpdated = () => {
      void loadFavorites();
    };

    window.addEventListener('cart-updated', handleCartUpdated as EventListener);
    window.addEventListener('favorites-updated', handleFavoritesUpdated as EventListener);
    return () => {
      window.removeEventListener('cart-updated', handleCartUpdated as EventListener);
      window.removeEventListener('favorites-updated', handleFavoritesUpdated as EventListener);
    };
  }, [loadCart, loadFavorites]);

  const cartQuantityByProductId = useMemo(() => {
    const quantities: Record<number, number> = {};
    cartItems.forEach((item) => {
      quantities[item.product_id] = item.quantity;
    });
    return quantities;
  }, [cartItems]);

  const favoriteProductIds = useMemo(
    () => new Set(favoriteItems.map((item) => item.product_id)),
    [favoriteItems]
  );

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

  const toggleProductFavorite = useCallback(async (product: Product) => {
    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      toast.error('Требуется авторизация');
      return;
    }

    if (updatingFavoriteProductIds.includes(product.id)) {
      return;
    }

    setUpdatingFavoriteProductIds((prev) => (
      prev.includes(product.id) ? prev : [...prev, product.id]
    ));

    try {
      const favorites = await apiService.getFavoritesByUserId(tokenUser.id, true);
      const isAlreadyFavorite = favorites.some((item) => item.product_id === product.id);
      const nextFavorites = isAlreadyFavorite
        ? favorites.filter((item) => item.product_id !== product.id)
        : [...favorites, { product_id: product.id, quantity: 1 }];

      await apiService.setFavoritesByUserId(tokenUser.id, nextFavorites);
      setFavoriteItems(nextFavorites);
      window.dispatchEvent(new Event('favorites-updated'));
      toast.success(isAlreadyFavorite ? 'Товар удален из избранного' : 'Товар добавлен в избранное');
    } catch {
      toast.error('Не удалось обновить избранное');
    } finally {
      setUpdatingFavoriteProductIds((prev) => prev.filter((id) => id !== product.id));
    }
  }, [updatingFavoriteProductIds]);

  if (loading) {
    return <div className="loading">Загрузка товаров...</div>;
  }

  if (error) {
    return <div className="error">Ошибка: {error}</div>;
  }

  return (
    <div className="product-list-page">
      <div className="products-grid">
        {products.map(product => (
          <ProductCard
            key={product.id}
            product={product}
            cartQuantity={cartQuantityByProductId[product.id] ?? 0}
            cartUpdating={updatingProductIds.includes(product.id)}
            onChangeCartQuantity={changeProductCartQuantity}
            isFavorite={favoriteProductIds.has(product.id)}
            favoriteUpdating={updatingFavoriteProductIds.includes(product.id)}
            onToggleFavorite={toggleProductFavorite}
          />
        ))}
      </div>

      {products.length === 0 && (
        <div className="empty-state">
          <h3>Товары не найдены</h3>
          <p>Попробуйте зайти позже</p>
        </div>
      )}
    </div>
  );
};

export default ProductList;
