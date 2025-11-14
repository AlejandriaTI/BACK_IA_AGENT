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
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  constructor(private readonly ollamaService: OllamaService) {
    this.baseUrl = `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com`;

    this.headers = {
      Authorization: `Bearer ${process.env.KOMMO_KEY_DURATION}`,
      'Content-Type': 'application/json',
    };
  }

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

    await this.moveLeadToPipeline(Number(leadId), pipelineId, statusId);
  }

  async processAIMessage(
    prompt: string,
    sessionId: string,
    conversationId: string,
    leadId: number,
  ): Promise<{ success: boolean; type: string }> {
    try {
      // ------------------------------------------------------------------
      // 1) Verificar STOP
      // ------------------------------------------------------------------
      const tieneStop = await this.hasStopTag(leadId);
      if (tieneStop) {
        console.log(`⛔ Lead ${leadId} tiene STOP, no respondemos.`);
        return { success: true, type: 'ignored' };
      }

      // ------------------------------------------------------------------
      // 2) Llamar a la IA
      // ------------------------------------------------------------------
      const aiResp: AIResponse = await this.ollamaService.chat(
        {
          sessionId,
          kommo: true,
          conversationId,
          leadId,
        } as any,
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

  // 🤖 Enviar mensaje vía Salesbot a conversación activa
  async sendViaSalesbot(
    conversationId: string,
    message: string,
  ): Promise<void> {
    const url = `${this.API_URL}/salesbot/send`;

    const body = {
      conversation_id: conversationId,
      message: {
        type: 'text',
        text: message,
      },
    };

    try {
      const res = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✅ Mensaje enviado vía Salesbot:', res.data);
    } catch (err) {
      const error = err as AxiosError;
      console.error(
        '❌ Error al enviar mensaje vía Salesbot:',
        error.response?.data ?? error.message,
      );
      throw error;
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
