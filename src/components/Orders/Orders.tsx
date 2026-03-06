import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getPrimaryProductImageUrl, Product } from '../../types/product';
import { OrderItem, UserOrder } from '../../types/user';
import { apiService } from '../../services/api';
import { getUserFromToken } from '../../utils/auth';

type UnknownRecord = Record<string, unknown>;

interface OrderItemView extends OrderItem {
  product?: Product;
}

interface UserOrderView extends UserOrder {
  order_items: OrderItemView[];
}

const priceFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const statusLabels: Record<string, string> = {
  pending: 'Ожидает обработки',
  reserved: 'Ожидает оплаты',
  reservation_failed: 'Ошибка резерва',
  paid: 'Оплачен',
  payment_failed: 'Ошибка оплаты',
  preparing: 'Собирается',
  shipping: 'В пути',
  delivered: 'Доставлен',
  completed: 'Завершен',
  cancelled: 'Отменен',
  refunded: 'Возврат',
  unknown: 'Статус не указан',
};

const statusTones: Record<string, string> = {
  pending: 'pending',
  reserved: 'processing',
  reservation_failed: 'failed',
  paid: 'success',
  payment_failed: 'failed',
  preparing: 'processing',
  shipping: 'processing',
  delivered: 'success',
  completed: 'success',
  cancelled: 'failed',
  refunded: 'neutral',
  unknown: 'neutral',
};

const featuredOrderStatuses = new Set(['reserved', 'preparing', 'shipping', 'delivered']);
const payableOrderStatuses = new Set(['reserved']);

const isObject = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null;
};

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const normalizeOrderItem = (value: unknown): OrderItemView | null => {
  if (!isObject(value)) {
    return null;
  }

  const productIdRaw = value.product_id ?? value.productId ?? value.id;
  const quantityRaw = value.quantity;

  const productId = toNumberOrNull(productIdRaw);
  const quantity = toNumberOrNull(quantityRaw);

  if (!productId || !quantity || quantity <= 0) {
    return null;
  }

  const price = toNumberOrNull(value.price);

  return {
    product_id: productId,
    quantity,
    price,
  };
};

const normalizeOrder = (value: unknown): UserOrderView | null => {
  if (!isObject(value)) {
    return null;
  }

  const rawId = value.id ?? value.order_id ?? value.orderId;
  if (typeof rawId !== 'string' && typeof rawId !== 'number') {
    return null;
  }

  const statusRaw = value.status;
  const status = typeof statusRaw === 'string' && statusRaw.trim().length > 0
    ? statusRaw.trim().toLowerCase()
    : 'unknown';

  const itemsRaw = value.order_items ?? value.orderItems ?? value.items;
  const orderItems = Array.isArray(itemsRaw)
    ? itemsRaw
      .map(normalizeOrderItem)
      .filter((item): item is OrderItemView => item !== null)
    : [];

  const totalAmount = toNumberOrNull(value.total_amount ?? value.totalAmount);
  const createdAt = typeof value.created_at === 'string'
    ? value.created_at
    : (typeof value.createdAt === 'string' ? value.createdAt : undefined);
  const updatedAt = typeof value.updated_at === 'string'
    ? value.updated_at
    : (typeof value.updatedAt === 'string' ? value.updatedAt : undefined);

  return {
    id: String(rawId),
    status,
    order_items: orderItems,
    total_amount: totalAmount,
    created_at: createdAt,
    updated_at: updatedAt,
  };
};

const formatPrice = (value: number): string => {
  return `${priceFormatter.format(value)} ₽`;
};

const formatDate = (value?: string): string => {
  if (!value) {
    return 'Дата не указана';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Дата не указана';
  }

  return date.toLocaleString('ru-RU');
};

const calculateOrderTotal = (order: UserOrderView): number | null => {
  if (typeof order.total_amount === 'number' && Number.isFinite(order.total_amount)) {
    return order.total_amount;
  }

  if (order.order_items.length === 0) {
    return 0;
  }

  const allItemsHavePrice = order.order_items.every((item) => typeof item.price === 'number' && Number.isFinite(item.price));
  if (!allItemsHavePrice) {
    return null;
  }

  return order.order_items.reduce((acc, item) => acc + (item.price || 0) * item.quantity, 0);
};

const hydrateProducts = async (orders: UserOrderView[]): Promise<UserOrderView[]> => {
  const uniqueProductIds = Array.from(
    new Set(
      orders.flatMap((order) => order.order_items.map((item) => item.product_id)),
    ),
  );

  if (uniqueProductIds.length === 0) {
    return orders;
  }

  const productResults = await Promise.all(
    uniqueProductIds.map(async (productId) => {
      try {
        const product = await apiService.getProductById(productId);
        return { productId, product };
      } catch {
        return { productId, product: null };
      }
    }),
  );

  const productMap = new Map<number, Product>();
  productResults.forEach(({ productId, product }) => {
    if (product) {
      productMap.set(productId, product);
    }
  });

  return orders.map((order) => ({
    ...order,
    order_items: order.order_items.map((item) => ({
      ...item,
      product: productMap.get(item.product_id),
    })),
  }));
};

const Orders: React.FC = () => {
  const [orders, setOrders] = useState<UserOrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payingOrderIds, setPayingOrderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    setError('');

    try {
      const tokenUser = getUserFromToken();
      if (!tokenUser?.id) {
        throw new Error('Unauthorized');
      }

      const ordersResponse = await apiService.getOrdersByUserId(tokenUser.id);
      const resolvedOrders = ordersResponse
        .map(normalizeOrder)
        .filter((order): order is UserOrderView => order !== null);

      const enrichedOrders = await hydrateProducts(resolvedOrders);
      setOrders(enrichedOrders);
    } catch (fetchError) {
      setError('Не удалось загрузить заказы');
      toast.error('Ошибка загрузки заказов');
    } finally {
      setLoading(false);
    }
  };

  const handlePayOrder = async (orderId: string) => {
    if (payingOrderIds.has(orderId)) {
      return;
    }

    setPayingOrderIds((prev) => {
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });

    try {
      await apiService.confirmOrder(orderId);
      toast.success('Заказ успешно оплачен');
      await fetchOrders();
    } catch {
      toast.error('Не удалось оплатить заказ');
    } finally {
      setPayingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  if (loading) {
    return <div className="loading">Загрузка заказов...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (orders.length === 0) {
    return (
      <section className="orders-page">
        <div className="orders-empty-state">
          <h2>Заказов пока нет</h2>
          <p>Когда вы оформите заказ, он появится в этом разделе.</p>
          <Link to="/products" className="orders-empty-link">
            Перейти в каталог
          </Link>
        </div>
      </section>
    );
  }

  const featuredOrders = orders.filter((order) => featuredOrderStatuses.has(order.status));
  const regularOrders = orders.filter((order) => !featuredOrderStatuses.has(order.status));

  const renderOrderCard = (order: UserOrderView, compact = false) => {
    const total = calculateOrderTotal(order);
    const toneClass = statusTones[order.status] || statusTones.unknown;
    const statusLabel = statusLabels[order.status] || statusLabels.unknown;
    const canPay = payableOrderStatuses.has(order.status);
    const isPaying = payingOrderIds.has(order.id);

    return (
      <article key={order.id} className={`order-card ${compact ? 'featured' : ''}`}>
        <header className="order-card-head">
          <div className="order-card-meta">
            <h2>Заказ #{order.id.slice(0, 8).toUpperCase()}</h2>
            <p>{formatDate(order.created_at || order.updated_at)}</p>
          </div>
          <span className={`order-status-badge ${toneClass}`}>{statusLabel}</span>
        </header>

        <div className={`order-items-list ${compact ? 'compact' : ''}`}>
          {order.order_items.length === 0 && (
            <p className="order-items-empty">Состав заказа недоступен</p>
          )}

          {order.order_items.map((item, index) => {
            const itemName = item.product?.name || `Товар #${item.product_id}`;
            const unitPrice = typeof item.price === 'number' ? item.price : item.product?.price;
            const itemTotal = typeof unitPrice === 'number' ? unitPrice * item.quantity : null;
            const productImageUrl = getPrimaryProductImageUrl(item.product);

            return (
              <div key={`${order.id}-${item.product_id}-${index}`} className="order-item-row">
                <div className="order-item-image">
                  {productImageUrl ? (
                    <img src={productImageUrl} alt={itemName} />
                  ) : (
                    <span>Фото</span>
                  )}
                </div>

                <div className="order-item-info">
                  <h3>{itemName}</h3>
                  <p>Количество: {item.quantity}</p>
                </div>

                <div className="order-item-price">
                  {itemTotal !== null ? (
                    <strong>{formatPrice(itemTotal)}</strong>
                  ) : (
                    <span>Цена уточняется</span>
                  )}
                  {typeof unitPrice === 'number' && (
                    <small>{formatPrice(unitPrice)} за шт.</small>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <footer className="order-card-footer">
          <span>{order.order_items.length} поз.</span>
          <div className="order-card-footer-actions">
            {canPay && (
              <button
                type="button"
                className="order-pay-button"
                disabled={isPaying}
                onClick={() => void handlePayOrder(order.id)}
              >
                {isPaying ? 'Оплата...' : 'Оплатить'}
              </button>
            )}
            <strong>{total !== null ? formatPrice(total) : 'Итог уточняется'}</strong>
          </div>
        </footer>
      </article>
    );
  };

  return (
    <section className="orders-page">
      <div className="orders-page-head">
        <h1>Мои заказы</h1>
        <span>{orders.length} шт.</span>
      </div>

      {featuredOrders.length > 0 && (
        <div className="orders-featured-section">
          <div className="orders-featured-head">
            <h2>Текущие заказы</h2>
          </div>
          <div className="orders-featured-scroll">
            {featuredOrders.map((order) => renderOrderCard(order, true))}
          </div>
        </div>
      )}

      {regularOrders.length > 0 && (
        <div className="orders-list">
          {regularOrders.map((order) => renderOrderCard(order))}
        </div>
      )}
    </section>
  );
};

export default Orders;
