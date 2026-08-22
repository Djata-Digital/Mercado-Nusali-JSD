export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ProductFilters extends PaginationParams {
  category?: string;
  country?: string;
  minPrice?: number;
  maxPrice?: number;
  freeShipping?: boolean;
  sellerId?: string;
  search?: string;
  badge?: string;
}

export interface OrderFilters extends PaginationParams {
  status?: string;
  buyerId?: string;
  sellerId?: string;
  startDate?: string;
  endDate?: string;
  escrowStatus?: string;
}

export interface SellerFilters extends PaginationParams {
  country?: string;
  isVerified?: boolean;
  isOfficial?: boolean;
  category?: string;
  search?: string;
}

export interface PaymentFilters extends PaginationParams {
  method?: string;
  status?: string;
  currency?: string;
}

export interface NotificationFilters extends PaginationParams {
  type?: string;
  isRead?: boolean;
}

export interface DisputeFilters extends PaginationParams {
  status?: string;
  orderId?: string;
}
