import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { KommoService } from './kommo.service';

// ✅ Tipos reales del webhook de Kommo
interface KommoIncomingMessage {
  message?: {
    text?: string;
    text_original?: string;
  };
  conversation_id?: string | number;
  lead_id?: string | number;
  entity_id?: string | number;
}

@Controller('kommo')
export class KommoController {
  constructor(private readonly kommoService: KommoService) {}

  @Get('auth')
  authenticate(@Query('code') code: string): Promise<void> {
    return this.kommoService.authenticate(code);
  }

  @Get('leads')
  getLeads(): Promise<any> {
    return this.kommoService.getLeads();
  }

  // ✅ Webhook legacy
  @Post('webhook')
  async handleWebhook(@Body() body: any): Promise<any> {
    return this.kommoService.handleWebhook(body);
  }

  // ✅ Webhook para mensajes entrantes REAL
  @Post('incoming')
  async incomingFromKommo(@Body() body: KommoIncomingMessage): Promise<any> {
    console.log('📩 Webhook de Kommo recibido:');
    console.log(JSON.stringify(body, null, 2));

    try {
      // ✅ Tipado seguro (sin acceso inseguro a any)
      const prompt = body.message?.text ?? body.message?.text_original ?? '';

      const conversationId = String(body.conversation_id ?? '');
      const sessionId = conversationId || 'default';

      const leadId = Number(body.lead_id ?? body.entity_id ?? 0);

      console.log('➡️ prompt:', prompt);
      console.log('➡️ sessionId:', sessionId);
      console.log('➡️ conversationId:', conversationId);
      console.log('➡️ leadId:', leadId);

      if (!prompt) {
        console.error('❌ Error: mensaje entrante vacío.');
        return { success: false, error: 'Mensaje vacío' };
      }

      if (!conversationId) {
        console.error('❌ Error: conversationId vacío.');
        return { success: false, error: 'conversationId faltante' };
      }

      if (!leadId) {
        console.error('❌ Error: leadId vacío.');
        return { success: false, error: 'LeadID faltante' };
      }

      // ✅ Llamada segura
      const result = await this.kommoService.processAIMessage(
        prompt,
        sessionId,
        conversationId,
        leadId,
      );

      return {
        success: true,
        result,
      };
    } catch (error) {
      console.error('❌ Error procesando mensaje de Kommo:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}
