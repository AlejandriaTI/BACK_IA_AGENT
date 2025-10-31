import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class ElevenlabsService {
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY || '';
    this.apiUrl = process.env.ELEVENLABS_API_URL || '';
    if (!this.apiKey || !this.apiUrl) {
      throw new Error('API key or API URL is missing in .env file');
    }
  }

  // Método para convertir texto a voz
  async textToSpeech(text: string): Promise<Buffer> {
    const response = await axios.post(
      `${this.apiUrl}/text-to-speech`, // Ajusta la URL de la API de ElevenLabs
      { text },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer', // Especifica que esperamos un array de bytes (audio)
      },
    );

    return response.data as Buffer; // Hacemos un casting explícito a Buffer
  }
}
