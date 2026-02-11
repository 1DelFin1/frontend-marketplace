import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { CartItem, Cart } from '../../types/user';


const CartFunc: React.FC = () => {
  const [cart, setCart] = useState<Cart>({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = () => {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
  };

  const saveCart = (newCart: Cart) => {
    localStorage.setItem('cart', JSON.stringify(newCart));
    setCart(newCart);
  };

  const updateQuantity = (productId: number, quantity: number) => {
    const newItems = cart.items.map(item =>
      item.product_id === productId ? { ...item, quantity } : item
    ).filter(item => item.quantity > 0);

    const total = calculateTotal(newItems);
    saveCart({ items: newItems, total });
  };

  const calculateTotal = (items: CartItem[]): number => {
    return items.reduce((total, item) => {
      return total + (item.product?.price || 0) * item.quantity;
    }, 0);
  };

  const removeFromCart = (productId: number) => {
    const newItems = cart.items.filter(item => item.product_id !== productId);
    const total = calculateTotal(newItems);
    saveCart({ items: newItems, total });
    toast.info('Товар удален из корзины');
  };

  const clearCart = () => {
    saveCart({ items: [], total: 0 });
    toast.info('Корзина очищена');
  };

  const checkout = async () => {
    setLoading(true);
    try {
      // Здесь будет API call для оформления заказа
      await new Promise(resolve => setTimeout(resolve, 1000)); // Имитация
      clearCart();
      toast.success('Заказ успешно оформлен!');
    } catch (error) {
      toast.error('Ошибка при оформлении заказа');
    } finally {
      setLoading(false);
    }
  };

  if (cart.items.length === 0) {
    return (
      <div className="cart-container">
        <div className="cart-card">
          <h2>Корзина</h2>
          <div className="empty-cart">
            <p>Ваша корзина пуста</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-container">
      <div className="cart-card">
        <h2>Корзина</h2>

        <div className="cart-items">
          {cart.items.map(item => (
            <div key={item.product_id} className="cart-item">
              <div className="item-info">
                <h4>{item.product?.name || 'Товар'}</h4>
                <p>{item.product?.price ? `${item.product.price} ₽` : 'Цена не указана'}</p>
              </div>

              <div className="item-controls">
                <div className="quantity-controls">
                  <button
                    onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                  >
                    -
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={() => removeFromCart(item.product_id)}
                  className="remove-btn"
                >
                  Удалить
                </button>
              </div>

              <div className="item-total">
                {item.product?.price ? `${item.product.price * item.quantity} ₽` : ''}
              </div>
            </div>
          ))}
        </div>

        <div className="cart-summary">
          <div className="total">
            <strong>Итого: {cart.total} ₽</strong>
          </div>

          <div className="cart-actions">
            <button onClick={clearCart} className="clear-btn">
              Очистить корзину
            </button>
            <button
              onClick={checkout}
              disabled={loading}
              className="checkout-btn"
            >
              {loading ? 'Оформление...' : 'Оформить заказ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartFunc;
