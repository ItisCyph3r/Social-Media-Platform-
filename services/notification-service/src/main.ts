import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  // Create HTTP server (for WebSocket)
  const httpApp = await NestFactory.create(AppModule);
  const httpPort = process.env.PORT || 3006;
  await httpApp.listen(httpPort);
  console.log(`[Notification Service] HTTP server listening on port ${httpPort}`);
  console.log(`[Notification Service] WebSocket available at ws://localhost:${httpPort}/notifications`);

  // Create gRPC microservice
  const grpcApp = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'notification',
        protoPath: join(__dirname, '../../../shared/protos/notification.proto'),
        url: process.env.GRPC_URL || '0.0.0.0:5006',
        loader: {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
        },
      },
    },
  );

  await grpcApp.listen();
  console.log(`[Notification Service] gRPC server listening on port ${process.env.GRPC_URL || '5006'}`);
}

bootstrap();
