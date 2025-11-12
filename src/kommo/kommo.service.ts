import { Injectable } from '@nestjs/common';
import * as querystring from 'querystring';
import { PIPELINES } from './config/pipeline.config';
import { AIResponse } from './config/ia.config.response';
import { OllamaService } from 'src/ollama/ollama.service';
import axios, { AxiosError, AxiosResponse } from 'axios';
import FormData from 'form-data';
import { Buffer } from 'buffer';
interface KommoAuthResponse {
  access_token: string;
  refresh_token: string;
}

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

@Injectable()
export class KommoService {
  private readonly CLIENT_ID = '6b1ad1dc-32ed-426e-9e60-874ab861ba83';
  private readonly CLIENT_SECRET =
    'mj9C7fVpTeIHZugIcliMY5BJgzWvRWvTzXLVNLCEFLXvncsBqE3rKX5njx7qIjDw';
  private readonly REDIRECT_URI =
    'https://219181eba263.ngrok-free.app/kommo/callback';
  private readonly AUTH_URL = 'https://12348878.kommo.com/oauth2/authorize';
  private readonly TOKEN_URL = 'https://12348878.kommo.com/oauth2/access_token';
  private readonly API_URL = 'https://12348878.kommo.com/api/v4';

  private accessToken = '';
  private refreshToken = '';

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

  // 🔐 Autenticación inicial OAuth2
  async authenticate(code: string): Promise<void> {
    const body = querystring.stringify({
      client_id: this.CLIENT_ID,
      client_secret: this.CLIENT_SECRET,
      code,
      redirect_uri: this.REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const response: AxiosResponse<KommoAuthResponse> = await axios.post(
      this.TOKEN_URL,
      body,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    this.accessToken = response.data.access_token;
    this.refreshToken = response.data.refresh_token;
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
  async refreshAccessToken(): Promise<void> {
    const body = querystring.stringify({
      client_id: this.CLIENT_ID,
      client_secret: this.CLIENT_SECRET,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    });

    const response: AxiosResponse<KommoAuthResponse> = await axios.post(
      this.TOKEN_URL,
      body,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    this.accessToken = response.data.access_token;
    this.refreshToken = response.data.refresh_token;
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
    tipo: 'FRIO' | 'TIBIO',
  ): Promise<void> {
    const pipelineId = PIPELINES.ALEJANDRIA.ID;

    const statusId =
      tipo === 'FRIO' ? PIPELINES.ALEJANDRIA.FRIO : PIPELINES.ALEJANDRIA.TIBIO;

    await this.moveLeadToPipeline(String(leadId), pipelineId, statusId);
  }

  private clasificarLead(text: string): 'FRIO' | 'TIBIO' {
    const t = text.toLowerCase();

    const frio =
      /solo estoy viendo|mas adelante|no tengo dinero|averiguando/i.test(t) ||
      /cuando pueda|cuando junte/i.test(t) ||
      (/precio|costo/.test(t) && !/tesis|universidad|carrera/.test(t));

    if (frio) return 'FRIO';

    const tibio =
      /universidad|carrera|tesis|tsp/i.test(t) ||
      /me interesa|quiero saber|como funciona/i.test(t) ||
      /fecha|entrega|parcial|desde cero/i.test(t);

    if (tibio) return 'TIBIO';

    return 'FRIO';
  }
  // ✅ DETECTAR AGENDAMIENTO
  private detectarAgendamiento(text: string): boolean {
    return /(agendar|reunion|meet|zoom|llamada|podemos hablar)/i.test(
      text.toLowerCase(),
    );
  }

  async processAIMessage(
    prompt: string,
    sessionId: string,
    conversationId: string,
    leadId: number,
  ): Promise<{ success: boolean; type: string }> {
    let aiResp: AIResponse;

    try {
      aiResp = await this.ollamaService.chat(prompt, sessionId);
    } catch (err) {
      console.error('❌ Error ejecutando IA:', err);
      return { success: false, type: 'error' };
    }

    const content = aiResp.content;

    // ✅ Clasificar lead
    const tipo = this.clasificarLead(prompt);
    await this.moverSegunClasificacion(leadId, tipo);

    // ✅ Detectar agendamiento
    if (this.detectarAgendamiento(prompt)) {
      await this.addStopTag(leadId);
    }

    // ✅ Respuesta TEXTUAL
    if (typeof content === 'string') {
      await this.sendChatMessage(conversationId, `<p>${content}</p>`);
      return { success: true, type: 'text' };
    }

    // ✅ AUDIO REAL (sin ESLint errors)
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
