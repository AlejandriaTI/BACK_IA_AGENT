import { forwardRef, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { KommoService } from './kommo.service';
import { OllamaModule } from 'src/ollama/ollama.module';
import { KommoController } from './kommo.controller';

@Module({
  imports: [
    HttpModule,
    ScheduleModule.forRoot(),
    forwardRef(() => OllamaModule),
  ],
  controllers: [KommoController],
  providers: [KommoService],
  exports: [KommoService],
})
export class KommoModule {}
