import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SocketService } from './socket.service';

@WebSocketGateway({
  cors: {
    origin: '*', // Ajustar en producción a la URL del frontend
    credentials: true,
  },
  namespace: '/',
})
export class SocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer() server: Server;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private socketService: SocketService,
  ) {}

  afterInit(server: Server) {
    this.socketService.setServer(server);
    console.log('✅ WebSocket Gateway inicializado');
  }

  async handleConnection(client: Socket) {
    try {
      // 1. Obtener Token
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        // console.log('❌ Cliente desconectado: No token provided');
        client.disconnect();
        return;
      }

      // 2. Validar Token
      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret });

      if (!payload || !payload.sub) {
        client.disconnect();
        return;
      }

      // 3. Unir a Salas
      const userId = payload.sub;
      const role = payload.role;

      // Sala personal
      await client.join(`user:${userId}`);
      
      // Sala por rol
      if (role) {
        await client.join(`role:${role}`);
      }

      console.log(`🔌 Cliente conectado: ${userId} (Rol: ${role})`);

    } catch (error) {
    //   console.error('❌ Error de conexión WS:', error.message);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // console.log(`🔌 Cliente desconectado: ${client.id}`);
  }
}
