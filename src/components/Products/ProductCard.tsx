import React from 'react';
import { Product } from '../../types/product';
import { toast } from 'react-toastify';
import { CartItem } from '../../types/user';

interface ProductCardProps {
  product: Product;
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
    const addToCart = () => {
    const savedCart = localStorage.getItem('cart');
    const cart: { items: CartItem[]; total: number } = savedCart
      ? JSON.parse(savedCart)
      : { items: [], total: 0 };

    const existingItem = cart.items.find(item => item.product_id === product.id);

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.items.push({
        product_id: product.id,
        quantity: 1,
        product: product
      });
    }

    // Пересчет общей суммы
    cart.total = cart.items.reduce((total, item) => {
      return total + (item.product?.price || 0) * item.quantity;
    }, 0);

    localStorage.setItem('cart', JSON.stringify(cart));
    toast.success('Товар добавлен в корзину!');
  };

  return (
    <div className="product-card">
      <div className="product-image">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} />
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
              <div className="product-quantity">
                  {product.quantity > 0 ? `В наличии: ${product.quantity}` : 'Нет в наличии'}
              </div>
              <div className="product-price">{product.price} ₽</div>
          </div>

          <button
              className="add-to-cart-btn"
              onClick={addToCart}
              disabled={product.quantity === 0}
          >
              {product.quantity > 0 ? 'В корзину' : 'Нет в наличии'}
        </button>
      </div>
    </div>
  );
};

export default ProductCard;
