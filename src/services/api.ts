import { User, UserCreate, UserUpdate, LoginForm, UserOrder, Seller, SellerCreate, SellerUpdate } from '../types/user';
import { Product, ProductCreate, ProductUpdate } from '../types/product';
import { Category, CategoryCreate } from '../types/category';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost';

class ApiService {
  private inFlightProductsRequest: Promise<Product[]> | null = null;
  private inFlightCurrentSellerRequest: Promise<Seller> | null = null;
  private inFlightOrdersRequests = new Map<string, Promise<UserOrder[]>>();
  private ordersCache = new Map<string, { data: UserOrder[]; expiresAt: number }>();
  private currentSellerCache: { data: Seller; expiresAt: number } | null = null;

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

  async createSeller(sellerData: SellerCreate): Promise<Seller> {
    return this.request('/sellers', {
      method: 'POST',
      body: JSON.stringify(sellerData),
      credentials: 'include',
    });
  }

  async getUserById(userId: string): Promise<User> {
    return this.request(`/users/${userId}`, {
      credentials: 'include',
    });
  }

  async getCurrentSeller(forceRefresh = false): Promise<Seller> {
    const now = Date.now();
    const cacheTtlMs = 15_000;

    if (!forceRefresh && this.currentSellerCache && this.currentSellerCache.expiresAt > now) {
      return this.currentSellerCache.data;
    }

    if (this.inFlightCurrentSellerRequest) {
      return this.inFlightCurrentSellerRequest;
    }

    this.inFlightCurrentSellerRequest = this.request<Seller>('/sellers/me', {
      credentials: 'include',
    })
      .then((seller) => {
        this.currentSellerCache = {
          data: seller,
          expiresAt: Date.now() + cacheTtlMs,
        };
        return seller;
      })
      .finally(() => {
        this.inFlightCurrentSellerRequest = null;
      });

    return this.inFlightCurrentSellerRequest;
  }

  async getSellerById(sellerId: string): Promise<Seller> {
    return this.request(`/sellers/${sellerId}`, {
      credentials: 'include',
    });
  }

  async updateSeller(sellerId: string, sellerData: SellerUpdate): Promise<Seller> {
    const response = await this.request<Seller>(`/sellers/${sellerId}`, {
      method: 'PATCH',
      body: JSON.stringify(sellerData),
      credentials: 'include',
    });

    this.currentSellerCache = null;
    return response;
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

  async getOrdersByUserId(userId: string, forceRefresh = false): Promise<UserOrder[]> {
    const cacheKey = userId;
    const now = Date.now();
    const cacheTtlMs = 15_000;

    if (!forceRefresh) {
      const cached = this.ordersCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }
    }

    const inFlight = this.inFlightOrdersRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = this.request<UserOrder[]>(`/orders/users/${userId}`, {
      credentials: 'include',
    })
      .then((orders) => {
        this.ordersCache.set(cacheKey, {
          data: orders,
          expiresAt: Date.now() + cacheTtlMs,
        });
        return orders;
      })
      .finally(() => {
        this.inFlightOrdersRequests.delete(cacheKey);
      });

    this.inFlightOrdersRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  async getProducts(): Promise<Product[]> {
    if (this.inFlightProductsRequest) {
      return this.inFlightProductsRequest;
    }

    this.inFlightProductsRequest = this.request<Product[]>('/products', {
      credentials: 'include',
    }).finally(() => {
      this.inFlightProductsRequest = null;
    });

    return this.inFlightProductsRequest;
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

  async getCategories(): Promise<Category[]> {
    return this.request('/categories', {
      credentials: 'include',
    });
  }

  async createCategory(categoryData: CategoryCreate): Promise<Category> {
    return this.request('/categories', {
      method: 'POST',
      body: JSON.stringify(categoryData),
      credentials: 'include',
    });
  }
}

export const apiService = new ApiService();
