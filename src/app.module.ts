import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { EmpresasModule } from './empresas/empresas.module';
import { FacturacionModule } from './facturacion/facturacion.module';
import { GamificacionModule } from './gamificacion/gamificacion.module';
import { SocketModule } from './socket/socket.module';
import { SupabaseModule } from './supabase/supabase.module'; 

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    EmpresasModule,
    FacturacionModule,
    GamificacionModule,
    SocketModule,
    SupabaseModule, // Importar SupabaseModule para usar SupabaseService en AppService
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
