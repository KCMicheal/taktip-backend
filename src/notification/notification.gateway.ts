import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

/** Shape of the decoded JWT payload (only the fields we need). */
interface JwtPayload {
  sub: string;
}

/** Augment Socket.data so TypeScript knows about userId. */
interface AuthenticatedSocket extends Socket {
  data: { userId?: string; [key: string]: unknown };
}

@WebSocketGateway({
  cors: {
    origin: '*', // Will be restricted by env variable in production
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
@Injectable()
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private readonly connectedUsers = new Map<string, Set<string>>(); // userId → Set<socketId>

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  handleConnection(client: AuthenticatedSocket): void {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn('Connection rejected: No token provided');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token as string);
      const userId = payload.sub;

      if (!userId) {
        this.logger.warn('Connection rejected: Invalid token payload');
        client.disconnect();
        return;
      }

      // Store connection
      client.data.userId = userId;
      void client.join(`user:${userId}`);

      // Track connected sockets per user
      if (!this.connectedUsers.has(userId)) {
        this.connectedUsers.set(userId, new Set());
      }
      this.connectedUsers.get(userId)!.add(client.id);

      this.logger.log(
        `Client connected: ${client.id} (user: ${userId}) ` +
          `[${this.connectedUsers.get(userId)?.size ?? 0} connections]`,
      );
    } catch (error) {
      this.logger.warn(`Connection rejected: ${(error as Error).message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const userId = client.data?.userId;

    if (userId) {
      const userSockets = this.connectedUsers.get(userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(userId);
        }
      }

      this.logger.log(
        `Client disconnected: ${client.id} (user: ${userId}) ` +
          `[${this.connectedUsers.get(userId)?.size ?? 0} connections]`,
      );
    }
  }

  /**
   * Send a notification to a specific user.
   * Sends to all connected sockets for that user.
   */
  sendToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  /**
   * Send updated unread count to a user.
   */
  sendUnreadCount(userId: string, count: number): void {
    this.server.to(`user:${userId}`).emit('unread-count', { count });
  }

  /**
   * Check if a user has any active connections.
   */
  isUserConnected(userId: string): boolean {
    const sockets = this.connectedUsers.get(userId);
    return !!sockets && sockets.size > 0;
  }

  /**
   * Get the number of connected sockets for a user.
   */
  getConnectionCount(userId: string): number {
    return this.connectedUsers.get(userId)?.size ?? 0;
  }
}
