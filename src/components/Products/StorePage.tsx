import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiService } from '../../services/api';
import { Product } from '../../types/product';
import { Seller } from '../../types/user';
import { Category } from '../../types/category';
import ProductCard from './ProductCard';
import mockStorePhoto from '../../assets/mock-store-photo.svg';

const StorePage: React.FC = () => {
  const { sellerId } = useParams();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadStore = async () => {
      if (!sellerId) {
        setError('Магазин не найден');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const [sellerData, allProducts, categories] = await Promise.all([
          apiService.getSellerById(sellerId),
          apiService.getProducts(),
          apiService.getCategories(),
        ]);

        const categoryNameById = new Map<number, string>(
          categories.map((category: Category) => [category.id, category.name])
        );

        const sellerProducts = allProducts
          .filter((product) => product.seller_id === sellerData.id)
          .map((product) => ({
            ...product,
            category: product.category || (product.category_id ? categoryNameById.get(product.category_id) : undefined),
          }))
          .sort((a, b) => {
            const aInStock = (a.quantity || 0) > 0;
            const bInStock = (b.quantity || 0) > 0;
            return Number(bInStock) - Number(aInStock);
          });

        setSeller(sellerData);
        setProducts(sellerProducts);
      } catch {
        setError('Не удалось загрузить страницу магазина');
      } finally {
        setLoading(false);
      }
    };

    void loadStore();
  }, [sellerId]);

  if (loading) {
    return <div className="loading">Загрузка магазина...</div>;
  }

  if (error || !seller) {
    return <div className="error">Ошибка: {error || 'Магазин не найден'}</div>;
  }

  return (
    <section className="store-page">
      <Link to="/products" className="store-back-link">← Вернуться в каталог</Link>

      <article className="store-hero">
        <div className="store-hero-media">
          <img src={mockStorePhoto} alt={`Магазин ${seller.name}`} className="store-hero-image" />
        </div>
        <div className="store-hero-overlay" />
        <div className="store-hero-content">
          <small className="store-hero-label">Магазин продавца</small>
          <h1>{seller.name}</h1>
          <div className="store-hero-stats">
            <div>
              <span>Рейтинг</span>
              <strong>{typeof seller.rating === 'number' ? seller.rating.toFixed(1) : '—'}</strong>
            </div>
            <div>
              <span>Заказов</span>
              <strong>{typeof seller.orders_count === 'number' ? seller.orders_count.toLocaleString('ru-RU') : '—'}</strong>
            </div>
            <div>
              <span>Товаров</span>
              <strong>{products.length}</strong>
            </div>
          </div>
        </div>
      </article>

      <section className="store-products-section">
        <div className="store-products-head">
          <h2>Товары магазина</h2>
          <span>{products.length} шт.</span>
        </div>

        {products.length > 0 ? (
          <div className="products-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>У этого магазина пока нет товаров</h3>
            <p>Загляните позже</p>
          </div>
        )}
      </section>
    </section>
  );
};

export default StorePage;
