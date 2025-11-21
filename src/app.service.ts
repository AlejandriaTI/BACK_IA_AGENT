import { Injectable, OnModuleInit } from '@nestjs/common';
import { KommoService } from './kommo/kommo.service';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(private readonly kommoService: KommoService) {}

  async onModuleInit(): Promise<void> {
    console.log('🚀 AppService iniciado → Conectando canal de Kommo...');

    try {
      const res = await this.kommoService.connectChannel();
      console.log('✅ Canal conectado:', res);
    } catch (err) {
      console.error('❌ Error al conectar canal Kommo:', err);
    }
  }
}
