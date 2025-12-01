import {
  Controller,
  Post,
  Body,
  Res,
  UseInterceptors,
  BadRequestException,
  UploadedFile,
} from '@nestjs/common';
import { ElevenlabsService } from './elevenlabs.service';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';

@Controller('elevenlabs')
export class ElevenlabsController {
  constructor(private readonly elevenlabsService: ElevenlabsService) {}
  @Post('stt')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
    }),
  )
  async speechToText(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Debes enviar un archivo de audio.');
    }

    console.log('📥 Archivo recibido en memoria:', file.originalname);
    console.log('📦 Tamaño:', file.buffer.length, 'bytes');

    const text = await this.elevenlabsService.speechToText(file.buffer);

    return {
      success: true,
      transcript: text,
      size: file.buffer.length,
    };
  }
  @Post('text-to-speech')
  async textToSpeech(@Body('text') text: string, @Res() res: Response) {
    try {
      const audio = await this.elevenlabsService.textToSpeech(text);

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'inline; filename="speech.mp3"',
      });

      res.send(audio);
    } catch (error) {
      console.error('Error al convertir texto a voz:', error);
      res.status(500).json({
        success: false,
        error: 'Error al convertir texto a voz',
      });
    }
  }
}
