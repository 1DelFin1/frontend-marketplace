import { User, UserCreate, UserUpdate, LoginForm, UserOrder } from '../types/user';
import { Product, ProductCreate, ProductUpdate } from '../types/product';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost';

class ApiService {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Auth methods
  async login(formData: LoginForm): Promise<void> {
    const formDataEncoded = new URLSearchParams();
    formDataEncoded.append('email', formData.email);
    formDataEncoded.append('password', formData.password);

    await this.request('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formDataEncoded.toString(),
      credentials: 'include',
    });
  }

  async logout(): Promise<void> {
    await this.request('/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  }

  async getCurrentUser(): Promise<User> {
    return this.request('/users/me', {
      credentials: 'include',
    });
  }

  async createUser(userData: UserCreate): Promise<User> {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
      credentials: 'include',
    });
  }

  async getUserById(userId: string): Promise<User> {
    return this.request(`/users/${userId}`, {
      credentials: 'include',
    });
  }

  async getUserByIdRaw(userId: string): Promise<unknown> {
    return this.request(`/users/${userId}`, {
      credentials: 'include',
    });
  }

  async getUserByEmail(email: string): Promise<User> {
    return this.request(`/users/${email}`, {
      credentials: 'include',
    });
  }

  async updateUser(userId: string, userData: UserUpdate): Promise<User> {
    return this.request(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(userData),
      credentials: 'include',
    });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.request(`/users/${userId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  }

  async getOrdersByUserId(userId: string): Promise<UserOrder[]> {
    return this.request(`/orders/users/${userId}`, {
      credentials: 'include',
    });
  }

  async getProducts(): Promise<Product[]> {
    return this.request('/products', {
      credentials: 'include',
    });
  }

  async getProductById(productId: number): Promise<Product> {
    return this.request(`/products/${productId}`, {
      credentials: 'include',
    });
  }

  async createProduct(productData: ProductCreate): Promise<Product> {
    return this.request('/products', {
      method: 'POST',
      body: JSON.stringify(productData),
      credentials: 'include',
    });
  }

  async updateProduct(productId: number, productData: ProductUpdate): Promise<Product> {
    return this.request(`/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify(productData),
      credentials: 'include',
    });
  }

  async deleteProduct(productId: number): Promise<void> {
    await this.request(`/products/${productId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  }
}

export const apiService = new ApiService();
