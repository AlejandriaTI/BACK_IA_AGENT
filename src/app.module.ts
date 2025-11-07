import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { OllamaModule } from './ollama/ollama.module';
import { ElevenlabsModule } from './elevenlabs/elevenlabs.module';
import { KommoModule } from './kommo/kommo.module';

@Module({
  imports: [OllamaModule, ElevenlabsModule, KommoModule], // 👈 agrégalo aquí
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
