export interface AIResponse {
  content:
    | string
    | Buffer
    | {
        isAudio: boolean;
        message?: string;
        mimeType: string;
        base64: string;
      };
  registro: RegistroIA;
}

export interface RegistroIA {
  tipo:
    | 'FRIO'
    | 'TIBIO'
    | 'lead_educativo'
    | 'trabajo_puntual'
    | 'solicitud-documento-inmediata'
    | 'solicitud-documento-cotizacion';
  etapa?: string;
  fecha?: number;
  sessionId?: string;
  prompt?: string;
  respuestaIA?: string;
}

export interface KommoMessageAdd {
  id: string;
  chat_id: string;
  talk_id: string;
  contact_id: string;
  text: string | null;
  text_original?: string | null;
  created_at: string;
  element_type?: string;
  entity_type?: string;
  element_id?: string;
  entity_id?: string;
  type: string;
  origin: string;
  author?: {
    id: string;
    type: string;
    name: string;
  };
  attachment?: {
    type: string;
    link: string;
    file_name: string;
  } | null;
}

export interface KommoWebhookBody {
  account?: {
    id: string;
    subdomain: string;
  };

  message?: {
    add?: KommoMessageAdd[];
  };

  talk?: {
    update?: Array<{
      talk_id: string;
      chat_id: string;
      entity_id: string;
      contact_id: string;
    }>;
  };
}
