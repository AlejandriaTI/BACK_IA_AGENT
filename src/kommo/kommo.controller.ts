import { Body, Controller, Param, Post } from '@nestjs/common';
import { KommoService } from './kommo.service';
import type {
  KommoMessageAdd,
  KommoWebhookBody,
} from './config/ia.config.response';
import { PIPELINES } from './config/pipeline.config';

@Controller('kommo')
export class KommoController {
  constructor(private readonly kommoService: KommoService) {}

  // 🟣 WEBHOOK REAL
  @Post(['incoming', 'incoming/:scope_id'])
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

      // Obtener información del lead para conocer su pipeline real
      console.log(`🔍 Buscando lead ${leadId} en Kommo...`);
      const lead = await this.kommoService.getLeadById(leadId);
      console.log(
        '📄 Datos del lead recibidos:',
        JSON.stringify(lead, null, 2),
      );

      const pipelineId = lead.pipeline_id;

      // Filtro por embudo PRUEBA
      const PIPELINE_PRUEBA_ID = PIPELINES.PRUEBA.ID;
      console.log(
        `⚙️ Pipeline ID del Lead: ${pipelineId} | Esperado: ${PIPELINE_PRUEBA_ID}`,
      );

      if (pipelineId !== PIPELINE_PRUEBA_ID) {
        console.log(
          `🔕 Lead ${leadId} NO está en el embudo PRUEBA. Ignorando mensaje.`,
        );
        return { success: true, ignored: true };
      }

      const expectedScopeId = process.env.KOMMO_SCOPE_ID;

      if (
        scopeId &&
        scopeId !== ':scope_id' &&
        expectedScopeId &&
        scopeId !== expectedScopeId
      ) {
        console.warn(
          `⛔ Webhook rechazado: scope_id inválido (${scopeId}) vs esperado (${expectedScopeId})`,
        );
        return { success: false, error: 'Scope ID inválido' };
      }

      if (scopeId === ':scope_id') {
        console.warn(
          '⚠️ Webhook recibido con scope_id literal ":scope_id". Verifique la configuración del webhook en Kommo.',
        );
      }

      // IA solo responde si pertenece al embudo PRUEBA
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
