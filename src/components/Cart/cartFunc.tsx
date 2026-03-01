import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { CartItem, Cart } from '../../types/user';

const priceFormatter = new Intl.NumberFormat('ru-RU');

const CartFunc: React.FC = () => {
  const [cart, setCart] = useState<Cart>({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [buyingItemId, setBuyingItemId] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);

  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = () => {
    const savedCart = localStorage.getItem('cart');

    if (!savedCart) {
      return;
    }

    try {
      const parsedCart: Cart = JSON.parse(savedCart);
      setCart(parsedCart);
      setSelectedItems(parsedCart.items.map((item) => item.product_id));
    } catch (error) {
      setCart({ items: [], total: 0 });
      setSelectedItems([]);
    }
  };

  const saveCart = (newCart: Cart) => {
    localStorage.setItem('cart', JSON.stringify(newCart));
    window.dispatchEvent(new Event('cart-updated'));
    setCart(newCart);
    setSelectedItems((previousSelected) =>
      previousSelected.filter((id) => newCart.items.some((item) => item.product_id === id))
    );
  };

  const calculateTotal = (items: CartItem[]): number => {
    return items.reduce((total, item) => {
      return total + (item.product?.price || 0) * item.quantity;
    }, 0);
  };

  const updateQuantity = (productId: number, quantity: number) => {
    const newItems = cart.items
      .map((item) => (item.product_id === productId ? { ...item, quantity } : item))
      .filter((item) => item.quantity > 0);

    const total = calculateTotal(newItems);
    saveCart({ items: newItems, total });
  };

  const removeFromCart = (productId: number) => {
    const newItems = cart.items.filter((item) => item.product_id !== productId);
    const total = calculateTotal(newItems);
    saveCart({ items: newItems, total });
    setSelectedItems((previousSelected) => previousSelected.filter((id) => id !== productId));
    toast.info('Товар удален из корзины');
  };

  const clearCart = () => {
    saveCart({ items: [], total: 0 });
    setSelectedItems([]);
    toast.info('Корзина очищена');
  };

  const toggleItemSelection = (productId: number) => {
    setSelectedItems((previousSelected) =>
      previousSelected.includes(productId)
        ? previousSelected.filter((id) => id !== productId)
        : [...previousSelected, productId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === cart.items.length) {
      setSelectedItems([]);
      return;
    }

    setSelectedItems(cart.items.map((item) => item.product_id));
  };

  const removeSelectedItems = () => {
    if (selectedItems.length === 0) {
      return;
    }

    const selectedSet = new Set(selectedItems);
    const newItems = cart.items.filter((item) => !selectedSet.has(item.product_id));
    const total = calculateTotal(newItems);
    saveCart({ items: newItems, total });
    toast.info('Выбранные товары удалены');
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
      const total = calculateTotal(remainingItems);
      saveCart({ items: remainingItems, total });
      toast.success('Покупка оформлена');
    } catch (error) {
      toast.error('Ошибка при покупке');
    } finally {
      setBuyingItemId(null);
    }
  };

  const checkout = async () => {
    if (selectedItems.length === 0) {
      toast.info('Выберите товары для оформления');
      return;
    }

    setLoading(true);

    try {
      // Здесь будет API call для оформления заказа
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const selectedSet = new Set(selectedItems);
      const remainingItems = cart.items.filter((item) => !selectedSet.has(item.product_id));
      const total = calculateTotal(remainingItems);
      saveCart({ items: remainingItems, total });
      toast.success('Заказ успешно оформлен!');
    } catch (error) {
      toast.error('Ошибка при оформлении заказа');
    } finally {
      setLoading(false);
    }
  };

  const selectedSet = new Set(selectedItems);
  const selectedCartItems = cart.items.filter((item) => selectedSet.has(item.product_id));
  const selectedTotal = calculateTotal(selectedCartItems);
  const selectedPositionsCount = selectedCartItems.length;
  const allSelected = cart.items.length > 0 && selectedItems.length === cart.items.length;

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
                onClick={removeSelectedItems}
                disabled={selectedItems.length === 0}
              >
                Удалить выбранные
              </button>
              <button type="button" className="cart-text-action" onClick={clearCart}>
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
                    {item.product?.image_url ? (
                      <img src={item.product.image_url} alt={item.product.name} />
                    ) : (
                      <span>Фото</span>
                    )}
                  </div>

                  <div className="cart-item-details">
                    <h3>{item.product?.name || 'Товар'}</h3>
                    <p className="cart-item-subtitle">Продавец: маркетплейс</p>
                    <p className={`cart-item-stock ${maxQuantity && maxQuantity > 0 ? 'in-stock' : 'out-stock'}`}>
                      {maxQuantity && maxQuantity > 0 ? `В наличии: ${maxQuantity}` : 'Нет в наличии'}
                    </p>

                    <div className="cart-item-actions">
                      <button
                        type="button"
                        className="cart-delete-icon-btn"
                        onClick={() => removeFromCart(item.product_id)}
                        aria-label="Удалить товар из корзины"
                      >
                        <svg viewBox="0 0 24 24" className="cart-delete-icon" aria-hidden="true">
                          <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Zm-1 12h12l1-14H5l1 14Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="cart-buy-action"
                        onClick={() => buySingleItem(item.product_id)}
                        disabled={buyingItemId !== null || !maxQuantity || maxQuantity <= 0}
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
                        onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                      >
                        -
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                        disabled={!canIncrease}
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
            disabled={loading || buyingItemId !== null || selectedItems.length === 0}
            className="checkout-btn"
          >
            {loading ? 'Оформление...' : 'Перейти к оформлению'}
          </button>
          <p className="cart-summary-hint">Доступны только выбранные товары.</p>
        </aside>
      </div>
    </section>
  );
};

export default CartFunc;
