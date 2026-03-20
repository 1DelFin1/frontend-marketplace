import { Product } from "./product";

export type AccountType = "user" | "seller" | "admin";

export interface User {
  id: string;
  email: string;
  name: string;
  birthday?: string;
  photo_url?: string;
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

export interface Seller {
  id: string;
  email: string;
  name: string;
  birthday?: string;
  photo_url?: string;
  rating?: number;
  orders_count?: number;
  is_active: boolean;
}

export interface SellerCreate {
  email: string;
  name: string;
  password: string;
  birthday: string;
  is_active?: boolean;
}

export interface SellerUpdate {
  email?: string;
  name?: string;
  birthday?: string;
  password?: string;
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

export interface OrderCreateItem {
  product_id: number;
  quantity: number;
}

export interface OrderCreatePayload {
  user_id: string;
  order_items: OrderCreateItem[];
}

export interface OrderCreateResponse {
  status: string;
  order_id: string;
}

export interface UserWithOrders extends User {
  orders?: UserOrder[];
}

export interface CartItem {
  product_id: number;
  quantity: number;
  product?: Product; // Будем подгружать данные товара
}

export interface CartApiItem {
  product_id: number;
  quantity: number;
}

export interface FavoriteApiItem {
  product_id: number;
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
}
