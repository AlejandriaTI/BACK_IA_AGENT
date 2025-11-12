import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { KommoService } from './kommo.service';
import type { Response as ExpressResponse } from 'express';

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

  @Get('authorize')
  authorize(@Res() res: ExpressResponse): void {
    const url =
      'https://12348878.kommo.com/oauth2/authorize?client_id=6b1ad1dc-32ed-426e-9e60-874ab861ba83&redirect_uri=https://704e98cba053.ngrok-free.app/kommo/auth&response_type=code';

    console.log('🔗 URL de autorización generada:', url);
    res.redirect(url);
  }

  @Get('auth')
  async authenticate(@Query('code') code: string) {
    try {
      console.log('✅ CODE recibido de Kommo:', code);

      await this.kommoService.authenticate(code);

      return `
      <html>
        <body style="font-family: sans-serif; padding: 40px;">
          <h1>✅ Integración autorizada correctamente</h1>
          <p>Ya podés cerrar esta pestaña.</p>
        </body>
      </html>
      `;
    } catch (error) {
      console.error('❌ Error autenticando:', error);
      return 'Error autenticando integración.';
    }
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
