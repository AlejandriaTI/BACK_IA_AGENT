// src/webhook/webhook.controller.ts

import { Controller, Post, Body } from '@nestjs/common';
import { OllamaService } from '../ollama/ollama.service'; // Asegúrate de importar el servicio adecuado

@Controller('webhook')
export class WebhookController {
  constructor(private readonly ollamaService: OllamaService) {}

  @Post()
  async recibirLead(@Body() body: { lead: any; audio?: string }) {
    const { lead, audio } = body;

    // Si hay audio, lo transcribimos
    if (audio) {
      const transcripcion = await this.ollamaService.transcribirAudio(audio);

      // Luego analizamos la transcripción
      const respuesta = await this.ollamaService.chat(
        transcripcion,
        lead.sessionId,
      );

      // Devolvemos la respuesta
      return respuesta;
    }

    // Si no hay audio, procesamos solo el mensaje
    const respuesta = await this.ollamaService.chat(
      lead.message,
      lead.sessionId,
    );
    return respuesta;
  }
}
