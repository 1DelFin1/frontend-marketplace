import { Product } from "./product";

export interface User {
  id: string;
  email: string;
  name: string;
  birthday?: string;
  is_seller?: boolean;
  is_active: boolean;
  is_superuser: boolean;
}

export interface UserCreate {
  email: string;
  name: string;
  password: string;
  birthday: string;
  is_active?: boolean;
  is_superuser?: boolean;
}

export interface UserUpdate {
  email?: string;
  name?: string;
  birthday?: string;
  password?: string;
}

export interface LoginForm {
  email: string;
  password: string;
}

export interface OrderItem {
  product_id: number;
  quantity: number;
  price?: number | null;
  product?: Product;
}

export interface UserOrder {
  id: string;
  status: string;
  order_items: OrderItem[];
  total_amount?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserWithOrders extends User {
  orders?: UserOrder[];
}

export interface CartItem {
  product_id: number;
  quantity: number;
  product?: Product; // Будем подгружать данные товара
}

export interface Cart {
  items: CartItem[];
  total: number;
}
