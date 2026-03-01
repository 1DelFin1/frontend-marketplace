// src/components/Products/ProductList.tsx
import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import ProductCard from './ProductCard';
import { Product } from '../../types/product';
import { apiService } from '../../services/api';

const ProductList: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const productsData = await apiService.getProducts();
      const sortedProducts = [...productsData].sort((a, b) => {
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
  };

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
          <ProductCard key={product.id} product={product} />
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
