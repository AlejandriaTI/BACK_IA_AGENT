import { Module } from '@nestjs/common';
import { ElevenlabsService } from './elevenlabs.service';
import { ElevenlabsController } from './elevenlabs.controller';

@Module({
  controllers: [ElevenlabsController],
  providers: [ElevenlabsService],
  exports: [ElevenlabsService], // ✅ ¡ESTO ES LO QUE FALTABA!
})
export class ElevenlabsModule {}
