import { Module } from '@nestjs/common';
import { EmpresasController } from './empresas.controller';
import { EmpresasService } from './empresas.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [EmpresasController],
  providers: [EmpresasService],
  exports: [EmpresasService],
})
export class EmpresasModule {}
