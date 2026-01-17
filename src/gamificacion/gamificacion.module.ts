import { Module } from '@nestjs/common';
import { GamificacionService } from './gamificacion.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [GamificacionService],
  exports: [GamificacionService],
})
export class GamificacionModule {}
