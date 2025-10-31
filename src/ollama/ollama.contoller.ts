import { Body, Controller, Post } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { v4 as uuidv4 } from 'uuid';

@Controller('ollama')
export class OllamaController {
  constructor(private readonly ollamaService: OllamaService) {}

  @Post('chat')
  async chatPost(@Body() body: { prompt: string }) {
    if (!body?.prompt || typeof body.prompt !== 'string') {
      return { error: 'Falta o es inválido el campo "prompt" en el JSON.' };
    }

    const sessionId = uuidv4(); // 🆕 genera una sesión única
    const response = await this.ollamaService.chat(body.prompt, sessionId);

    return {
      success: true,
      prompt: body.prompt,
      sessionId,
      response,
    };
  }
}
