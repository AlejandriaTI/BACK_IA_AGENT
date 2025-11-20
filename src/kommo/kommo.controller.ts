import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { KommoService } from './kommo.service';
import type {
  KommoMessageAdd,
  KommoWebhookBody,
} from './config/ia.config.response';
import { PIPELINES } from './config/pipeline.config';

@Controller('kommo')
export class KommoController {
  constructor(private readonly kommoService: KommoService) {}

  @Get('connect-channel')
  connectChannel(): Promise<any> {
    return this.kommoService.connectChannel();
  }

  @Get('leads')
  getLeads(): Promise<any> {
    return this.kommoService.getLeads();
  }

  @Get('test')
  async testAccess(): Promise<any> {
    return this.kommoService.testAccess();
  }

  // 🟣 WEBHOOK REAL
  @Post('incoming/:scope_id')
  async incomingFromKommo(
    @Param('scope_id') scopeId: string,
    @Body() body: KommoWebhookBody,
  ): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
    ignored?: boolean;
  }> {
    console.log('📩 Webhook de Kommo recibido:');
    console.log(JSON.stringify(body, null, 2));

    try {
      const add: KommoMessageAdd | undefined = body.message?.add?.[0];

      if (!add) {
        console.warn('⚠️ No es message.add, ignorando...');
        return { success: true, ignored: true };
      }

      const prompt: string =
        add.text?.trim() || add.text_original?.trim() || '';

      const audioUrl: string | null =
        add.attachment?.type === 'voice' ? add.attachment.link : null;

      const conversationId: string = add.chat_id;
      const leadId: number = Number(add.entity_id ?? add.element_id ?? 0);
      const sessionId: string = conversationId || 'default';

      if (!prompt && !audioUrl) {
        return { success: false, error: 'Mensaje vacío' };
      }

      if (!conversationId) {
        return { success: false, error: 'conversationId faltante' };
      }

      if (!leadId) {
        return { success: false, error: 'leadId faltante' };
      }

      // 🟣 1. Obtener información del lead para conocer su pipeline real
      const lead = await this.kommoService.getLeadById(leadId);
      const pipelineId = lead.pipeline_id;

      // 🟣 2. Filtro por embudo PRUEBA
      const PIPELINE_PRUEBA_ID = PIPELINES.PRUEBA.ID;

      if (pipelineId !== PIPELINE_PRUEBA_ID) {
        console.log(
          `🔕 Lead ${leadId} NO está en el embudo PRUEBA. Ignorando mensaje.`,
        );
        return { success: true, ignored: true };
      }

      // 🧠 IA solo responde si pertenece al embudo PRUEBA
      const result = await this.kommoService.processAIMessage(
        prompt,
        sessionId,
        conversationId,
        leadId,
      );

      return { success: true, result };
    } catch (error) {
      console.error('❌ Error procesando mensaje:', error);
      return { success: false, error: (error as Error).message };
    }
  }
}
