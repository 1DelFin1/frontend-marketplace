import React from 'react';
import { Link } from 'react-router-dom';
import { getPrimaryProductImageUrl, Product } from '../../types/product';
import { toast } from 'react-toastify';
import { apiService } from '../../services/api';
import { getUserFromToken } from '../../utils/auth';

interface ProductCardProps {
  product: Product;
  cartQuantity?: number;
  cartUpdating?: boolean;
  onChangeCartQuantity?: (product: Product, nextQuantity: number) => Promise<void> | void;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  cartQuantity = 0,
  cartUpdating = false,
  onChangeCartQuantity,
}) => {
  const productImageUrl = getPrimaryProductImageUrl(product);
  const normalizedCartQuantity = Math.max(0, Math.trunc(cartQuantity));
  const hasExternalCartControl = typeof onChangeCartQuantity === 'function';
  const canIncreaseFromCart = product.quantity > 0 && normalizedCartQuantity < product.quantity;

  const changeExternalCartQuantity = async (nextQuantity: number) => {
    if (!onChangeCartQuantity) {
      return;
    }

    await onChangeCartQuantity(product, nextQuantity);
  };

  const addToCart = async () => {
    if (hasExternalCartControl) {
      await changeExternalCartQuantity(normalizedCartQuantity + 1);
      return;
    }

    const tokenUser = getUserFromToken();
    if (!tokenUser?.id) {
      toast.error('Требуется авторизация');
      return;
    }

    try {
      const cartItems = await apiService.getCartByUserId(tokenUser.id);
      const existingItem = cartItems.find((item) => item.product_id === product.id);
      const updatedItems = existingItem
        ? cartItems.map((item) => (
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ))
        : [...cartItems, { product_id: product.id, quantity: 1 }];

      await apiService.setCartByUserId(tokenUser.id, updatedItems);
      window.dispatchEvent(new Event('cart-updated'));
      toast.success('Товар добавлен в корзину!');
    } catch {
      toast.error('Не удалось добавить товар в корзину');
    }
  };

  return (
    <div className="product-card">
      <Link to={`/products/${product.id}`} className="product-card-link">
        <div className="product-image">
          {productImageUrl ? (
            <img src={productImageUrl} alt={product.name} />
          ) : (
            <div className="product-image-placeholder">Нет изображения</div>
          )}
        </div>

        <div className="product-info">
          <h3 className="product-name">{product.name}</h3>
          <p className="product-description">{product.description}</p>

          {product.category && (
            <div className="product-category">Категория: {product.category}</div>
          )}

          <div className="product-details">
            <div className={`product-quantity ${product.quantity > 0 ? 'in-stock' : 'out-of-stock'}`}>
              {product.quantity > 0 ? `В наличии: ${product.quantity}` : 'Нет в наличии'}
            </div>
            <div className="product-price">{product.price} ₽</div>
          </div>
        </div>
      </Link>

      <div className="product-card-actions">
        {hasExternalCartControl && normalizedCartQuantity > 0 ? (
          <div className={`product-card-cart-controls ${cartUpdating ? 'is-updating' : ''}`}>
            <button
              type="button"
              className="product-card-cart-btn"
              onClick={() => {
                void changeExternalCartQuantity(normalizedCartQuantity - 1);
              }}
              disabled={cartUpdating || normalizedCartQuantity <= 0}
              aria-label="Уменьшить количество в корзине"
            >
              -
            </button>
            <span className="product-card-cart-qty">{normalizedCartQuantity}</span>
            <button
              type="button"
              className="product-card-cart-btn"
              onClick={() => {
                void changeExternalCartQuantity(normalizedCartQuantity + 1);
              }}
              disabled={cartUpdating || !canIncreaseFromCart}
              aria-label="Увеличить количество в корзине"
            >
              +
            </button>
          </div>
        ) : (
          <button
            className="add-to-cart-btn"
            onClick={() => {
              void addToCart();
            }}
            disabled={product.quantity === 0 || cartUpdating}
          >
            {product.quantity > 0 ? 'В корзину' : 'Нет в наличии'}
          </button>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
