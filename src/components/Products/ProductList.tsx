// src/components/Products/ProductList.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import ProductCard from './ProductCard';
import { Product } from '../../types/product';
import { apiService } from '../../services/api';
import { CartApiItem } from '../../types/user';
import { getUserFromToken } from '../../utils/auth';

const ProductList: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartApiItem[]>([]);
  const [updatingProductIds, setUpdatingProductIds] = useState<number[]>([]);
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

  useEffect(() => {
    void fetchProducts();
    void loadCart();
  }, [fetchProducts, loadCart]);

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
