import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const httpApp = await NestFactory.create(AppModule);
  const httpPort = process.env.PORT || 3004;
  await httpApp.listen(httpPort);
  console.log(`[Message Service] HTTP server listening on port ${httpPort}`);
  console.log(`[Message Service] WebSocket available at ws://localhost:${httpPort}/messages`);

  const grpcApp = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'message',
        protoPath: join(__dirname, '../../../shared/protos/message.proto'),
        url: process.env.GRPC_URL || '0.0.0.0:5004',
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
  console.log(`[Message Service] gRPC server listening on port ${process.env.GRPC_URL || '5004'}`);
}

bootstrap();
