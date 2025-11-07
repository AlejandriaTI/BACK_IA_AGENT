import { forwardRef, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { KommoService } from './kommo.service';
import { KommoCleanupTask } from './task/kommo-cleanup.task';
import { OllamaModule } from 'src/ollama/ollama.module';
import { KommoController } from './kommo.controller';

@Module({
  imports: [
    HttpModule,
    ScheduleModule.forRoot(),
    forwardRef(() => OllamaModule),
  ],
  controllers: [KommoController], // ✅ AQUÍ ESTÁ LA MAGIA
  providers: [KommoService, KommoCleanupTask],
  exports: [KommoService],
})
export class KommoModule {}
