export interface Product {
  id: number;        // Изменил string на number (судя по схеме)
  photo_urls?: Record<string, string>;
  name: string;
  description: string;
  price: number;
  quantity: number;  // Добавил quantity
  seller_id?: string;
  category_id?: number;
  properties?: Record<string, unknown> | string;
  image_url?: string; // Опциональное поле, если есть в ответе
  category?: string;  // Опциональное поле
  created_at?: string;
  updated_at?: string;
  is_active?: boolean;
}

export interface ProductCreate {
  photo_urls?: Record<string, string>;
  name: string;
  description: string;
  price: number;
  quantity: number;
  seller_id: string;
  category_id: number;
  properties?: Record<string, unknown> | string;
}

export interface ProductUpdate {
  photo_urls?: Record<string, string>;
  name?: string;
  description?: string;
  price?: number;
  quantity?: number;
  is_active?: boolean;
  category_id?: number;
  properties?: Record<string, unknown> | string;
}

const getOrderedPhotoUrlKeys = (photoUrls: Record<string, string>): string[] => {
  return Object.keys(photoUrls).sort((a, b) => {
    const first = Number(a);
    const second = Number(b);
    const firstIsNumber = Number.isFinite(first);
    const secondIsNumber = Number.isFinite(second);

    if (firstIsNumber && secondIsNumber) {
      return first - second;
    }
    if (firstIsNumber) {
      return -1;
    }
    if (secondIsNumber) {
      return 1;
    }
    return a.localeCompare(b);
  });
};

export const getProductImageUrls = (product?: Pick<Product, 'image_url' | 'photo_urls'>): string[] => {
  if (!product) {
    return [];
  }

  const urls: string[] = [];
  const appendUniqueUrl = (value: unknown) => {
    if (typeof value !== 'string') {
      return;
    }
    const normalized = value.trim();
    if (!normalized || urls.includes(normalized)) {
      return;
    }
    urls.push(normalized);
  };

  appendUniqueUrl(product.image_url);

  const photoUrls = product.photo_urls;
  if (!photoUrls || typeof photoUrls !== 'object') {
    return urls;
  }

  const orderedKeys = getOrderedPhotoUrlKeys(photoUrls);
  orderedKeys.forEach((key) => appendUniqueUrl(photoUrls[key]));

  return urls;
};

export const getPrimaryProductImageUrl = (product?: Pick<Product, 'image_url' | 'photo_urls'>): string | undefined => {
  return getProductImageUrls(product)[0];
};
