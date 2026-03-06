import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiService } from '../../services/api';
import { getPrimaryProductImageUrl } from '../../types/product';
import { CartApiItem, CartItem } from '../../types/user';
import { getUserFromToken } from '../../utils/auth';

type CheckoutPaymentMethod = 'card' | 'sbp' | 'cash';

interface CheckoutLocationState {
  selectedProductIds?: number[];
}

const priceFormatter = new Intl.NumberFormat('ru-RU');
const ORDER_STATUS_WAIT_ATTEMPTS = 30;
const ORDER_STATUS_WAIT_DELAY_MS = 500;
const PAID_OR_LATER_STATUSES = new Set(['paid', 'preparing', 'shipping', 'delivered', 'completed']);
const FAILED_STATUSES = new Set(['reservation_failed', 'payment_failed', 'cancelled', 'refunded']);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [cartLoading, setCartLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>('card');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);

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

  const loadCheckoutData = useCallback(async () => {
    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      navigate('/login', { replace: true });
      return;
    }

    const state = location.state as CheckoutLocationState | null;
    const selectedFromState = Array.isArray(state?.selectedProductIds)
      ? Array.from(new Set((state?.selectedProductIds ?? [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
      ))
      : [];

    setCartLoading(true);
    try {
      const apiItems = await apiService.getCartByUserId(tokenUser.id);
      const enrichedItems = await enrichCartItems(apiItems);

      if (enrichedItems.length === 0) {
        toast.info('В корзине нет товаров для оформления');
        navigate('/cart', { replace: true });
        return;
      }

      const cartIds = new Set(enrichedItems.map((item) => item.product_id));
      const effectiveSelectedIds = selectedFromState.length > 0
        ? selectedFromState.filter((id) => cartIds.has(id))
        : enrichedItems.map((item) => item.product_id);

      if (effectiveSelectedIds.length === 0) {
        toast.info('Выберите товары в корзине для оформления');
        navigate('/cart', { replace: true });
        return;
      }

      setCartItems(enrichedItems);
      setSelectedProductIds(effectiveSelectedIds);
    } catch {
      toast.error('Не удалось загрузить данные для оплаты');
      navigate('/cart', { replace: true });
    } finally {
      setCartLoading(false);
    }
  }, [enrichCartItems, location.state, navigate]);

  useEffect(() => {
    void loadCheckoutData();
  }, [loadCheckoutData]);

  const selectedSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);
  const selectedItems = useMemo(
    () => cartItems.filter((item) => selectedSet.has(item.product_id)),
    [cartItems, selectedSet]
  );

  const itemsTotal = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + (item.product?.price || 0) * item.quantity, 0);
  }, [selectedItems]);

  const deliveryPrice = 0;
  const totalToPay = itemsTotal + deliveryPrice;

  const handlePay = async () => {
    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      toast.error('Требуется авторизация');
      return;
    }

    if (selectedItems.length === 0) {
      toast.info('Нет выбранных товаров для оплаты');
      return;
    }

    setSubmitting(true);
    try {
      const createOrderResponse = await apiService.createOrder({
        user_id: tokenUser.id,
        order_items: selectedItems.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        })),
      });
      const orderId = createOrderResponse.order_id;

      let reachedReservableStatus = false;
      let currentStatus: string | null = null;

      for (let attempt = 0; attempt < ORDER_STATUS_WAIT_ATTEMPTS; attempt += 1) {
        currentStatus = await apiService.getOrderStatusById(orderId);

        if (currentStatus === 'reserved' || (currentStatus !== null && PAID_OR_LATER_STATUSES.has(currentStatus))) {
          reachedReservableStatus = true;
          break;
        }

        if (currentStatus !== null && FAILED_STATUSES.has(currentStatus)) {
          throw new Error(`Order failed with status ${currentStatus}`);
        }

        await delay(ORDER_STATUS_WAIT_DELAY_MS);
      }

      if (!reachedReservableStatus || currentStatus === null) {
        throw new Error('Order reservation timeout');
      }

      if (currentStatus === 'reserved') {
        try {
          await apiService.confirmOrder(orderId);
          currentStatus = await apiService.getOrderStatusById(orderId);
        } catch {
          const statusAfterConfirm = await apiService.getOrderStatusById(orderId);
          if (!(statusAfterConfirm && PAID_OR_LATER_STATUSES.has(statusAfterConfirm))) {
            throw new Error('Order payment failed');
          }
          currentStatus = statusAfterConfirm;
        }
      }

      if (!(currentStatus && PAID_OR_LATER_STATUSES.has(currentStatus))) {
        throw new Error(`Unexpected order status ${currentStatus}`);
      }

      const remainingCartItems = cartItems
        .filter((item) => !selectedSet.has(item.product_id))
        .map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        }));

      await apiService.setCartByUserId(tokenUser.id, remainingCartItems);
      window.dispatchEvent(new Event('cart-updated'));
      window.dispatchEvent(new Event('orders-updated'));

      toast.success('Заказ успешно оформлен');
      navigate('/orders');
    } catch {
      toast.error('Не удалось оформить заказ');
    } finally {
      setSubmitting(false);
    }
  };

  if (cartLoading) {
    return <div className="loading">Загрузка страницы оплаты...</div>;
  }

  if (selectedItems.length === 0) {
    return (
      <section className="checkout-page">
        <div className="checkout-empty">
          <h2>Нет товаров для оформления</h2>
          <p>Вернитесь в корзину и выберите товары для заказа.</p>
          <Link to="/cart" className="checkout-back-button">Вернуться в корзину</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="checkout-page">
      <Link to="/cart" className="checkout-back-link">Вернуться в корзину</Link>
      <h1>Оформление заказа</h1>

      <div className="checkout-layout">
        <div className="checkout-main-column">
          <article className="checkout-card">
            <h2>Способ оплаты</h2>
            <div className="checkout-payment-methods">
              <button
                type="button"
                className={`checkout-payment-method ${paymentMethod === 'card' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('card')}
              >
                Банковская карта
              </button>
              <button
                type="button"
                className={`checkout-payment-method ${paymentMethod === 'sbp' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('sbp')}
              >
                СБП
              </button>
              <button
                type="button"
                className={`checkout-payment-method ${paymentMethod === 'cash' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('cash')}
              >
                Оплата при получении
              </button>
            </div>
          </article>

          <article className="checkout-card">
            <h2>Способ получения</h2>
            <div className="checkout-delivery-line">
              <strong>Пункт выдачи</strong>
              <span>ул. Колмогорова, 73к3</span>
            </div>
            <div className="checkout-delivery-line">
              <strong>Доставка</strong>
              <span>Завтра, бесплатно</span>
            </div>
          </article>

          <article className="checkout-card">
            <h2>Товары в заказе</h2>
            <div className="checkout-items-list">
              {selectedItems.map((item) => {
                const itemPrice = item.product?.price || 0;
                const itemTotal = itemPrice * item.quantity;
                const imageUrl = getPrimaryProductImageUrl(item.product);

                return (
                  <div key={item.product_id} className="checkout-item-row">
                    <div className="checkout-item-image">
                      {imageUrl ? (
                        <img src={imageUrl} alt={item.product?.name || `Товар #${item.product_id}`} />
                      ) : (
                        <span>Фото</span>
                      )}
                    </div>
                    <div className="checkout-item-info">
                      <strong>{item.product?.name || `Товар #${item.product_id}`}</strong>
                      <span>{item.quantity} шт. × {priceFormatter.format(itemPrice)} ₽</span>
                    </div>
                    <div className="checkout-item-total">{priceFormatter.format(itemTotal)} ₽</div>
                  </div>
                );
              })}
            </div>
          </article>
        </div>

        <aside className="checkout-side-column">
          <article className="checkout-side-card">
            <button
              type="button"
              className="checkout-pay-button"
              onClick={() => { void handlePay(); }}
              disabled={submitting}
            >
              {submitting ? 'Оформление...' : 'Оплатить'}
            </button>
            <p className="checkout-side-note">
              Нажимая кнопку, вы соглашаетесь с условиями обработки данных и правилами продажи.
            </p>

            <h3>Ваш заказ</h3>
            <div className="checkout-summary-line">
              <span>Товары ({selectedItems.length})</span>
              <strong>{priceFormatter.format(itemsTotal)} ₽</strong>
            </div>
            <div className="checkout-summary-line">
              <span>Доставка</span>
              <span>{deliveryPrice === 0 ? 'Бесплатно' : `${priceFormatter.format(deliveryPrice)} ₽`}</span>
            </div>
            <div className="checkout-summary-total">
              <span>Итого</span>
              <strong>{priceFormatter.format(totalToPay)} ₽</strong>
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
};

export default CheckoutPage;
