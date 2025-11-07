import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OllamaService } from './ollama.service';
import { OllamaController } from './ollama.contoller';
import { ElevenlabsModule } from 'src/elevenlabs/elevenlabs.module';

@Module({
  imports: [HttpModule, ElevenlabsModule],
  controllers: [OllamaController],
  providers: [OllamaService],
  exports: [OllamaService], // 👈 IMPORTANTE: esto hace disponible el servicio fuera del módulo
})
export class OllamaModule {}
