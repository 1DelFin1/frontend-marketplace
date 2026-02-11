import { Product } from "./product";

export interface User {
  id: string;
  email: string;
  name: string;
  birthday?: string;
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

export interface CartItem {
  product_id: number;
  quantity: number;
  product?: Product; // Будем подгружать данные товара
}

export interface Cart {
  items: CartItem[];
  total: number;
}