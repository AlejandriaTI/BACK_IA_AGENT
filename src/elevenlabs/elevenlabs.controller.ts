import { Controller, Post, Body } from '@nestjs/common';
import { ElevenlabsService } from './elevenlabs.service';

@Controller('elevenlabs')
export class ElevenlabsController {
  constructor(private readonly elevenlabsService: ElevenlabsService) {}

  @Post('text-to-speech')
  async textToSpeech(@Body('text') text: string) {
    try {
      const audio = await this.elevenlabsService.textToSpeech(text);
      console.log('Audio generado:', audio); // Aquí el audio estará en un buffer (debe ser manejado de acuerdo al tipo de contenido)

      return { success: true, message: 'Audio generado correctamente' };
    } catch (error) {
      console.error('Error al convertir texto a voz:', error);
      return { success: false, error: 'Error al convertir texto a voz' };
    }
  }
}
