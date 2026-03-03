export interface Product {
  id: number;        // Изменил string на number (судя по схеме)
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
  name: string;
  description: string;
  price: number;
  quantity: number;
  seller_id: string;
  category_id: number;
  properties?: Record<string, unknown> | string;
}

export interface ProductUpdate {
  name?: string;
  description?: string;
  price?: number;
  quantity?: number;
  properties?: Record<string, unknown> | string;
}
