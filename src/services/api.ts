import {
  User,
  UserCreate,
  UserUpdate,
  LoginForm,
  UserOrder,
  Seller,
  SellerCreate,
  SellerUpdate,
  CartApiItem,
  OrderCreatePayload,
  OrderCreateResponse,
} from '../types/user';
import { Product, ProductCreate, ProductUpdate } from '../types/product';
import { Category, CategoryCreate } from '../types/category';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost';

class ApiService {
  private inFlightProductsRequest: Promise<Product[]> | null = null;
  private inFlightProductByIdRequests = new Map<number, Promise<Product>>();
  private inFlightUserByIdRequests = new Map<string, Promise<User>>();
  private inFlightUserByIdRawRequests = new Map<string, Promise<unknown>>();
  private inFlightCurrentSellerRequest: Promise<Seller> | null = null;
  private inFlightOrdersRequests = new Map<string, Promise<UserOrder[]>>();
  private inFlightCartRequests = new Map<string, Promise<CartApiItem[]>>();
  private inFlightSellerOrdersRequests = new Map<string, Promise<UserOrder[] | null>>();
  private inFlightSellerOrdersCountRequests = new Map<string, Promise<number | null>>();
  private ordersCache = new Map<string, { data: UserOrder[]; expiresAt: number }>();
  private cartCache = new Map<string, { data: CartApiItem[]; expiresAt: number }>();
  private productByIdCache = new Map<number, { data: Product; expiresAt: number }>();
  private missingProductByIdCache = new Map<number, { expiresAt: number }>();
  private userByIdCache = new Map<string, { data: User; expiresAt: number }>();
  private userByIdRawCache = new Map<string, { data: unknown; expiresAt: number }>();
  private sellerOrdersCache = new Map<string, { data: UserOrder[]; expiresAt: number }>();
  private sellerOrdersCountCache = new Map<string, { data: number; expiresAt: number }>();
  private currentSellerCache: { data: Seller; expiresAt: number } | null = null;

  private toFiniteCount(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value >= 0 ? Math.trunc(value) : null;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.trunc(parsed);
      }
    }

    return null;
  }

  private toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return null;
  }

  private normalizeCartItem(value: unknown): CartApiItem | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }

    const item = value as Record<string, unknown>;
    const productId = this.toFiniteNumber(item.product_id ?? item.productId ?? item.id);
    const quantity = this.toFiniteNumber(item.quantity);

    if (productId === null || productId <= 0 || quantity === null || quantity <= 0) {
      return null;
    }

    return {
      product_id: Math.trunc(productId),
      quantity: Math.trunc(quantity),
    };
  }

  private normalizeCartItems(payload: unknown): CartApiItem[] {
    const extractList = (value: unknown): unknown[] => {
      if (Array.isArray(value)) {
        return value;
      }

      if (typeof value === 'object' && value !== null) {
        const objectValue = value as Record<string, unknown>;
        if (Array.isArray(objectValue.items)) {
          return objectValue.items;
        }
        if (Array.isArray(objectValue.cart)) {
          return objectValue.cart;
        }
        if (Array.isArray(objectValue.products)) {
          return objectValue.products;
        }
      }

      return [];
    };

    return extractList(payload)
      .map((item) => this.normalizeCartItem(item))
      .filter((item): item is CartApiItem => item !== null);
  }

  private normalizeSellerOrderItem(value: unknown): UserOrder['order_items'][number] | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }

    const item = value as Record<string, unknown>;
    const productId = this.toFiniteNumber(item.product_id ?? item.productId ?? item.id);
    if (productId === null || productId <= 0) {
      return null;
    }

    const quantity = this.toFiniteNumber(item.quantity) ?? 1;
    if (quantity <= 0) {
      return null;
    }

    const price = this.toFiniteNumber(item.price);

    return {
      product_id: Math.trunc(productId),
      quantity: Math.trunc(quantity),
      price,
    };
  }

  private normalizeSellerOrder(value: unknown): UserOrder | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }

    const order = value as Record<string, unknown>;
    const rawId = order.id ?? order.order_id ?? order.orderId;
    if (typeof rawId !== 'string' && typeof rawId !== 'number') {
      return null;
    }

    const statusRaw = order.status;
    const status = typeof statusRaw === 'string' && statusRaw.trim().length > 0
      ? statusRaw.trim().toLowerCase()
      : 'unknown';

    const itemsRaw = order.order_items ?? order.orderItems ?? order.items;
    const orderItems = Array.isArray(itemsRaw)
      ? itemsRaw
        .map((item) => this.normalizeSellerOrderItem(item))
        .filter((item): item is UserOrder['order_items'][number] => item !== null)
      : [];

    const totalAmount = this.toFiniteNumber(order.total_amount ?? order.totalAmount);
    const createdAt = typeof order.created_at === 'string'
      ? order.created_at
      : (typeof order.createdAt === 'string' ? order.createdAt : undefined);
    const updatedAt = typeof order.updated_at === 'string'
      ? order.updated_at
      : (typeof order.updatedAt === 'string' ? order.updatedAt : undefined);

    return {
      id: String(rawId),
      status,
      order_items: orderItems,
      total_amount: totalAmount,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  private normalizeSellerOrdersArray(value: unknown[]): UserOrder[] {
    return value
      .map((order) => this.normalizeSellerOrder(order))
      .filter((order): order is UserOrder => order !== null);
  }

  private extractSellerOrdersFromPayload(payload: unknown, depth = 0): UserOrder[] | null {
    if (depth > 3 || payload === null || payload === undefined) {
      return null;
    }

    if (Array.isArray(payload)) {
      return this.normalizeSellerOrdersArray(payload);
    }

    if (typeof payload !== 'object') {
      return null;
    }

    const objectPayload = payload as Record<string, unknown>;
    const ordersArrayKeys = [
      'orders',
      'seller_orders',
      'sellerOrders',
      'order_history',
      'orderHistory',
      'items',
      'results',
    ];

    for (const key of ordersArrayKeys) {
      const value = objectPayload[key];
      if (Array.isArray(value)) {
        return this.normalizeSellerOrdersArray(value);
      }
    }

    const nestedKeys = ['data', 'result', 'payload', 'meta', 'seller'];
    for (const key of nestedKeys) {
      const nestedOrders = this.extractSellerOrdersFromPayload(objectPayload[key], depth + 1);
      if (nestedOrders !== null) {
        return nestedOrders;
      }
    }

    return null;
  }

  private extractOrdersCountFromPayload(payload: unknown, depth = 0): number | null {
    if (depth > 3 || payload === null || payload === undefined) {
      return null;
    }

    if (Array.isArray(payload)) {
      return payload.length;
    }

    const directCount = this.toFiniteCount(payload);
    if (directCount !== null) {
      return directCount;
    }

    if (typeof payload !== 'object') {
      return null;
    }

    const objectPayload = payload as Record<string, unknown>;
    const directCountKeys = [
      'orders_count',
      'ordersCount',
      'order_count',
      'orderCount',
      'count',
      'total_count',
      'totalCount',
      'total',
    ];

    for (const key of directCountKeys) {
      const count = this.toFiniteCount(objectPayload[key]);
      if (count !== null) {
        return count;
      }
    }

    const directOrdersArrays = [
      'orders',
      'seller_orders',
      'sellerOrders',
      'order_history',
      'orderHistory',
      'items',
      'results',
    ];

    for (const key of directOrdersArrays) {
      const value = objectPayload[key];
      if (Array.isArray(value)) {
        return value.length;
      }
    }

    for (const [key, value] of Object.entries(objectPayload)) {
      if (Array.isArray(value) && key.toLowerCase().includes('order')) {
        return value.length;
      }
    }

    const nestedKeys = ['data', 'result', 'payload', 'meta', 'seller'];
    for (const key of nestedKeys) {
      const nestedCount = this.extractOrdersCountFromPayload(objectPayload[key], depth + 1);
      if (nestedCount !== null) {
        return nestedCount;
      }
    }

    return null;
  }

  private async requestOrNull<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T | null> {
    try {
      return await this.request<T>(endpoint, options);
    } catch {
      return null;
    }
  }

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
    const cacheKey = userId;
    const now = Date.now();
    const cacheTtlMs = 15_000;

    const cached = this.userByIdCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const inFlight = this.inFlightUserByIdRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = this.request<User>(`/users/${userId}`, {
      credentials: 'include',
    })
      .then((user) => {
        this.userByIdCache.set(cacheKey, {
          data: user,
          expiresAt: Date.now() + cacheTtlMs,
        });
        return user;
      })
      .finally(() => {
        this.inFlightUserByIdRequests.delete(cacheKey);
      });

    this.inFlightUserByIdRequests.set(cacheKey, requestPromise);
    return requestPromise;
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

  async uploadCurrentSellerPhoto(file: File): Promise<Seller> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/sellers/me/photo`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new Error('Invalid seller payload');
    }

    this.currentSellerCache = {
      data: payload as Seller,
      expiresAt: Date.now() + 15_000,
    };
    this.inFlightCurrentSellerRequest = null;
    return payload as Seller;
  }

  async getUserByIdRaw(userId: string): Promise<unknown> {
    const cacheKey = userId;
    const now = Date.now();
    const cacheTtlMs = 15_000;

    const cached = this.userByIdRawCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const inFlight = this.inFlightUserByIdRawRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = this.request<unknown>(`/users/${userId}`, {
      credentials: 'include',
    })
      .then((payload) => {
        this.userByIdRawCache.set(cacheKey, {
          data: payload,
          expiresAt: Date.now() + cacheTtlMs,
        });
        return payload;
      })
      .finally(() => {
        this.inFlightUserByIdRawRequests.delete(cacheKey);
      });

    this.inFlightUserByIdRawRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  async getUserByEmail(email: string): Promise<User> {
    return this.request(`/users/${email}`, {
      credentials: 'include',
    });
  }

  async uploadCurrentUserPhoto(file: File): Promise<User> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/users/me/photo`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new Error('Invalid user payload');
    }

    const userId = (payload as { id?: unknown }).id;
    if (typeof userId === 'string') {
      const cacheTtlMs = 15_000;
      this.userByIdCache.set(userId, {
        data: payload as User,
        expiresAt: Date.now() + cacheTtlMs,
      });
      this.userByIdRawCache.set(userId, {
        data: payload,
        expiresAt: Date.now() + cacheTtlMs,
      });
      this.inFlightUserByIdRequests.delete(userId);
      this.inFlightUserByIdRawRequests.delete(userId);
    } else {
      this.userByIdCache.clear();
      this.userByIdRawCache.clear();
      this.inFlightUserByIdRequests.clear();
      this.inFlightUserByIdRawRequests.clear();
    }

    return payload as User;
  }

  async updateUser(userId: string, userData: UserUpdate): Promise<User> {
    const response = await this.request<User>(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(userData),
      credentials: 'include',
    });

    this.userByIdCache.delete(userId);
    this.userByIdRawCache.delete(userId);
    this.inFlightUserByIdRequests.delete(userId);
    this.inFlightUserByIdRawRequests.delete(userId);

    return response;
  }

  async deleteUser(userId: string): Promise<void> {
    await this.request(`/users/${userId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    this.userByIdCache.delete(userId);
    this.userByIdRawCache.delete(userId);
    this.inFlightUserByIdRequests.delete(userId);
    this.inFlightUserByIdRawRequests.delete(userId);
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

  async createOrder(orderData: OrderCreatePayload): Promise<OrderCreateResponse> {
    const response = await this.request<OrderCreateResponse>('/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
      credentials: 'include',
    });

    this.ordersCache.clear();
    this.inFlightOrdersRequests.clear();
    this.sellerOrdersCache.clear();
    this.sellerOrdersCountCache.clear();

    return response;
  }

  async getOrderStatusById(orderId: string): Promise<string | null> {
    const payload = await this.requestOrNull<unknown>(`/orders/${orderId}`, {
      credentials: 'include',
    });

    if (typeof payload !== 'object' || payload === null) {
      return null;
    }

    const status = (payload as Record<string, unknown>).status;
    if (typeof status !== 'string' || status.trim().length === 0) {
      return null;
    }

    return status.trim().toLowerCase();
  }

  async confirmOrder(orderId: string): Promise<{ ok: boolean; order_id: string }> {
    const response = await this.request<{ ok: boolean; order_id: string }>(`/orders/${orderId}/confirm`, {
      method: 'POST',
      credentials: 'include',
    });

    this.ordersCache.clear();
    this.inFlightOrdersRequests.clear();
    this.sellerOrdersCache.clear();
    this.sellerOrdersCountCache.clear();

    return response;
  }

  async getCartByUserId(userId: string, forceRefresh = false): Promise<CartApiItem[]> {
    const cacheKey = userId;
    const now = Date.now();
    const cacheTtlMs = 5_000;

    if (!forceRefresh) {
      const cached = this.cartCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }
    }

    const inFlight = this.inFlightCartRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = this.request<unknown>(`/cart/${userId}`, {
      credentials: 'include',
    })
      .then((payload) => this.normalizeCartItems(payload))
      .then((items) => {
        this.cartCache.set(cacheKey, {
          data: items,
          expiresAt: Date.now() + cacheTtlMs,
        });
        return items;
      })
      .finally(() => {
        this.inFlightCartRequests.delete(cacheKey);
      });

    this.inFlightCartRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  async setCartByUserId(userId: string, items: CartApiItem[]): Promise<void> {
    const cacheTtlMs = 5_000;
    const normalizedItems = items
      .map((item) => this.normalizeCartItem(item))
      .filter((item): item is CartApiItem => item !== null);

    await this.request(`/cart/${userId}`, {
      method: 'POST',
      body: JSON.stringify(normalizedItems),
      credentials: 'include',
    });

    this.cartCache.set(userId, {
      data: normalizedItems,
      expiresAt: Date.now() + cacheTtlMs,
    });
  }

  async getSellerOrders(sellerId: string, forceRefresh = false): Promise<UserOrder[] | null> {
    const cacheKey = sellerId;
    const now = Date.now();
    const cacheTtlMs = 15_000;

    if (!forceRefresh) {
      const cached = this.sellerOrdersCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }
    }

    const inFlight = this.inFlightSellerOrdersRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = (async () => {
      const sellerOrderEndpoints = [
        `/orders/sellers/${sellerId}`,
        `/sellers/${sellerId}/orders`,
        `/orders/seller/${sellerId}`,
      ];

      for (const endpoint of sellerOrderEndpoints) {
        const payload = await this.requestOrNull<unknown>(endpoint, {
          credentials: 'include',
        });
        if (payload === null) {
          continue;
        }

        const orders = this.extractSellerOrdersFromPayload(payload);
        if (orders !== null) {
          return orders;
        }
      }

      return null;
    })()
      .then((orders) => {
        if (orders !== null) {
          this.sellerOrdersCache.set(cacheKey, {
            data: orders,
            expiresAt: Date.now() + cacheTtlMs,
          });
        }
        return orders;
      })
      .finally(() => {
        this.inFlightSellerOrdersRequests.delete(cacheKey);
      });

    this.inFlightSellerOrdersRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  async getSellerOrdersCount(
    sellerId: string,
    fallbackOrdersCount: number | null = null,
    forceRefresh = false
  ): Promise<number | null> {
    const cacheKey = sellerId;
    const now = Date.now();
    const cacheTtlMs = 15_000;
    const hasFallback = typeof fallbackOrdersCount === 'number';

    if (!forceRefresh) {
      const cachedOrders = this.sellerOrdersCache.get(cacheKey);
      if (cachedOrders && cachedOrders.expiresAt > now) {
        return cachedOrders.data.length;
      }

      const cached = this.sellerOrdersCountCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }
    }

    const inFlight = this.inFlightSellerOrdersCountRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = (async () => {
      const sellerOrders = await this.getSellerOrders(sellerId, forceRefresh);
      if (sellerOrders !== null) {
        return sellerOrders.length;
      }

      const sellerOrderEndpoints = [
        `/orders/sellers/${sellerId}`,
        `/sellers/${sellerId}/orders`,
        `/orders/seller/${sellerId}`,
      ];

      for (const endpoint of sellerOrderEndpoints) {
        const payload = await this.requestOrNull<unknown>(endpoint, {
          credentials: 'include',
        });
        if (payload === null) {
          continue;
        }

        const extractedCount = this.extractOrdersCountFromPayload(payload);
        if (extractedCount !== null) {
          return extractedCount;
        }
      }

      if (hasFallback) {
        return fallbackOrdersCount;
      }

      try {
        const seller = await this.getSellerById(sellerId);
        if (typeof seller.orders_count === 'number') {
          return seller.orders_count;
        }
      } catch {
        return null;
      }

      return null;
    })()
      .then((ordersCount) => {
        if (typeof ordersCount === 'number') {
          this.sellerOrdersCountCache.set(cacheKey, {
            data: ordersCount,
            expiresAt: Date.now() + cacheTtlMs,
          });
        }
        return ordersCount;
      })
      .finally(() => {
        this.inFlightSellerOrdersCountRequests.delete(cacheKey);
      });

    this.inFlightSellerOrdersCountRequests.set(cacheKey, requestPromise);
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

  async getProductById(productId: number, forceRefresh = false): Promise<Product> {
    const cacheKey = Math.trunc(productId);
    const now = Date.now();
    const cacheTtlMs = 30_000;
    const missingCacheTtlMs = 30_000;

    if (!forceRefresh) {
      const missingCached = this.missingProductByIdCache.get(cacheKey);
      if (missingCached && missingCached.expiresAt > now) {
        throw new Error(`HTTP error! status: 404`);
      }

      const cached = this.productByIdCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }
    }

    const inFlight = this.inFlightProductByIdRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = this.request<Product>(`/products/${cacheKey}`, {
      credentials: 'include',
    })
      .then((product) => {
        this.missingProductByIdCache.delete(cacheKey);
        this.productByIdCache.set(cacheKey, {
          data: product,
          expiresAt: Date.now() + cacheTtlMs,
        });
        return product;
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('status: 404')) {
          this.missingProductByIdCache.set(cacheKey, {
            expiresAt: Date.now() + missingCacheTtlMs,
          });
        }
        throw error;
      })
      .finally(() => {
        this.inFlightProductByIdRequests.delete(cacheKey);
      });

    this.inFlightProductByIdRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  async uploadProductPhotos(files: File[], productUuid: string): Promise<Record<string, string>> {
    if (files.length === 0) {
      return {};
    }

    const formData = new FormData();
    formData.append('product_uuid', productUuid);
    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await fetch(`${API_BASE_URL}/products/photos/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const payload: unknown = await response.json();
    const data = (
      typeof payload === 'object'
      && payload !== null
      && 'photo_urls' in payload
      && typeof (payload as { photo_urls?: unknown }).photo_urls === 'object'
      && (payload as { photo_urls?: unknown }).photo_urls !== null
    )
      ? (payload as { photo_urls: Record<string, unknown> }).photo_urls
      : payload;

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return {};
    }

    const result: Record<string, string> = {};
    Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        result[key] = value.trim();
      }
    });

    return result;
  }

  async createProduct(productData: ProductCreate): Promise<Product> {
    const created = await this.request<Product>('/products', {
      method: 'POST',
      body: JSON.stringify(productData),
      credentials: 'include',
    });

    this.productByIdCache.clear();
    this.missingProductByIdCache.clear();
    this.inFlightProductByIdRequests.clear();
    return created;
  }

  async updateProduct(productId: number, productData: ProductUpdate): Promise<Product> {
    const updated = await this.request<Product>(`/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify(productData),
      credentials: 'include',
    });

    this.productByIdCache.set(Math.trunc(productId), {
      data: updated,
      expiresAt: Date.now() + 30_000,
    });
    this.missingProductByIdCache.delete(Math.trunc(productId));
    return updated;
  }

  async deleteProduct(productId: number): Promise<void> {
    await this.request(`/products/${productId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    this.productByIdCache.delete(Math.trunc(productId));
    this.missingProductByIdCache.set(Math.trunc(productId), {
      expiresAt: Date.now() + 30_000,
    });
    this.inFlightProductByIdRequests.delete(Math.trunc(productId));
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
