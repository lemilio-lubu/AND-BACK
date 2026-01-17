import { Module } from '@nestjs/common';
import { FacturacionController } from './facturacion.controller';
import { FacturacionService } from './facturacion.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { GamificacionModule } from '../gamificacion/gamificacion.module';

@Module({
  imports: [SupabaseModule, GamificacionModule],
  controllers: [FacturacionController],
  providers: [FacturacionService],
  exports: [FacturacionService],
})
export class FacturacionModule {}
