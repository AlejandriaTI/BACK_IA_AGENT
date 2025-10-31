export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          role: 'user' | 'assistant';
          content: string;
          embedding: number[];
          created_at: string | null;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: 'user' | 'assistant';
          content: string;
          embedding: number[];
          created_at?: string | null;
        };
        Update: {
          id?: string;
          session_id?: string;
          role?: 'user' | 'assistant';
          content?: string;
          embedding?: number[];
          created_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_chat_messages: {
        Args: {
          query_embedding: number[];
          match_count: number;
        };
        Returns: {
          id: string;
          session_id: string;
          role: 'user' | 'assistant';
          content: string;
          embedding: number[];
          similarity: number; // valor devuelto por el ranking semántico
        }[];
      };
    };
    Enums: Record<string, never>;
  };
}
