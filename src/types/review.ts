export interface Review {
  id: number;
  user_id: string;
  product_id: number;
  text: string;
  rating: number;
  created_at?: string;
  updated_at?: string;
  user_name?: string;
}

export interface ReviewCreatePayload {
  user_id: string;
  product_id: number;
  text: string;
  rating: number;
}
