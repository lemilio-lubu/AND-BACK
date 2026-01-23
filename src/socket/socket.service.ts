import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';

@Injectable()
export class SocketService {
  public server: Server | null = null;

  // Método para asignar la instancia del servidor (llamado desde el Gateway)
  setServer(server: Server) {
    this.server = server;
  }

  // Notificar a un usuario específico (e.g. Empresa)
  notifyUser(userId: string, event: string, payload: any) {
    if (this.server) {
      this.server.to(`user:${userId}`).emit(event, payload);
    }
  }

  // Notificar a todos los administradores
  notifyAdmins(event: string, payload: any) {
    if (this.server) {
      this.server.to('role:admin').emit(event, payload);
    }
  }

  // Emitir a todos
  emitToAll(event: string, payload: any) {
    if (this.server) {
      this.server.emit(event, payload);
    }
  }
}
