import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { v4 as uuidv4 } from 'uuid';
import { OllamaService } from './ollama.service';
import type { Express } from 'express'; // ✅ Import type para metadata segura
import multer from 'multer';
import { ElevenlabsService } from 'src/elevenlabs/elevenlabs.service';

@Controller('ollama')
export class OllamaController {
  constructor(
    private readonly ollamaService: OllamaService,
    private readonly elevenlabsService: ElevenlabsService,
  ) {}

  @Post('chat')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  async chatPost(
    @Body() body: { prompt: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    const sessionId = uuidv4();

    let textToSend = body?.prompt ?? '';

    // ✅ Si viene audio, primero lo convertimos a texto
    if (file) {
      console.log('🎤 Audio recibido en memoria:', file.originalname);

      if (!file.buffer) {
        throw new BadRequestException('El archivo no contiene buffer.');
      }

      // ✅ Convertir audio → texto ANTES del chat
      textToSend = await this.elevenlabsService.speechToText(file.buffer);

      console.log('📜 Texto obtenido del audio:', textToSend);
    }

    // ✅ Ahora SÍ se envía solamente texto al chat
    const response = await this.ollamaService.chat(
      textToSend, // ✅ SIEMPRE STRING
      sessionId,
    );

    return {
      success: true,
      prompt: textToSend,
      sessionId,
      response,
    };
  }
}
