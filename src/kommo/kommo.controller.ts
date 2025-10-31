import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { KommoService } from './kommo.service';
// Define los tipos de los datos esperados en el cuerpo del webhook
export interface WebhookBody {
  lead_id: string;
  status: string;
  [key: string]: any; // Puedes agregar más campos según lo que necesites recibir
}

// Define el tipo de respuesta que esperas retornar
export interface WebhookResponse {
  success: boolean;
  message?: string;
}

@Controller('kommo')
export class KommoController {
  constructor(private readonly kommoService: KommoService) {}

  // Endpoint para iniciar el flujo de autenticación con Kommo
  @Get('auth')
  authenticate(@Query('code') code: string): Promise<void> {
    return this.kommoService.authenticate(code);
  }

  // Endpoint para obtener los leads desde Kommo
  @Get('leads')
  getLeads(): Promise<any> {
    return this.kommoService.getLeads();
  }

  @Post('webhook')
  async handleWebhook(@Body() body: WebhookBody): Promise<WebhookResponse> {
    return await this.kommoService.handleWebhook(body);
  }
}
