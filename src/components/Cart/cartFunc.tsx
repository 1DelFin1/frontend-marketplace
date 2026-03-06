import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getPrimaryProductImageUrl } from '../../types/product';
import { CartApiItem, CartItem, Cart } from '../../types/user';
import { apiService } from '../../services/api';
import { getUserFromToken } from '../../utils/auth';

const priceFormatter = new Intl.NumberFormat('ru-RU');

const CartFunc: React.FC = () => {
  const navigate = useNavigate();
  const [cart, setCart] = useState<Cart>({ items: [], total: 0 });
  const [cartLoading, setCartLoading] = useState(true);
  const [syncingCart, setSyncingCart] = useState(false);
  const [buyingItemId, setBuyingItemId] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);

  const calculateTotal = useCallback((items: CartItem[]): number => {
    return items.reduce((total, item) => {
      return total + (item.product?.price || 0) * item.quantity;
    }, 0);
  }, []);

  const buildCart = useCallback((items: CartItem[]): Cart => {
    return {
      items,
      total: calculateTotal(items),
    };
  }, [calculateTotal]);

  const toApiItems = (items: CartItem[]): CartApiItem[] => {
    return items
      .filter((item) => item.quantity > 0)
      .map((item) => ({
        product_id: item.product_id,
        quantity: Math.trunc(item.quantity),
      }));
  };

  const enrichCartItems = useCallback(async (items: CartApiItem[]): Promise<CartItem[]> => {
    const enrichedItems = await Promise.all(items.map(async (item) => {
      try {
        const product = await apiService.getProductById(item.product_id);
        return {
          ...item,
          product,
        } satisfies CartItem;
      } catch {
        return {
          ...item,
        } satisfies CartItem;
      }
    }));

    return enrichedItems;
  }, []);

  const loadCart = useCallback(async () => {
    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      setCart({ items: [], total: 0 });
      setSelectedItems([]);
      setCartLoading(false);
      return;
    }

    setCartLoading(true);
    try {
      const apiItems = await apiService.getCartByUserId(tokenUser.id);
      const enrichedItems = await enrichCartItems(apiItems);
      const nextCart = buildCart(enrichedItems);
      setCart(nextCart);
      setSelectedItems(enrichedItems.map((item) => item.product_id));
    } catch {
      setCart({ items: [], total: 0 });
      setSelectedItems([]);
      toast.error('Не удалось загрузить корзину');
    } finally {
      setCartLoading(false);
    }
  }, [buildCart, enrichCartItems]);

  useEffect(() => {
    void loadCart();
  }, [loadCart]);

  const persistCartItems = async (items: CartItem[]): Promise<boolean> => {
    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      toast.error('Требуется авторизация');
      return false;
    }

    setSyncingCart(true);
    try {
      await apiService.setCartByUserId(tokenUser.id, toApiItems(items));
      window.dispatchEvent(new Event('cart-updated'));
      return true;
    } catch {
      toast.error('Не удалось обновить корзину');
      return false;
    } finally {
      setSyncingCart(false);
    }
  };

  const applyCartUpdate = async (newItems: CartItem[]): Promise<boolean> => {
    const normalizedItems = newItems
      .map((item) => ({ ...item, quantity: Math.trunc(item.quantity) }))
      .filter((item) => item.quantity > 0);

    const success = await persistCartItems(normalizedItems);
    if (!success) {
      await loadCart();
      return false;
    }

    const nextCart = buildCart(normalizedItems);
    setCart(nextCart);
    setSelectedItems((previousSelected) => (
      previousSelected.filter((id) => normalizedItems.some((item) => item.product_id === id))
    ));

    return true;
  };

  const updateQuantity = async (productId: number, quantity: number) => {
    const newItems = cart.items
      .map((item) => (item.product_id === productId ? { ...item, quantity } : item))
      .filter((item) => item.quantity > 0);

    await applyCartUpdate(newItems);
  };

  const removeFromCart = async (productId: number) => {
    const newItems = cart.items.filter((item) => item.product_id !== productId);
    const success = await applyCartUpdate(newItems);
    if (success) {
      setSelectedItems((previousSelected) => previousSelected.filter((id) => id !== productId));
      toast.info('Товар удален из корзины');
    }
  };

  const clearCart = async () => {
    const success = await applyCartUpdate([]);
    if (success) {
      setSelectedItems([]);
      toast.info('Корзина очищена');
    }
  };

  const toggleItemSelection = (productId: number) => {
    setSelectedItems((previousSelected) => (
      previousSelected.includes(productId)
        ? previousSelected.filter((id) => id !== productId)
        : [...previousSelected, productId]
    ));
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === cart.items.length) {
      setSelectedItems([]);
      return;
    }

    setSelectedItems(cart.items.map((item) => item.product_id));
  };

  const removeSelectedItems = async () => {
    if (selectedItems.length === 0) {
      return;
    }

    const selectedSet = new Set(selectedItems);
    const newItems = cart.items.filter((item) => !selectedSet.has(item.product_id));
    const success = await applyCartUpdate(newItems);
    if (success) {
      toast.info('Выбранные товары удалены');
    }
  };

  const buySingleItem = async (productId: number) => {
    const itemToBuy = cart.items.find((item) => item.product_id === productId);

    if (!itemToBuy) {
      return;
    }

    const availableQuantity = itemToBuy.product?.quantity || 0;
    if (availableQuantity <= 0) {
      toast.info('Товар временно недоступен');
      return;
    }

    setBuyingItemId(productId);

    try {
      // Здесь будет API call для покупки одного товара
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const remainingItems = cart.items.filter((item) => item.product_id !== productId);
      const success = await applyCartUpdate(remainingItems);
      if (success) {
        toast.success('Покупка оформлена');
      }
    } catch {
      toast.error('Ошибка при покупке');
    } finally {
      setBuyingItemId(null);
    }
  };

  const checkout = () => {
    if (selectedItems.length === 0) {
      toast.info('Выберите товары для оформления');
      return;
    }

    navigate('/checkout', {
      state: {
        selectedProductIds: selectedItems,
      },
    });
  };

  const selectedSet = new Set(selectedItems);
  const selectedCartItems = cart.items.filter((item) => selectedSet.has(item.product_id));
  const selectedTotal = calculateTotal(selectedCartItems);
  const selectedPositionsCount = selectedCartItems.length;
  const allSelected = cart.items.length > 0 && selectedItems.length === cart.items.length;
  const isBusy = syncingCart || buyingItemId !== null;

  if (cartLoading) {
    return <div className="loading">Загрузка корзины...</div>;
  }

  if (cart.items.length === 0) {
    return (
      <section className="cart-page">
        <div className="cart-empty-state">
          <h2>Корзина пуста</h2>
          <p>Добавьте товары из каталога, чтобы оформить заказ.</p>
          <Link to="/products" className="cart-empty-link">
            Перейти к покупкам
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="cart-page">
      <div className="cart-page-head">
        <h1>Корзина</h1>
        <span>{cart.items.length} поз.</span>
      </div>

      <div className="cart-layout">
        <div className="cart-main-column">
          <div className="cart-selection-toolbar">
            <label className="cart-checkbox">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              <span>Выбрать все</span>
            </label>

            <div className="cart-selection-actions">
              <button
                type="button"
                className="cart-text-action"
                onClick={() => { void removeSelectedItems(); }}
                disabled={selectedItems.length === 0 || isBusy}
              >
                Удалить выбранные
              </button>
              <button type="button" className="cart-text-action" onClick={() => { void clearCart(); }} disabled={isBusy}>
                Очистить корзину
              </button>
            </div>
          </div>

          <div className="cart-items-list">
            {cart.items.map((item) => {
              const isSelected = selectedSet.has(item.product_id);
              const maxQuantity = item.product?.quantity;
              const unitPrice = item.product?.price || 0;
              const itemTotal = unitPrice * item.quantity;
              const canIncrease = typeof maxQuantity !== 'number' || item.quantity < maxQuantity;
              const productImageUrl = getPrimaryProductImageUrl(item.product);

              return (
                <article key={item.product_id} className={`cart-item-card ${isSelected ? 'selected' : ''}`}>
                  <label className="cart-checkbox cart-item-check">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleItemSelection(item.product_id)}
                    />
                  </label>

                  <div className="cart-item-image">
                    {productImageUrl ? (
                      <img src={productImageUrl} alt={item.product?.name || 'Товар'} />
                    ) : (
                      <span>Фото</span>
                    )}
                  </div>

                  <div className="cart-item-details">
                    <h3>{item.product?.name || `Товар #${item.product_id}`}</h3>
                    <p className="cart-item-subtitle">Продавец: маркетплейс</p>
                    <p className={`cart-item-stock ${maxQuantity && maxQuantity > 0 ? 'in-stock' : 'out-stock'}`}>
                      {maxQuantity && maxQuantity > 0 ? `В наличии: ${maxQuantity}` : 'Нет в наличии'}
                    </p>

                    <div className="cart-item-actions">
                      <button
                        type="button"
                        className="cart-delete-icon-btn"
                        onClick={() => { void removeFromCart(item.product_id); }}
                        aria-label="Удалить товар из корзины"
                        disabled={isBusy}
                      >
                        <svg viewBox="0 0 24 24" className="cart-delete-icon" aria-hidden="true">
                          <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Zm-1 12h12l1-14H5l1 14Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="cart-buy-action"
                        onClick={() => { void buySingleItem(item.product_id); }}
                        disabled={isBusy || !maxQuantity || maxQuantity <= 0}
                      >
                        {buyingItemId === item.product_id ? 'Покупка...' : 'Купить'}
                      </button>
                    </div>
                  </div>

                  <div className="cart-item-pricing">
                    <div className="cart-item-total-price">{priceFormatter.format(itemTotal)} ₽</div>
                    <div className="cart-item-unit-price">{priceFormatter.format(unitPrice)} ₽ за шт.</div>

                    <div className="quantity-controls">
                      <button
                        type="button"
                        onClick={() => { void updateQuantity(item.product_id, item.quantity - 1); }}
                        disabled={item.quantity <= 1 || isBusy}
                      >
                        -
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => { void updateQuantity(item.product_id, item.quantity + 1); }}
                        disabled={!canIncrease || isBusy}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="cart-summary-panel">
          <h2>Ваш заказ</h2>
          <div className="cart-summary-line">
            <span>Товары ({selectedPositionsCount})</span>
            <strong>{priceFormatter.format(selectedTotal)} ₽</strong>
          </div>
          <div className="cart-summary-line">
            <span>Доставка</span>
            <span>бесплатно</span>
          </div>
          <div className="cart-summary-total">
            <span>К оплате</span>
            <strong>{priceFormatter.format(selectedTotal)} ₽</strong>
          </div>

          <button
            type="button"
            onClick={checkout}
            disabled={isBusy || selectedItems.length === 0}
            className="checkout-btn"
          >
            Перейти к оформлению
          </button>
          <p className="cart-summary-hint">Доступны только выбранные товары.</p>
        </aside>
      </div>
    </section>
  );
};

export default CartFunc;
