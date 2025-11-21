import { Injectable } from '@nestjs/common';
import { PIPELINES } from './config/pipeline.config';
import { AIResponse } from './config/ia.config.response';
import { OllamaService } from 'src/ollama/ollama.service';
import axios, { AxiosError, AxiosResponse } from 'axios';
import FormData from 'form-data';
import { Buffer } from 'buffer';
import * as crypto from 'crypto';
import { KommoRequest } from '../ollama/types/kommo.response';

interface KommoLeadResponse {
  id: number;
  _embedded?: {
    tags?: { name: string }[];
  };
}

interface WebhookBody {
  lead_id: string;
  status: string;
  [key: string]: any;
}

interface KommoLead {
  id: number;
  pipeline_id: number;
  status_id: number;
  [key: string]: unknown;
}

interface WebhookResponse {
  success: boolean;
  message?: string;
}

interface KommoFileUploadResponse {
  file_uuid: string;
}

interface KommoAccountResponse {
  id: number;
  name: string;
}

interface ConnectChannelResponse {
  account_id: string;
  scope_id: string;
  title: string;
  hook_api_version: string;
  is_time_window_disabled: boolean;
}

@Injectable()
export class KommoService {
  private readonly KOMMO_DOMAIN = process.env.KOMMO_SUBDOMAIN;
  private readonly API_URL = `https://${this.KOMMO_DOMAIN}.kommo.com/api/v4`;

  // 🔥 Token de larga duración (no expira por meses)
  private readonly accessToken = process.env.KOMMO_KEY_DURATION;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  // Amojo Channel Config
  private readonly channelId = '0c407327-bf9e-48b4-ae84-bbc646f4ca4d';
  private readonly secret = 'fddada3260991dce2648c58f848824db1d2b452d';
  private readonly accountId = '80e096d0-da4d-425d-956e-9f51bd729816';

  constructor(private readonly ollamaService: OllamaService) {
    this.baseUrl = `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com`;

    if (!process.env.KOMMO_SUBDOMAIN) {
      console.error('❌ ERROR: KOMMO_SUBDOMAIN no está definido en .env');
    }

    if (!process.env.KOMMO_KEY_DURATION) {
      console.error('❌ ERROR: KOMMO_KEY_DURATION no está definido en .env');
    }

    console.log('🔌 KommoService inicializado con API URL:', this.API_URL);

    this.headers = {
      Authorization: `Bearer ${process.env.KOMMO_KEY_DURATION}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Creates authentication headers for Amojo API requests
   */
  private createAmojoHeaders(
    method: string,
    path: string,
    bodyString: string,
  ): Record<string, string> {
    const contentMD5 = crypto
      .createHash('md5')
      .update(bodyString, 'utf8')
      .digest('hex')
      .toLowerCase();

    const date = new Date().toUTCString();
    const contentType = 'application/json';

    // Order: Method, MD5, Content-Type, Date, Path
    const stringToSign = [method, contentMD5, contentType, date, path].join(
      '\n',
    );

    const signature = crypto
      .createHmac('sha1', this.secret)
      .update(stringToSign, 'utf8')
      .digest('hex'); // Lowercase hex

    return {
      'Content-Type': contentType,
      'Content-MD5': contentMD5,
      'X-Signature': signature,
      Date: date,
    };
  }

  async connectChannel(): Promise<ConnectChannelResponse> {
    const method = 'POST';
    const path = `/v2/origin/custom/${this.channelId}/connect`;

    const body = {
      account_id: this.accountId,
      hook_api_version: 'v2',
      is_time_window_disabled: true,
      title: 'Alexandria AI',
    };

    const bodyString = JSON.stringify(body);
    const headers = this.createAmojoHeaders(method, path, bodyString);

    console.log('📦 BODY STRING =>', bodyString);
    console.log('🔸 Content-MD5 =>', headers['Content-MD5']);
    console.log('📅 Date =>', headers['Date']);
    console.log('🔑 Signature =>', headers['X-Signature']);
    console.log('🧩 Headers =>', headers);

    const url = `https://amojo.kommo.com${path}`;

    try {
      const res = await axios.post(url, bodyString, {
        headers,
        transformRequest: (d: unknown) => d, // no tocar body
        timeout: 8000,
        validateStatus: () => true,
      });

      console.log('📨 RAW RESPONSE STATUS =>', res.status);
      console.log('📨 RAW RESPONSE DATA =>', res.data);

      return res.data as ConnectChannelResponse;
    } catch (error) {
      console.error('❌ ERROR AXIOS =>', error);
      throw error;
    }
  }

  async testAccess() {
    const url = `https://${this.KOMMO_DOMAIN}.kommo.com/api/v4/account`;

    try {
      const response: AxiosResponse<KommoAccountResponse> = await axios.get(
        url,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return {
        success: true,
        message: 'ACCESO OK ✔',
        account: response.data,
      };
    } catch (err) {
      const error = err as AxiosError<unknown>;

      if (axios.isAxiosError(error)) {
        return {
          success: false,
          message: '❌ ERROR DE ACCESO',
          error: error.response?.data ?? error.message,
        };
      }

      return {
        success: false,
        message: '❌ ERROR NO CONTROLADO',
        error: String(err),
      };
    }
  }

  // 🧾 Crear nota en un lead
  async createNoteForLead(leadId: string, text: string): Promise<unknown> {
    if (!this.accessToken) throw new Error('Token no disponible.');

    const body = [
      {
        entity_id: leadId,
        note_type: 'common',
        params: { text },
      },
    ];

    try {
      const response = await axios.post(`${this.API_URL}/leads/notes`, body, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      console.log('✅ Nota creada en lead:', response.data);
      return response.data;
    } catch (err) {
      const error = err as AxiosError;
      console.error(
        '❌ Error al crear nota:',
        error.response?.data ?? error.message,
      );
      throw error;
    }
  }

  async moveLeadToPipeline(
    leadId: number,
    pipelineId: number,
    statusId: number,
  ) {
    try {
      const payload = [
        {
          id: Number(leadId),
          pipeline_id: Number(pipelineId),
          status_id: Number(statusId),
        },
      ];

      console.log('➡️ Moviendo lead con:', payload);

      const res = await axios.patch(`${this.API_URL}/leads`, payload, {
        headers: this.headers,
      });

      console.log('✅ Lead movido correctamente');
      return res.data as Record<string, unknown>;
    } catch (error: unknown) {
      const err = error as AxiosError<any>;
      console.error(
        '❌ Error al mover lead:',
        err.response?.data ?? err.message,
      );
      throw new Error('No se pudo mover el lead');
    }
  }

  // 🏷️ Verificar si el lead tiene STOP
  async hasStopTag(leadId: number): Promise<boolean> {
    const response: AxiosResponse<KommoLeadResponse> = await axios.get(
      `${this.API_URL}/leads/${leadId}`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } },
    );

    const tags = response.data._embedded?.tags ?? [];
    const hasStop = tags.some(
      (tag: { name: string }) => tag.name.toUpperCase() === 'STOP',
    );

    console.log(`🛑 Lead ${leadId} tiene STOP: ${hasStop}`);
    return hasStop;
  }

  // 📋 Obtener leads
  async getLeads(): Promise<unknown> {
    const response = await axios.get(`${this.API_URL}/leads`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    return response.data;
  }

  // ✅ Enviar AUDIO REAL a Kommo (subir → obtener UUID → enviar)
  async sendRealAudioMessage(
    conversationId: string,
    mimeType: string,
    base64: string,
  ): Promise<void> {
    if (!this.accessToken) throw new Error('Token no disponible.');

    const audioBuffer = Buffer.from(base64, 'base64');

    // ✅ Subir archivo a Kommo
    const form = new FormData();
    form.append('file', audioBuffer, {
      filename: 'audio.mp3',
      contentType: mimeType,
    });

    const upload = await axios.post<KommoFileUploadResponse>(
      `${this.API_URL}/files`,
      form,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...form.getHeaders(),
        },
      },
    );

    const file_uuid = upload.data.file_uuid;

    console.log('✅ Audio subido, UUID:', file_uuid);

    // ✅ Enviar mensaje de audio real
    const body = {
      message: {
        type: 'audio',
        file_uuid,
      },
      conversation_id: conversationId,
    };

    await axios.post(`${this.API_URL}/chats/messages`, body, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('✅ Audio enviado a Kommo como mensaje real');
  }

  async sendChatMessage(conversationId: string, text: string): Promise<void> {
    // Usamos la API de Chats (Amojo) para enviar el mensaje
    const method = 'POST';
    const path = `/v2/origin/custom/${this.channelId}_${this.accountId}`;
    const url = `https://amojo.kommo.com${path}`;

    const timestamp = Math.floor(Date.now() / 1000);
    const msec_timestamp = Date.now();
    const msgid = crypto.randomUUID();

    const body = {
      event_type: 'new_message',
      payload: {
        timestamp,
        msec_timestamp,
        msgid,
        conversation_id: conversationId,
        sender: {
          name: 'Alexandria AI',
          ref_id: this.accountId, // Mismo account_id que en connect
        },
        message: {
          type: 'text',
          text: text.replace(/<[^>]*>?/gm, ''), // Limpiar HTML si viene
        },
      },
    };

    const bodyString = JSON.stringify(body);
    const headers = this.createAmojoHeaders(method, path, bodyString);

    console.log('💬 Enviando mensaje a Amojo:', url);

    try {
      const res = await axios.post(url, bodyString, {
        headers,
        transformRequest: (d: unknown) => d,
      });

      console.log('✅ Mensaje enviado a Amojo. Status:', res.status);
    } catch (err) {
      const error = err as AxiosError;
      console.error(
        '❌ Error enviando mensaje a Amojo:',
        error.response?.data ?? error.message,
      );
      throw error;
    }
  }

  async moverSegunClasificacion(
    leadId: number,
    tipo: 'FRIO' | 'TIBIO' | 'COTIZACION' | 'MARKETING',
  ): Promise<void> {
    const pipelineId = PIPELINES.PRUEBA.ID;

    const mapa: Record<string, number> = {
      FRIO: PIPELINES.PRUEBA.FRIO,
      TIBIO: PIPELINES.PRUEBA.TIBIO,
      COTIZACION: PIPELINES.PRUEBA.COTIZACION,
      MARKETING: PIPELINES.PRUEBA.MARKETING,
    };

    const statusId = mapa[tipo];

    await this.moveLeadToPipeline(Number(leadId), pipelineId, statusId);
  }

  async getLeadById(leadId: number): Promise<KommoLead> {
    const url = `${this.API_URL}/leads/${leadId}`;

    const res = await axios.get<KommoLead>(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    return res.data;
  }

  async processAIMessage(
    prompt: string,
    sessionId: string,
    conversationId: string,
    leadId: number,
  ): Promise<{ success: boolean; type: string }> {
    try {
      const tieneStop = await this.hasStopTag(leadId);
      if (tieneStop) {
        console.log(`⛔ Lead ${leadId} tiene STOP, no respondemos.`);
        return { success: true, type: 'ignored' };
      }

      const aiResp: AIResponse = await this.ollamaService.chat(
        {
          sessionId,
          kommo: true,
          conversationId,
          leadId,
        } as KommoRequest,
        prompt,
      );

      console.log('🧪 RESPUESTA IA:', JSON.stringify(aiResp, null, 2));

      const { content, registro } = aiResp;
      const tipoIA = registro?.tipo;

      let textoFinal: string | null = null;
      let audioFinal: { mimeType: string; base64: string } | null = null;

      if (typeof content === 'string') {
        textoFinal = content.trim();
      } else if (
        typeof content === 'object' &&
        content !== null &&
        'isAudio' in content &&
        content.isAudio === true
      ) {
        audioFinal = {
          mimeType: content.mimeType,
          base64: content.base64,
        };

        if (content.message) textoFinal = content.message;
      } else if (Buffer.isBuffer(content)) {
        textoFinal = content.toString('utf8');
      }

      console.log('📝 TEXTO NORMALIZADO:', textoFinal ?? '(ninguno)');
      console.log('🎧 AUDIO DETECTADO:', audioFinal ? true : false);

      // Seguridad: nunca responder vacío
      if (!textoFinal && !audioFinal) {
        console.warn(
          '⚠️ La IA no devolvió texto ni audio. No se puede responder.',
        );
        return { success: false, type: 'empty' };
      }

      let tipoPipeline: 'FRIO' | 'TIBIO' | 'COTIZACION' | 'MARKETING' = 'FRIO';

      switch (tipoIA) {
        case 'TIBIO':
          tipoPipeline = 'TIBIO';
          break;
        case 'lead_educativo':
          tipoPipeline = 'MARKETING';
          break;
        case 'trabajo_puntual':
        case 'solicitud-documento-inmediata':
        case 'solicitud-documento-cotizacion':
          tipoPipeline = 'COTIZACION';
          break;
        default:
          tipoPipeline = 'FRIO';
      }

      await this.moverSegunClasificacion(leadId, tipoPipeline);

      // Si deja de ser FRIO → poner STOP
      if (tipoPipeline !== 'FRIO') {
        console.log('🛑 El lead dejó de ser FRÍO → agregando STOP');
        await this.addStopTag(leadId);
      }

      if (textoFinal) {
        console.log('💬 Enviando MENSAJE DE TEXTO a Kommo:', textoFinal);

        try {
          await this.sendChatMessage(conversationId, `<p>${textoFinal}</p>`);
        } catch (err) {
          console.error('❌ Error enviando mensaje de texto a Kommo:', err);
          return { success: false, type: 'text-error' };
        }

        // Si también hay audio → lo enviamos después
        if (audioFinal) {
          try {
            console.log('🎧 Enviando AUDIO a Kommo...');
            await this.sendRealAudioMessage(
              conversationId,
              audioFinal.mimeType,
              audioFinal.base64,
            );
          } catch (err) {
            console.error('❌ Error enviando audio a Kommo:', err);
          }

          return { success: true, type: 'text+audio' };
        }

        return { success: true, type: 'text' };
      }

      // B) Si NO hay texto, pero sí audio
      if (audioFinal) {
        console.log('🎧 Enviando SOLO AUDIO a Kommo...');

        try {
          await this.sendRealAudioMessage(
            conversationId,
            audioFinal.mimeType,
            audioFinal.base64,
          );
        } catch (err) {
          console.error('❌ Error enviando audio a Kommo:', err);
          return { success: false, type: 'audio-error' };
        }

        return { success: true, type: 'audio' };
      }

      // Fallback
      return { success: false, type: 'unknown' };
    } catch (error) {
      console.error('❌ Error en processAIMessage:', error);
      return { success: false, type: 'fatal' };
    }
  }

  // 🧩 Manejo del webhook
  async handleWebhook(data: WebhookBody): Promise<WebhookResponse> {
    console.log('📩 Webhook recibido:', data);
    await this.saveLeadData(data);
    return { success: true };
  }

  async addStopTag(leadId: number): Promise<unknown> {
    if (!this.accessToken) {
      throw new Error(
        '❌ Token no disponible. Ejecutá authenticate() primero.',
      );
    }

    const body = [
      {
        id: leadId,
        _embedded: {
          tags: [{ name: 'STOP' }], // 🏷️ etiqueta STOP
        },
      },
    ];

    try {
      const response = await axios.patch<{
        _embedded?: { tags?: { name: string }[] };
      }>(`${this.API_URL}/leads`, body, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      console.log(`🚫 Etiqueta STOP agregada al lead ${leadId}`);
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        console.error(
          '❌ Error al agregar STOP:',
          error.response?.data ?? error.message,
        );
        throw new Error(
          `Error al agregar etiqueta STOP: ${error.response?.statusText ?? error.message}`,
        );
      } else {
        console.error('❌ Error inesperado al agregar STOP:', error);
        throw new Error('Error desconocido al agregar etiqueta STOP');
      }
    }
  }

  // 💾 Simulación de guardado de datos
  private async saveLeadData(data: unknown): Promise<void> {
    console.log('💾 Guardando lead...', data);
    return new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
