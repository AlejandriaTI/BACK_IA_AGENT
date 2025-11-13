import { Injectable } from '@nestjs/common';
import { PIPELINES } from './config/pipeline.config';
import { AIResponse } from './config/ia.config.response';
import { OllamaService } from 'src/ollama/ollama.service';
import axios, { AxiosError, AxiosResponse } from 'axios';
import FormData from 'form-data';
import { Buffer } from 'buffer';

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

@Injectable()
export class KommoService {
  private readonly KOMMO_DOMAIN = process.env.KOMMO_SUBDOMAIN;
  private readonly API_URL = `https://${this.KOMMO_DOMAIN}.kommo.com/api/v4`;

  // 🔥 Token de larga duración (no expira por meses)
  private readonly accessToken = process.env.KOMMO_KEY_DURATION;

  constructor(private readonly ollamaService: OllamaService) {}

  private isAudioContent(
    content: unknown,
  ): content is { isAudio: true; mimeType: string; base64: string } {
    return (
      typeof content === 'object' &&
      content !== null &&
      'isAudio' in content &&
      (content as { isAudio: unknown }).isAudio === true &&
      'mimeType' in content &&
      'base64' in content
    );
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
        account: response.data, // ya no es any
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

  // 🔄 Mover lead entre embudos
  async moveLeadToPipeline(
    leadId: string | number,
    pipelineId: number,
    statusId: number,
  ): Promise<unknown> {
    if (!this.accessToken) throw new Error('Token no disponible.');

    const body = [{ id: leadId, pipeline_id: pipelineId, status_id: statusId }];

    try {
      const response = await axios.patch(`${this.API_URL}/leads`, body, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      console.log(
        `✅ Lead ${leadId} movido a pipeline ${pipelineId}, status ${statusId}`,
      );
      return response.data;
    } catch (err) {
      const error = err as AxiosError;
      console.error(
        '❌ Error al mover lead:',
        error.response?.data ?? error.message,
      );
      throw error;
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

  // 🔁 Refrescar token

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
  async sendChatMessage(conversationId: string, html: string): Promise<void> {
    const url = `${this.API_URL}/chats/messages`;

    const body = {
      message: {
        type: 'rich_text',
        text: html,
      },
      conversation_id: conversationId,
    };

    await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('✅ Mensaje enviado');
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

    await this.moveLeadToPipeline(String(leadId), pipelineId, statusId);
  }

  async processAIMessage(
    prompt: string,
    sessionId: string,
    conversationId: string,
    leadId: number,
  ): Promise<{ success: boolean; type: string }> {
    // 🔍 1) NO RESPONDER si tiene STOP (ANTES de llamar a IA)
    const tieneStop = await this.hasStopTag(leadId);
    if (tieneStop) {
      console.log('⛔ Lead con STOP, no respondemos.');
      return { success: true, type: 'ignored' };
    }

    // 2) Procesar con IA
    let aiResp: AIResponse;
    try {
      aiResp = await this.ollamaService.chat(prompt, sessionId);
    } catch (err) {
      console.error('❌ Error ejecutando IA:', err);
      return { success: false, type: 'error' };
    }

    const content = aiResp.content;
    const tipoIA = aiResp.registro?.tipo;

    // 3) Convertir tipo interno → pipeline comercial
    let tipo: 'FRIO' | 'TIBIO' | 'COTIZACION' | 'MARKETING' = 'FRIO';

    switch (tipoIA) {
      case 'FRIO':
        tipo = 'FRIO';
        break;

      case 'TIBIO':
        tipo = 'TIBIO';
        break;

      case 'lead_educativo':
        tipo = 'MARKETING';
        break;

      case 'trabajo_puntual':
      case 'solicitud-documento-inmediata':
      case 'solicitud-documento-cotizacion':
        tipo = 'COTIZACION';
        break;

      default:
        tipo = 'FRIO';
        break;
    }

    // 4) Mover al pipeline una sola vez
    await this.moverSegunClasificacion(leadId, tipo);

    // 5) Si DEJA DE SER FRÍO → poner STOP
    if (tipo !== 'FRIO') {
      console.log('🛑 El lead dejó de ser FRÍO. Agregando STOP...');
      await this.addStopTag(leadId);
    }

    // 6) Crear mensaje según si es texto o audio
    if (typeof content === 'string') {
      await this.sendChatMessage(conversationId, `<p>${content}</p>`);
      return { success: true, type: 'text' };
    }

    if (this.isAudioContent(content)) {
      try {
        await this.sendRealAudioMessage(
          conversationId,
          content.mimeType,
          content.base64,
        );

        return { success: true, type: 'audio' };
      } catch (error) {
        console.error('❌ Error al enviar audio real a Kommo:', error);
        return { success: false, type: 'audio-error' };
      }
    }

    console.warn('⚠️ Contenido desconocido recibido:', content);
    return { success: false, type: 'unknown' };
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

  async deleteLead(leadId: number): Promise<void> {
    await axios.delete(`${this.API_URL}/leads/${leadId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
  }

  // 💾 Simulación de guardado de datos
  private async saveLeadData(data: unknown): Promise<void> {
    console.log('💾 Guardando lead...', data);
    return new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
