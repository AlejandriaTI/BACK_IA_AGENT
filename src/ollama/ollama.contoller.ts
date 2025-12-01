import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OllamaService } from './ollama.service';
import multer from 'multer';
import { ElevenlabsService } from 'src/elevenlabs/elevenlabs.service';
import { obtenerSessionId } from 'src/utils/session.util';
import type { Request as ExpressRequest } from 'express';

@Controller('ollama')
export class OllamaController {
  constructor(
    private readonly ollamaService: OllamaService,
    private readonly elevenlabsService: ElevenlabsService,
  ) {}

  @Post('chat')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  async chatPost(
    @Req() req: ExpressRequest,
    @Body() body: { prompt: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    const sessionId = obtenerSessionId(req); // usa la lógica del hash
    let textToSend = body?.prompt ?? '';
    let fileRecibido: { name: string; mimeType: string } | undefined;

    if (file) {
      console.log('📎 Archivo recibido:', file.originalname);

      const mime = file.mimetype;
      const isAudio = mime.startsWith('audio/');
      const isDoc = mime === 'application/pdf' || mime.includes('word');

      if (isAudio) {
        if (!file.buffer) {
          throw new BadRequestException(
            'El archivo de audio no tiene contenido.',
          );
        }

        textToSend = await this.elevenlabsService.speechToText(file.buffer);
        console.log('📜 Texto obtenido del audio:', textToSend);
      } else if (isDoc) {
        fileRecibido = {
          name: file.originalname,
          mimeType: file.mimetype,
        };
      } else {
        throw new BadRequestException('Tipo de archivo no soportado.');
      }
    }

    const response = await this.ollamaService.chat(
      req,
      textToSend,
      fileRecibido,
    );

    return {
      success: true,
      prompt: textToSend,
      sessionId,
      response,
    };
  }
}
