import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KommoService } from 'src/kommo/kommo.service';
import { differenceInDays } from 'date-fns';

interface KommoLead {
  id: number;
  updated_at: number;
  status_id: number;
}

interface KommoLeadsResponse {
  _embedded?: {
    leads?: KommoLead[];
  };
}

@Injectable()
export class KommoCleanupTask {
  constructor(private readonly kommoService: KommoService) {}

  // 🕘 Se ejecuta todos los días a las 9:00 AM
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runCleanup(): Promise<void> {
    console.log('🧹 Ejecutando limpieza automática de leads...');

    try {
      const response = await this.kommoService.getLeads();
      const leadsResponse = (response as Partial<KommoLeadsResponse>) ?? {};
      const leads = leadsResponse._embedded?.leads ?? [];

      const now = new Date();

      for (const lead of leads) {
        if (typeof lead.updated_at !== 'number') continue;

        // ✅ Reemplazo directo sin `fromUnixTime`
        const lastUpdated = new Date(lead.updated_at * 1000);
        const diffDays = differenceInDays(now, lastUpdated);

        // 🚮 Más de 30 días → eliminar lead
        if (diffDays > 30 && lead.status_id === 95523032) {
          await this.kommoService.deleteLead(lead.id);
          console.log(
            `🚮 Lead ${lead.id} eliminado (${diffDays} días inactivo)`,
          );
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('❌ Error en KommoCleanupTask:', error.message);
      } else {
        console.error(
          '❌ Error desconocido en KommoCleanupTask:',
          String(error),
        );
      }
    }
  }
}
