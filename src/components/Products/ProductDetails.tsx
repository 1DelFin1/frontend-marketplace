import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiService } from '../../services/api';
import { getProductImageUrls, Product } from '../../types/product';
import { Review } from '../../types/review';
import { Seller } from '../../types/user';
import { getUserFromToken } from '../../utils/auth';
import mockStorePhoto from '../../assets/mock-store-photo.svg';

const BASE_PRODUCT_DATA_KEYS = [
  'name',
  'description',
  'price',
  'quantity',
  'category',
  'photo_urls',
  'image_url',
];

const COMMENT_MAX_LENGTH = 255;
const DEFAULT_COMMENT_RATING = 5;

const extractPropertiesKeys = (properties: Product['properties']): string[] => {
  if (!properties) {
    return [];
  }

  if (typeof properties === 'string') {
    try {
      const parsed = JSON.parse(properties);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.keys(parsed as Record<string, unknown>);
      }
    } catch {
      return [];
    }

    return [];
  }

  if (typeof properties === 'object' && !Array.isArray(properties)) {
    return Object.keys(properties);
  }

  return [];
};

const sortReviews = (reviews: Review[]): Review[] => {
  return [...reviews].sort((first, second) => {
    const firstDate = Date.parse(first.created_at ?? '');
    const secondDate = Date.parse(second.created_at ?? '');
    const normalizedFirstDate = Number.isNaN(firstDate) ? 0 : firstDate;
    const normalizedSecondDate = Number.isNaN(secondDate) ? 0 : secondDate;

    if (normalizedFirstDate === normalizedSecondDate) {
      return second.id - first.id;
    }

    return normalizedSecondDate - normalizedFirstDate;
  });
};

const ProductDetails: React.FC = () => {
  const { productId } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [sellerOrdersCount, setSellerOrdersCount] = useState<number | null>(null);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerError, setSellerError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteUpdating, setFavoriteUpdating] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(DEFAULT_COMMENT_RATING);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewAuthorNames, setReviewAuthorNames] = useState<Record<string, string>>({});

  const tokenUser = getUserFromToken();
  const canCreateComment = Boolean(
    tokenUser?.id
    && tokenUser.account_type !== 'seller'
    && tokenUser.account_type !== 'admin'
  );

  useEffect(() => {
    const loadProduct = async () => {
      if (!productId) {
        setError('Товар не найден');
        setLoading(false);
        return;
      }

      const numericProductId = Number(productId);
      if (Number.isNaN(numericProductId)) {
        setError('Некорректный идентификатор товара');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setSeller(null);
        setSellerOrdersCount(null);
        setSellerError('');
        const productData = await apiService.getProductById(numericProductId);
        setProduct(productData);

        if (!productData.seller_id) {
          setSellerError('Для товара не указан продавец');
          return;
        }

        setSellerLoading(true);
        try {
          const sellerData = await apiService.getSellerById(productData.seller_id);
          setSeller(sellerData);
          setSellerOrdersCount(typeof sellerData.orders_count === 'number' ? sellerData.orders_count : null);
          const actualOrdersCount = await apiService.getSellerOrdersCount(
            sellerData.id,
            sellerData.orders_count ?? null
          );
          if (typeof actualOrdersCount === 'number') {
            setSellerOrdersCount(actualOrdersCount);
          }
        } catch {
          setSellerOrdersCount(null);
          setSellerError('Не удалось загрузить данные продавца');
        } finally {
          setSellerLoading(false);
        }
      } catch (err) {
        console.error('Error fetching product:', err);
        setError('Не удалось загрузить товар');
      } finally {
        setLoading(false);
      }
    };

    void loadProduct();
  }, [productId]);

  useEffect(() => {
    if (!product?.id) {
      setReviews([]);
      setReviewsError('');
      setReviewsLoading(false);
      return;
    }

    let isCancelled = false;
    const loadReviews = async () => {
      setReviewsLoading(true);
      setReviewsError('');

      try {
        const serverReviews = await apiService.getReviewsByProductId(product.id);
        if (isCancelled) {
          return;
        }

        setReviews(sortReviews(serverReviews));
      } catch {
        if (isCancelled) {
          return;
        }

        setReviews([]);
        setReviewsError('Не удалось загрузить комментарии');
      } finally {
        if (!isCancelled) {
          setReviewsLoading(false);
        }
      }
    };

    void loadReviews();

    return () => {
      isCancelled = true;
    };
  }, [product?.id]);

  useEffect(() => {
    const unknownAuthorIds = Array.from(
      new Set(
        reviews
          .filter((review) => !review.user_name)
          .map((review) => review.user_id)
          .filter((userId) => userId.length > 0 && !reviewAuthorNames[userId])
      )
    );

    if (unknownAuthorIds.length === 0) {
      return;
    }

    let isCancelled = false;
    const loadAuthorNames = async () => {
      const results = await Promise.allSettled(
        unknownAuthorIds.map((userId) => apiService.getUserById(userId))
      );

      if (isCancelled) {
        return;
      }

      setReviewAuthorNames((previous) => {
        const next = { ...previous };
        let hasChanges = false;
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.name.trim().length > 0) {
            const normalizedName = result.value.name.trim();
            if (next[unknownAuthorIds[index]] !== normalizedName) {
              next[unknownAuthorIds[index]] = normalizedName;
              hasChanges = true;
            }
          }
        });
        return hasChanges ? next : previous;
      });
    };

    void loadAuthorNames();

    return () => {
      isCancelled = true;
    };
  }, [reviews, reviewAuthorNames]);

  const productDataKeys = useMemo(() => {
    if (!product) {
      return [];
    }

    const propertyKeys = extractPropertiesKeys(product.properties);
    return Array.from(new Set([...BASE_PRODUCT_DATA_KEYS, ...propertyKeys]));
  }, [product]);

  const addToCart = async () => {
    if (!product) {
      return;
    }

    if (product.quantity === 0) {
      toast.info('Товар временно недоступен');
      return;
    }

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

  useEffect(() => {
    const loadFavoriteStatus = async () => {
      if (!product?.id) {
        setIsFavorite(false);
        return;
      }

      if (!tokenUser?.id) {
        setIsFavorite(false);
        return;
      }

      try {
        const favorites = await apiService.getFavoritesByUserId(tokenUser.id);
        setIsFavorite(favorites.some((item) => item.product_id === product.id));
      } catch {
        setIsFavorite(false);
      }
    };

    void loadFavoriteStatus();
  }, [product?.id, tokenUser?.id]);

  const toggleFavorite = async () => {
    if (!product?.id || favoriteUpdating) {
      return;
    }

    if (!tokenUser?.id) {
      toast.error('Требуется авторизация');
      return;
    }

    setFavoriteUpdating(true);
    try {
      const favorites = await apiService.getFavoritesByUserId(tokenUser.id, true);
      const isAlreadyFavorite = favorites.some((item) => item.product_id === product.id);
      const nextFavorites = isAlreadyFavorite
        ? favorites.filter((item) => item.product_id !== product.id)
        : [...favorites, { product_id: product.id, quantity: 1 }];

      await apiService.setFavoritesByUserId(tokenUser.id, nextFavorites);
      setIsFavorite(!isAlreadyFavorite);
      window.dispatchEvent(new Event('favorites-updated'));
      toast.success(isAlreadyFavorite ? 'Товар удален из избранного' : 'Товар добавлен в избранное');
    } catch {
      toast.error('Не удалось обновить избранное');
    } finally {
      setFavoriteUpdating(false);
    }
  };

  const submitReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!product?.id) {
      return;
    }

    if (!tokenUser?.id) {
      toast.error('Требуется авторизация');
      return;
    }

    if (!canCreateComment) {
      toast.info('Комментарии доступны только покупателям');
      return;
    }

    const normalizedText = reviewText.trim();
    if (!normalizedText) {
      toast.error('Введите текст комментария');
      return;
    }

    if (normalizedText.length > COMMENT_MAX_LENGTH) {
      toast.error(`Комментарий не должен превышать ${COMMENT_MAX_LENGTH} символов`);
      return;
    }

    setReviewSubmitting(true);
    try {
      await apiService.createReview({
        user_id: tokenUser.id,
        product_id: product.id,
        text: normalizedText,
        rating: reviewRating,
      });

      const serverReviews = await apiService.getReviewsByProductId(product.id, true);
      setReviews(sortReviews(serverReviews));

      if (tokenUser.name.trim().length > 0) {
        setReviewAuthorNames((previous) => ({
          ...previous,
          [tokenUser.id]: tokenUser.name.trim(),
        }));
      }

      setReviewText('');
      setReviewRating(DEFAULT_COMMENT_RATING);
      toast.success('Комментарий отправлен');

      try {
        const updatedProduct = await apiService.getProductById(product.id, true);
        setProduct(updatedProduct);
      } catch {
        // Ignore product refresh errors after a successful comment submission.
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('status: 400')) {
        toast.error('Комментарий могут оставлять только покупатели этого товара');
      } else if (errorMessage.includes('status: 409')) {
        toast.error('Вы уже оставляли комментарий для этого товара');
      } else {
        toast.error('Не удалось отправить комментарий');
      }
    } finally {
      setReviewSubmitting(false);
    }
  };

  const formattedSellerRating = useMemo(() => {
    if (!seller || typeof seller.rating !== 'number') {
      return '—';
    }

    return seller.rating.toFixed(1);
  }, [seller]);

  const formattedSellerOrdersCount = useMemo(() => {
    if (sellerOrdersCount === null) {
      return '—';
    }

    return sellerOrdersCount.toLocaleString('ru-RU');
  }, [sellerOrdersCount]);

  const sellerPhotoUrl = useMemo(() => {
    if (!seller || typeof seller.photo_url !== 'string') {
      return mockStorePhoto;
    }

    const trimmedPhotoUrl = seller.photo_url.trim();
    return trimmedPhotoUrl.length > 0 ? trimmedPhotoUrl : mockStorePhoto;
  }, [seller]);

  const productImageUrls = useMemo(() => getProductImageUrls(product ?? undefined), [product]);
  const selectedProductImageUrl = productImageUrls[selectedImageIndex] || productImageUrls[0];

  const displayedProductRating = useMemo(() => {
    if (reviews.length > 0) {
      const sum = reviews.reduce((accumulator, review) => accumulator + review.rating, 0);
      return sum / reviews.length;
    }

    if (typeof product?.rating === 'number' && Number.isFinite(product.rating)) {
      return product.rating;
    }

    return null;
  }, [product?.rating, reviews]);

  const displayedReviewsCount = useMemo(() => {
    if (reviews.length > 0) {
      return reviews.length;
    }

    const productReviewsCount = (
      typeof product?.total_reviews === 'number'
      && Number.isFinite(product.total_reviews)
      && product.total_reviews >= 0
    )
      ? Math.trunc(product.total_reviews)
      : 0;

    return productReviewsCount;
  }, [product?.total_reviews, reviews.length]);

  const formattedProductRating = useMemo(() => {
    return displayedProductRating === null ? '—' : displayedProductRating.toFixed(1);
  }, [displayedProductRating]);

  const formattedReviewsCount = useMemo(() => {
    return displayedReviewsCount.toLocaleString('ru-RU');
  }, [displayedReviewsCount]);

  const ratingBreakdown = useMemo(() => {
    const countsByScore: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    reviews.forEach((review) => {
      const normalizedScore = Math.max(1, Math.min(5, Math.round(review.rating)));
      countsByScore[normalizedScore] += 1;
    });

    const total = reviews.length;
    return [5, 4, 3, 2, 1].map((score) => ({
      score,
      count: countsByScore[score],
      percent: total > 0 ? (countsByScore[score] / total) * 100 : 0,
    }));
  }, [reviews]);

  const reviewDateFormatter = useMemo(() => {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const resolveReviewAuthorName = (review: Review): string => {
    if (typeof review.user_name === 'string' && review.user_name.trim().length > 0) {
      return review.user_name.trim();
    }

    if (review.user_id === tokenUser?.id) {
      return tokenUser.name.trim().length > 0 ? tokenUser.name.trim() : 'Вы';
    }

    const cachedAuthorName = reviewAuthorNames[review.user_id];
    if (typeof cachedAuthorName === 'string' && cachedAuthorName.trim().length > 0) {
      return cachedAuthorName.trim();
    }

    return 'Пользователь';
  };

  const formatReviewDate = (rawDate?: string): string | null => {
    if (!rawDate) {
      return null;
    }

    const parsedDate = Date.parse(rawDate);
    if (Number.isNaN(parsedDate)) {
      return null;
    }

    return reviewDateFormatter.format(new Date(parsedDate));
  };

  useEffect(() => {
    setSelectedImageIndex(0);
  }, [product?.id, productImageUrls.length]);

  if (loading) {
    return <div className="loading">Загрузка товара...</div>;
  }

  if (error || !product) {
    return <div className="error">Ошибка: {error || 'Товар не найден'}</div>;
  }

  return (
    <div className="product-detail-page">
      <div className="product-detail-breadcrumbs">
        <Link to="/products">Каталог</Link>
        <span>/</span>
        <span>{product.name}</span>
      </div>

      <section className="product-detail-main">
        <div className="product-detail-gallery">
          {selectedProductImageUrl ? (
            <>
              <img src={selectedProductImageUrl} alt={product.name} className="product-gallery-main-image" />
              {productImageUrls.length > 1 && (
                <div className="product-gallery-thumbnails" aria-label="Все фото товара">
                  {productImageUrls.map((imageUrl, index) => (
                    <button
                      key={`${imageUrl}-${index}`}
                      type="button"
                      className={`product-gallery-thumbnail-button ${index === selectedImageIndex ? 'active' : ''}`}
                      onClick={() => setSelectedImageIndex(index)}
                      aria-label={`Фото ${index + 1}`}
                      aria-pressed={index === selectedImageIndex}
                    >
                      <img
                        src={imageUrl}
                        alt={`${product.name} — фото ${index + 1}`}
                        className="product-gallery-thumbnail-image"
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="product-image-placeholder">Нет изображения</div>
          )}
        </div>

        <div className="product-detail-content">
          <h1>{product.name}</h1>

          <div className={`product-quantity ${product.quantity > 0 ? 'in-stock' : 'out-of-stock'}`}>
            {product.quantity > 0 ? `В наличии: ${product.quantity}` : 'Нет в наличии'}
          </div>

          {product.category && (
            <div className="product-detail-category">Категория: {product.category}</div>
          )}

          <p className="product-detail-description">
            {product.description || 'Описание товара пока не добавлено.'}
          </p>

          <div className="product-detail-properties">
            <h2>Поля product_data</h2>
            <div className="product-detail-property-list">
              {productDataKeys.map((key) => (
                <code key={key} className="product-detail-property-item">
                  {`product_data["${key}"]`}
                </code>
              ))}
            </div>
          </div>
        </div>

        <div className="product-side-column">
          <aside className="product-buy-panel">
            <div className="product-buy-price">{product.price} ₽</div>
            <div className="product-buy-actions">
              <button
                className="product-buy-button"
                onClick={addToCart}
                disabled={product.quantity === 0}
              >
                {product.quantity > 0 ? 'Добавить в корзину' : 'Нет в наличии'}
              </button>
              <button
                type="button"
                className={`product-favorite-button ${isFavorite ? 'active' : ''}`}
                onClick={() => {
                  void toggleFavorite();
                }}
                aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                aria-pressed={isFavorite}
                disabled={favoriteUpdating}
              >
                <svg viewBox="0 0 24 24" className="product-favorite-icon" aria-hidden="true">
                  <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A5.96 5.96 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" />
                </svg>
              </button>
            </div>
          </aside>

          <div className="seller-section">
            <h3 className="seller-panel-title">Магазин</h3>
            <aside className="seller-panel">
              {sellerLoading && (
                <div className="seller-panel-state">Загрузка данных продавца...</div>
              )}

              {!sellerLoading && seller && (
                <>
                  <div className="product-seller-card">
                    <div className="product-seller-card-header">
                      <div className="product-seller-head">
                        <div className="product-seller-store-photo-wrap">
                          <img
                            src={sellerPhotoUrl}
                            alt={`Фото магазина ${seller.name}`}
                            className="product-seller-store-photo"
                            onError={(event) => {
                              const image = event.currentTarget;
                              if (image.src !== mockStorePhoto) {
                                image.src = mockStorePhoto;
                              }
                            }}
                          />
                        </div>
                        <div className="product-seller-head-main">
                          <div className="product-seller-name">{seller.name}</div>
                          <Link to={`/store/${seller.id}`} className="product-seller-go-link">
                            Перейти
                          </Link>
                        </div>
                      </div>
                      <div className="product-seller-card-side">
                        <div className="product-seller-rating-pill">
                          <span className="product-seller-rating-star" aria-hidden="true">★</span>
                          <strong>{formattedSellerRating}</strong>
                        </div>
                        <button
                          type="button"
                          className="product-seller-chat-pill"
                          aria-label={`Чат с магазином ${seller.name}`}
                        >
                          Чат
                        </button>
                      </div>
                    </div>

                    <div className="product-seller-card-row">
                      <span>Заказы</span>
                      <strong>{formattedSellerOrdersCount}</strong>
                    </div>

                    <button
                      type="button"
                      className="product-seller-about-button"
                      onClick={() => {
                        toast.info(`Магазин: ${seller.name}`);
                      }}
                    >
                      О магазине
                    </button>
                  </div>
                </>
              )}

              {!sellerLoading && !seller && sellerError && (
                <div className="seller-panel-state seller-panel-state-error">
                  {sellerError}
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>

      <section className="product-comments-section">
        <div className="product-comments-heading">
          <h2>Комментарии</h2>
        </div>

        <div className="product-comments-layout">
          <div className="product-comments-main">
            {reviewsLoading && (
              <div className="product-comments-state">Загрузка комментариев...</div>
            )}

            {!reviewsLoading && reviewsError && (
              <div className="product-comments-state product-comments-state-error">{reviewsError}</div>
            )}

            {!reviewsLoading && reviews.length === 0 && (
              <div className="product-comments-state">Пока нет комментариев. Будьте первым, кто оставит отзыв.</div>
            )}

            {reviews.length > 0 && (
              <div className="product-comments-list">
                {reviews.map((review) => {
                  const formattedDate = formatReviewDate(review.created_at);
                  return (
                    <article key={`${review.id}-${review.user_id}`} className="product-comment-card">
                      <div className="product-comment-top">
                        <div className="product-comment-author">{resolveReviewAuthorName(review)}</div>
                        <div className="product-comment-rating-value">
                          {Number.isInteger(review.rating) ? review.rating.toFixed(0) : review.rating.toFixed(1)} / 5
                        </div>
                      </div>
                      {formattedDate && (
                        <div className="product-comment-date">{formattedDate}</div>
                      )}
                      <p className="product-comment-text">{review.text}</p>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="product-comment-form-wrap">
              <h3>Оставить комментарий</h3>
              {!tokenUser?.id && (
                <p className="product-comment-form-note">
                  Чтобы оставить комментарий, войдите в аккаунт.
                </p>
              )}
              {tokenUser?.id && !canCreateComment && (
                <p className="product-comment-form-note">
                  Комментарии доступны только покупателям.
                </p>
              )}
              <form className="product-comment-form" onSubmit={submitReview}>
                <div className="product-comment-form-row">
                  <label htmlFor="review-rating">Оценка</label>
                  <select
                    id="review-rating"
                    value={reviewRating}
                    onChange={(event) => {
                      setReviewRating(Number(event.target.value));
                    }}
                    disabled={!canCreateComment || reviewSubmitting}
                  >
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="product-comment-form-row">
                  <label htmlFor="review-text">Комментарий</label>
                  <textarea
                    id="review-text"
                    value={reviewText}
                    onChange={(event) => {
                      setReviewText(event.target.value);
                    }}
                    maxLength={COMMENT_MAX_LENGTH}
                    placeholder="Напишите, что вам понравилось или не понравилось в товаре"
                    disabled={!canCreateComment || reviewSubmitting}
                  />
                  <div className="product-comment-counter">
                    {reviewText.length}/{COMMENT_MAX_LENGTH}
                  </div>
                </div>
                <button
                  type="submit"
                  className="product-comment-submit"
                  disabled={!canCreateComment || reviewSubmitting}
                >
                  {reviewSubmitting ? 'Отправка...' : 'Отправить комментарий'}
                </button>
              </form>
            </div>
          </div>

          <aside className="product-comments-stats">
            <div className="product-comments-metrics">
              <div className="product-comments-metric-item">
                <span>Рейтинг</span>
                <strong>{formattedProductRating}</strong>
              </div>
              <div className="product-comments-metric-item">
                <span>Комментариев</span>
                <strong>{formattedReviewsCount}</strong>
              </div>
            </div>
            {reviews.length > 0 && (
              <div className="product-rating-breakdown" aria-label="Распределение оценок">
                {ratingBreakdown.map((item) => (
                  <div key={item.score} className="product-rating-breakdown-row">
                    <span className="product-rating-breakdown-label">{item.score}★</span>
                    <div className="product-rating-breakdown-track">
                      <span
                        className="product-rating-breakdown-fill"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                    <span className="product-rating-breakdown-count">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
};

export default ProductDetails;
