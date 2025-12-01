import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import * as dotenv from 'dotenv';
import FormData from 'form-data';

dotenv.config();

interface ElevenLabsSTTResponse {
  text: string;
}

@Injectable()
export class ElevenlabsService {
  private readonly ttsKey: string;
  private readonly sttKey: string;
  private readonly apiUrl: string;
  private readonly voiceId: string;

  constructor() {
    this.ttsKey = process.env.ELEVENLABS_API_KEY_TTS || '';
    this.sttKey = process.env.ELEVENLABS_API_KEY_STT || '';
    this.apiUrl =
      process.env.ELEVENLABS_API_URL || 'https://api.elevenlabs.io/v1';
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'oYBnOnwnfG6w5YK4xE3C';

    if (!this.ttsKey || !this.sttKey) {
      throw new Error('❌ API Keys de ElevenLabs faltantes en .env');
    }
  }

  async textToSpeech(text: string): Promise<Buffer> {
    const url = `${this.apiUrl}/text-to-speech/${this.voiceId}`;

    const body = {
      text: `<prosody rate="330%">${text}</prosody>`,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.7,
      },
      audio_speed: 3.0,
    };

    const response = await axios.post(url, body, {
      headers: {
        'xi-api-key': this.ttsKey,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
    });

    return response.data as Buffer;
  }

  async speechToText(audioBuffer: Buffer): Promise<string> {
    const url = `${this.apiUrl}/speech-to-text`;

    const form = new FormData();

    form.append('file', audioBuffer, {
      filename: 'audio.input',
      contentType: 'application/octet-stream',
    });

    form.append('model_id', 'scribe_v1');

    const response: AxiosResponse<ElevenLabsSTTResponse> = await axios.post(
      url,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'xi-api-key': this.sttKey,
        },
      },
    );

    return response.data.text; // ✅ texto limpio
  }
}
